import "server-only";
import { db } from "@/db";
import { capabilities, devices, plans, policies, receipts, users } from "@/db/schema";
import { buildCompatibility, decide, generatePlan } from "@/lib/engine";
import { hashPassword } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { authMethodFor, newReceiptRef, receiptPayload, signPayload } from "@/lib/phase1";
import { SAMPLE_MANIFEST, capabilityFromManifest, signManifest, verifyManifest } from "@/lib/mcp";

export const DEMO_EMAIL = "demo@aiphone.studio";
export const DEMO_PASSWORD = "robot1234";

const CAPS = [
  {
    slug: "voice-calling", name: "Voice Calling", publisher: "AI Phone", category: "Telephony", executor: "voice", level: 3, verified: true, status: "installed",
    description: "Place and receive Wi-Fi calls through Twilio or Telnyx with device-scoped tokens.",
    can: ["Place outbound calls on the assigned business number", "Answer incoming calls via push", "Log calls with duration"],
    cannot: ["Record without consent", "Change number assignment", "Dial premium or emergency numbers autonomously"],
    dataAccess: ["Contact name", "Phone number", "Call duration"],
    tools: [{ name: "place_call", risk: "consequential", confirmation: "required", evidence: ["call_log", "transcript_consent"] }],
    permissions: ["voice.outbound", "voice.inbound", "contacts.read"], networkDestinations: ["voice.twilio.com", "rtc.telnyx.com"],
  },
  {
    slug: "fleet-os", name: "Fleet OS", publisher: "Fleet OS Inc.", category: "Field Service", executor: "mcp", level: 2, verified: true, status: "installed",
    description: "Work orders, estimates, and dispatch data via a verified MCP server.",
    can: ["View work orders", "Draft estimates", "Check job status"],
    cannot: ["Approve estimates", "Close jobs", "Change pricing tables"],
    dataAccess: ["Customer name", "Job address", "Work order line items"],
    tools: [
      { name: "get_work_order", risk: "read", confirmation: "none", evidence: ["record_snapshot"] },
      { name: "draft_estimate", risk: "prepare", confirmation: "required", evidence: ["draft_id", "line_items"] },
    ],
    permissions: ["fleet.workorders.read", "fleet.estimates.draft"], networkDestinations: ["mcp.fleetos.app"],
  },
  {
    slug: "web-butler", name: "Web Butler", publisher: "Tyreese Burton", category: "Browser", executor: "playwright", level: 3, verified: true, status: "installed",
    description: "Hosted Playwright worker for websites without APIs. Approved domains only, visible live session, screenshot evidence.",
    can: ["Operate approved websites", "Fill forms without submitting", "Capture screenshots and action logs", "Download to quarantine"],
    cannot: ["Enter passwords supplied by the model", "Submit forms without confirmation", "Visit unapproved domains"],
    dataAccess: ["Approved domain session", "Screenshots", "Downloaded files (quarantined)"],
    tools: [{ name: "complete_web_task", risk: "consequential", confirmation: "required", evidence: ["screenshots", "action_log", "final_url"] }],
    permissions: ["network.approved_domains", "browser.session"], networkDestinations: ["worker.aiphone.studio"],
  },
  {
    slug: "maps", name: "Google Maps", publisher: "Google", category: "Android", executor: "android", level: 2, verified: true, status: "installed",
    description: "Navigation through Android Maps intents.",
    can: ["Build routes", "Start turn-by-turn navigation", "Estimate arrival time"],
    cannot: ["Share live location without confirmation"],
    dataAccess: ["Destination address", "Current location"],
    tools: [{ name: "navigate", risk: "prepare", confirmation: "none", evidence: ["route_summary"] }],
    permissions: ["android.intent.navigation", "location.foreground"], networkDestinations: ["maps.googleapis.com"],
  },
  {
    slug: "camera", name: "Inspection Camera", publisher: "AI Phone", category: "Android", executor: "android", level: 2, verified: true, status: "installed",
    description: "Opens the camera for guided inspection photos with geotags.",
    can: ["Open camera", "Attach photos to a job"], cannot: ["Capture silently", "Upload without confirmation"],
    dataAccess: ["Photos captured in session"],
    tools: [{ name: "open_camera", risk: "prepare", confirmation: "none", evidence: ["photo_hashes"] }],
    permissions: ["android.camera"], networkDestinations: [],
  },
  {
    slug: "reminders", name: "Reminders & Geofences", publisher: "AI Phone", category: "Android", executor: "android", level: 2, verified: true, status: "installed",
    description: "Arrival reminders and geofence triggers.",
    can: ["Create reminders", "Set arrival geofences"], cannot: ["Track location in background beyond the job"],
    dataAccess: ["Reminder text", "Geofence coordinates"],
    tools: [{ name: "create_reminder", risk: "prepare", confirmation: "none", evidence: ["reminder_id"] }],
    permissions: ["android.alarm", "location.geofence"], networkDestinations: [],
  },
  {
    slug: "google-workspace", name: "Google Workspace", publisher: "Google", category: "Productivity", executor: "mcp", level: 3, verified: true, status: "installed",
    description: "Gmail and Calendar via OAuth-scoped MCP tools.",
    can: ["Read approved threads", "Draft emails", "Schedule appointments with confirmation"],
    cannot: ["Send without confirmation", "Delete mail", "Change sharing settings"],
    dataAccess: ["Email subject and body", "Calendar events"],
    tools: [
      { name: "draft_email", risk: "prepare", confirmation: "none", evidence: ["draft_id"] },
      { name: "create_event", risk: "consequential", confirmation: "required", evidence: ["event_id"] },
    ],
    permissions: ["gmail.compose", "calendar.events"], networkDestinations: ["googleapis.com"],
  },
  {
    slug: "quickbooks", name: "QuickBooks", publisher: "Intuit", category: "Finance", executor: "mcp", level: 4, verified: true, status: "available",
    description: "Customers, invoices, and payment status.",
    can: ["Read approved customers", "Draft invoices", "Check invoice status"],
    cannot: ["Send invoices without confirmation", "Issue refunds", "Change bank information"],
    dataAccess: ["Customer name", "Invoice details", "Payment status"],
    tools: [
      { name: "draft_invoice", risk: "prepare", confirmation: "none", evidence: ["invoice_draft"] },
      { name: "send_invoice", risk: "consequential", confirmation: "required", evidence: ["invoice_id", "recipient"] },
      { name: "issue_refund", risk: "restricted", confirmation: "step_up", evidence: ["refund_id", "auth_receipt"] },
    ],
    permissions: ["qbo.customers.read", "qbo.invoices.write"], networkDestinations: ["quickbooks.api.intuit.com"],
  },
  {
    slug: "slack", name: "Slack", publisher: "Salesforce", category: "Communication", executor: "mcp", level: 3, verified: true, status: "available",
    description: "Post updates and read approved channels.",
    can: ["Read approved channels", "Draft messages", "Post with confirmation"], cannot: ["Post to unapproved channels", "Delete messages"],
    dataAccess: ["Channel messages"],
    tools: [{ name: "post_message", risk: "consequential", confirmation: "required", evidence: ["message_ts"] }],
    permissions: ["chat:write", "channels:read"], networkDestinations: ["slack.com"],
  },
  {
    slug: "home-assistant", name: "Home Assistant", publisher: "Nabu Casa", category: "Smart Home", executor: "mcp", level: 4, verified: false, status: "available",
    description: "Lights, climate, and locks. Lock control is Level 4 and requires step-up authentication.",
    can: ["Read sensor states", "Adjust lights and climate"], cannot: ["Unlock doors without step-up auth", "Disable alarms"],
    dataAccess: ["Entity states"],
    tools: [{ name: "unlock_door", risk: "restricted", confirmation: "step_up", evidence: ["lock_event"] }],
    permissions: ["ha.entities.read", "ha.locks.control"], networkDestinations: ["home.local"],
  },
  {
    slug: "spotify", name: "Spotify", publisher: "Spotify AB", category: "Media", executor: "mcp", level: 2, verified: true, status: "revoked",
    description: "Playback control. Revoked after a failed health check.",
    can: ["Start playback", "Queue tracks"], cannot: ["Change subscription"],
    dataAccess: ["Listening activity"],
    tools: [{ name: "play", risk: "prepare", confirmation: "none", evidence: ["track_uri"] }],
    permissions: ["user-modify-playback-state"], networkDestinations: ["api.spotify.com"], healthy: false,
  },
] as const;

const POLICIES = [
  { name: "Level 4 always requires step-up", description: "Restricted actions can never become silently autonomous.", scope: "*", actionPattern: "*", minLevel: 4, decision: "step_up", priority: 3 },
  { name: "Confirm all outbound calls", description: "Every outbound call needs a visible confirmation card.", scope: "voice-calling", actionPattern: "*", minLevel: 1, decision: "confirm", priority: 10 },
  { name: "Web Butler needs confirmation before submission", description: "Playwright may fill, but never submit without approval.", scope: "playwright", actionPattern: "*", minLevel: 3, decision: "confirm", priority: 20 },
  { name: "Never issue refunds", description: "Refunds are handled by a human in QuickBooks directly.", scope: "quickbooks", actionPattern: "Issue refund*", minLevel: 1, decision: "deny", priority: 2 },
  { name: "Allow Android read/prepare actions", description: "Navigation, camera, and reminders run without friction.", scope: "android", actionPattern: "*", minLevel: 1, decision: "allow", priority: 50 },
  { name: "Estimates use customer data — confirm", description: "Drafting estimates touches customer PII; ask first.", scope: "fleet-os", actionPattern: "Draft estimate*", minLevel: 1, decision: "confirm", priority: 30 },
  { name: "Block deletions on personal phones", description: "Data deletion is disabled until managed enrollment.", scope: "data-admin", actionPattern: "*", minLevel: 1, decision: "deny", priority: 1 },
] as const;

const DEVICES = [
  { name: "Tyreese's Pixel 9", manufacturer: "Google", model: "Pixel 9", androidVersion: 16, ramGb: 12, securityPatch: "2026-02-05", playCertified: true, enrollmentMode: "personal", voiceProvider: "twilio", assignedNumber: "+1 (415) 555-0142", minutesAgo: 3 },
  { name: "Field Unit 02", manufacturer: "Google", model: "Pixel 8a", androidVersion: 15, ramGb: 8, securityPatch: "2026-01-05", playCertified: true, enrollmentMode: "managed", voiceProvider: "telnyx", assignedNumber: "+1 (415) 555-0187", minutesAgo: 42 },
  { name: "Dispatch Galaxy", manufacturer: "Samsung", model: "Galaxy S24", androidVersion: 14, ramGb: 8, securityPatch: "2025-12-01", playCertified: true, enrollmentMode: "managed", voiceProvider: "sip", assignedNumber: "+1 (415) 555-0110", minutesAgo: 60 * 26 },
  { name: "Lab Test — OnePlus", manufacturer: "OnePlus", model: "OnePlus 11", androidVersion: 13, ramGb: 16, securityPatch: "2024-09-01", playCertified: true, enrollmentMode: "personal", voiceProvider: "sim", assignedNumber: null, minutesAgo: 60 * 24 * 9 },
  { name: "Legacy Moto", manufacturer: "Motorola", model: "Moto G Power", androidVersion: 11, ramGb: 4, securityPatch: "2023-06-01", playCertified: true, enrollmentMode: "personal", voiceProvider: "twilio", assignedNumber: null, minutesAgo: 60 * 24 * 30 },
] as const;

export async function seedWorkspace(userId: number) {
  const existing = await db.select({ id: devices.id }).from(devices).where(eq(devices.userId, userId)).limit(1);
  if (existing.length) return;

  const now = Date.now();
  const insertedDevices = await db
    .insert(devices)
    .values(
      DEVICES.map((d) => {
        const { checks, status } = buildCompatibility(d);
        return {
          userId,
          name: d.name,
          manufacturer: d.manufacturer,
          model: d.model,
          androidVersion: d.androidVersion,
          ramGb: d.ramGb,
          securityPatch: d.securityPatch,
          playCertified: d.playCertified,
          enrollmentMode: d.enrollmentMode,
          voiceProvider: d.voiceProvider,
          assignedNumber: d.assignedNumber,
          status,
          compatibility: checks,
          lastSeenAt: new Date(now - d.minutesAgo * 60_000),
        };
      }),
    )
    .returning();

  const insertedPolicies = await db
    .insert(policies)
    .values(POLICIES.map((p) => ({ ...p, userId })))
    .returning();

  const fleetVerification = verifyManifest(SAMPLE_MANIFEST, signManifest(SAMPLE_MANIFEST));
  const fleetFromManifest = capabilityFromManifest(SAMPLE_MANIFEST);
  const insertedCaps = await db
    .insert(capabilities)
    .values(
      CAPS.map((c) => ({
        ...(c.slug === "fleet-os" ? { manifest: fleetFromManifest.manifest, manifestVerification: fleetVerification, cimdUri: fleetFromManifest.cimdUri, endpoint: fleetFromManifest.endpoint } : {}),
        userId,
        slug: c.slug,
        name: c.name,
        publisher: c.publisher,
        category: c.category,
        executor: c.executor,
        level: c.level,
        description: c.description,
        can: [...c.can],
        cannot: [...c.cannot],
        dataAccess: [...c.dataAccess],
        tools: c.slug === "fleet-os" ? fleetFromManifest.tools : c.tools.map((t) => ({ ...t, evidence: [...t.evidence] })),
        permissions: [...c.permissions],
        networkDestinations: [...c.networkDestinations],
        verified: c.verified,
        status: c.status,
        healthy: "healthy" in c ? c.healthy : true,
        installedAt: c.status === "installed" ? new Date(now - 1000 * 60 * 60 * 24 * 12) : null,
      })),
    )
    .returning();

  const installed = insertedCaps.filter((c) => c.status === "installed");
  const pixel = insertedDevices[0];
  const fieldUnit = insertedDevices[1];

  // Completed plan with receipts
  const req1 = "Call John and tell him I'm twenty minutes away. Open his work order WO-1842. Navigate to 125 Main Street. When I arrive, remind me to take four inspection photographs. Then prepare the estimate.";
  const p1 = generatePlan(req1, insertedPolicies, installed);
  const [plan1] = await db
    .insert(plans)
    .values({
      userId,
      deviceId: pixel.id,
      request: req1,
      understanding: p1.understanding,
      steps: p1.steps.map((s) => ({ ...s, status: s.decision === "deny" ? "denied" : "done" })),
      status: "completed",
      createdAt: new Date(now - 1000 * 60 * 60 * 5),
      completedAt: new Date(now - 1000 * 60 * 60 * 4.6),
    })
    .returning();

  const evidenceFor: Record<string, string[]> = {
    voice: ["call_log:CA7f2…", "duration:00:01:42", "consent:not_recorded"],
    android: ["intent:ok", "route_summary:14.2 mi / 21 min"],
    mcp: ["record_snapshot:WO-1842", "draft_id:EST-3391"],
    playwright: ["screenshot:step-01.png", "screenshot:step-02.png", "final_url:portal.example.com/done"],
    api: ["response:200"],
  };

  await db.insert(receipts).values(
    p1.steps.map((s, i) => ({
      userId,
      receiptRef: newReceiptRef(),
      authMethod: authMethodFor(s.decision === "allow" ? "allowed" : s.decision === "confirm" ? "confirmed" : s.decision === "step_up" ? "step_up" : "denied"),
      planId: plan1.id,
      deviceId: pixel.id,
      action: s.title,
      capability: s.capability,
      executor: s.executor,
      level: s.level,
      decision: s.decision === "allow" ? "allowed" : s.decision === "confirm" ? "confirmed" : s.decision === "step_up" ? "step_up" : "denied",
      outcome: s.decision === "deny" ? "blocked" : "success",
      summary: s.decision === "deny" ? "Blocked by policy broker." : `Executed via ${s.executor}. Result verified and attached.`,
      evidence: evidenceFor[s.executor] ?? [],
      durationMs: 800 + i * 1400,
      createdAt: new Date(now - 1000 * 60 * 60 * 4.9 + i * 60_000 * 3),
    })),
  );

  // Proposed plan awaiting confirmation
  const req2 = "Email Maria the inspection summary, schedule a follow-up meeting for Thursday, and log in to the county permit portal to download the permit PDF.";
  const p2 = generatePlan(req2, insertedPolicies, installed);
  await db.insert(plans).values({
    userId,
    deviceId: fieldUnit.id,
    request: req2,
    understanding: p2.understanding,
    steps: p2.steps,
    status: "proposed",
    createdAt: new Date(now - 1000 * 60 * 18),
  });

  // Cancelled plan
  const req3 = "Issue a refund to the Henderson account and delete the duplicate invoice.";
  const p3 = generatePlan(req3, insertedPolicies, installed);
  await db.insert(plans).values({
    userId,
    deviceId: pixel.id,
    request: req3,
    understanding: p3.understanding,
    steps: p3.steps.map((s) => ({ ...s, status: s.decision === "deny" ? "denied" : "skipped" })),
    status: "cancelled",
    createdAt: new Date(now - 1000 * 60 * 60 * 30),
    completedAt: new Date(now - 1000 * 60 * 60 * 29.9),
  });

  // Standalone receipts from earlier days
  const extra = [
    { action: "Summarize overnight notifications", capability: "reader", executor: "api", level: 1, hours: 9, evidence: ["items:14", "response:200"] },
    { action: "Answer incoming call from +1 (415) 555-0199", capability: "voice-calling", executor: "voice", level: 3, hours: 22, evidence: ["call_log:CA91c…", "duration:00:04:07"], decision: "confirmed" },
    { action: "Complete web task via Web Butler (approved domain only)", capability: "web-butler", executor: "playwright", level: 3, hours: 27, evidence: ["screenshot:login.png", "screenshot:invoice-list.png", "download:quarantine/inv-2291.pdf", "final_url:vendor.example.com/invoices"], decision: "confirmed" },
    { action: "Start navigation to 88 Harbor Rd", capability: "maps", executor: "android", level: 2, hours: 49, evidence: ["route_summary:6.1 mi / 12 min"] },
    { action: "Draft email to Supplier", capability: "google-workspace", executor: "mcp", level: 2, hours: 51, evidence: ["draft_id:r-88a1"] },
    { action: "Unlock door via Home Assistant", capability: "home-assistant", executor: "mcp", level: 4, hours: 70, evidence: [], decision: "step_up", outcome: "blocked", summary: "Step-up authentication was not completed within 60 seconds." },
  ];
  await db.insert(receipts).values(
    extra.map((e) => ({
      userId,
      receiptRef: newReceiptRef(),
      authMethod: authMethodFor(e.decision ?? "allowed"),
      deviceId: pixel.id,
      action: e.action,
      capability: e.capability,
      executor: e.executor,
      level: e.level,
      decision: e.decision ?? decide(insertedPolicies, { capability: e.capability, executor: e.executor, level: e.level, title: e.action }).replace("allow", "allowed").replace("confirm", "confirmed"),
      outcome: e.outcome ?? "success",
      summary: e.summary ?? `Executed via ${e.executor}. Result verified and attached.`,
      evidence: e.evidence,
      durationMs: 600 + Math.round(Math.random() * 4000),
      createdAt: new Date(now - 1000 * 60 * 60 * e.hours),
    })),
  );

  // Sign every seeded receipt with the device-scoped key
  const all = await db.select().from(receipts).where(eq(receipts.userId, userId));
  for (const r of all) {
    await db.update(receipts).set({ signature: signPayload(receiptPayload(r), r.deviceId) }).where(eq(receipts.id, r.id));
  }
}

let demoEnsured = false;
export async function ensureDemoUser() {
  if (demoEnsured) return;
  const found = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  let id = found[0]?.id;
  if (!id) {
    const [u] = await db
      .insert(users)
      .values({ email: DEMO_EMAIL, name: "Tyreese Burton", passwordHash: hashPassword(DEMO_PASSWORD), organization: "Burton Field Services" })
      .onConflictDoNothing()
      .returning();
    id = u?.id;
  }
  if (id) await seedWorkspace(id);
  demoEnsured = true;
}
