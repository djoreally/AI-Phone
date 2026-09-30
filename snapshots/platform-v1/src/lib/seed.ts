import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { callTokens, capabilities, devices, installations, plans, policies, receipts, users } from "@/db/schema";
import { recordReceipt } from "@/lib/receipts";
import { deviceKey, hmacHex, randomFingerprint, randomId } from "@/lib/crypto";
import { makeDiagnostics, runSelfTest, type Diagnostics } from "@/lib/shared";
import { hashPassword } from "@/lib/auth";
import { ensureCatalog, repairCatalog } from "@/lib/catalogStore";
import { SAMPLE_MANIFEST } from "@/lib/sampleManifest";
import { fingerprintOf, generateKeypair, signManifest } from "@/lib/mcp";
import { publishCapability } from "@/lib/publish";
import { createPlan, executePlan } from "@/lib/planner";

export const DEMO_EMAIL = "demo@aiphone.dev";
export const DEMO_PASSWORD = "demo1234";

export { ensureCatalog };

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const dateAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export async function resetUserData(userId: number) {
  await repairCatalog();
  await db.delete(receipts).where(eq(receipts.userId, userId));
  await db.delete(callTokens).where(eq(callTokens.userId, userId));
  await db.delete(plans).where(eq(plans.userId, userId));
  await db.delete(devices).where(eq(devices.userId, userId));
  await db.delete(installations).where(eq(installations.userId, userId));
  await db.delete(policies).where(eq(policies.userId, userId));
  await db.delete(capabilities).where(eq(capabilities.ownerUserId, userId));

  // A publisher-signed custom package, so the marketplace shows a non-curated capability on first load.
  const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  if (owner?.email === DEMO_EMAIL) {
    const keys = generateKeypair();
    const manifest = {
      ...SAMPLE_MANIFEST,
      capabilityId: "com.moms.fleetos.capability",
      name: "Fleet OS Dispatch",
      publisher: { ...SAMPLE_MANIFEST.publisher, organization: "MOMS Mobile Oil Change LLC", developerId: "dev_moms_01982a", publicKeyFingerprint: fingerprintOf(keys.publicKey), cimdUri: "https://fleetos.com/.well-known/mcp-client-metadata.json" },
    };
    await publishCapability(userId, { manifest, signature: signManifest(manifest, keys.privateKey), publicKey: keys.publicKey }, { silent: true });
  }

  // Capabilities
  const caps = await db.select().from(capabilities);
  const id = (slug: string) => caps.find((c) => c.slug === slug)!.id;
  const installed: [string, string, number][] = [
    ["android.core", "connected", 40],
    ["voice.telnyx", "connected", 30],
    ["fleetos", "connected", 21],
    ["google.workspace", "connected", 14],
    ["com.tyreeseburton.playwright.web-task", "connected", 9],
    ["quickbooks", "connected", 5],
    ["slack", "needs_auth", 1],
  ];
  await db.insert(installations).values(
    installed.map(([slug, status, days]) => ({
      userId,
      capabilityId: id(slug),
      status,
      installedAt: new Date(Date.now() - days * 86_400_000),
      lastHealthCheckAt: status === "connected" ? ago(days * 60) : null,
    })),
  );

  // Devices
  const NUMBERS = ["+1 (215) 555-0199", "+1 (214) 555-0163", "+1 (469) 555-0128", "+1 (214) 555-0110", "+1 (214) 555-0100"];
  const certified = (id: number, d: { androidVersion: number; ramGb: number; voiceProvider: string; phoneNumber: string; approvals: string[] }, signed: boolean, tested: boolean): Diagnostics => {
    const diag = makeDiagnostics({ id, androidVersion: d.androidVersion, ramGb: d.ramGb });
    diag.collectedAt = ago(60 * 24 * 12).toISOString();
    if (signed) {
      diag.reportSignedAt = ago(60 * 24 * 12).toISOString();
      diag.reportSignature = hmacHex(deviceKey(`dev_${id}`), `report-${id}`);
    }
    if (tested) {
      diag.selfTest = runSelfTest(d);
      diag.selfTestAt = ago(60 * 24 * 12).toISOString();
    }
    return diag;
  };
  const defs = [
    {
      userId, name: "Field Pixel 9", manufacturer: "Google", model: "Pixel 9", androidVersion: 16, ramGb: 12,
      securityPatch: dateAgo(21), ownership: "managed", voiceProvider: "telnyx", phoneNumber: "+1 (214) 555-0142",
      battery: 82, provisioningStep: 12, approvals: ["notification_access"], lastSeenAt: ago(3),
      notes: "Reference hardware. Used by the field crew lead.", serial: "PXL9A41C07", approvedNumbers: NUMBERS,
      keyFingerprint: randomFingerprint(), sipStatus: "registered", rebootedAt: ago(60 * 20),
    },
    {
      userId, name: "Dispatch Pixel 8a", manufacturer: "Google", model: "Pixel 8a", androidVersion: 15, ramGb: 8,
      securityPatch: dateAgo(45), ownership: "personal", voiceProvider: "twilio", phoneNumber: "+1 (469) 555-0177",
      battery: 57, provisioningStep: 12, approvals: ["notification_access"], lastSeenAt: ago(26),
      notes: "Awaiting user approval for the assistant role.", serial: "PXL8B20E55", approvedNumbers: NUMBERS.slice(0, 2),
      keyFingerprint: randomFingerprint(), sipStatus: "unregistered", rebootedAt: null,
    },
    {
      userId, name: "Galaxy S24 (pilot)", manufacturer: "Samsung", model: "Galaxy S24", androidVersion: 14, ramGb: 8,
      securityPatch: dateAgo(60), ownership: "personal", voiceProvider: "telnyx", phoneNumber: "",
      battery: 94, provisioningStep: 7, approvals: [], lastSeenAt: ago(180),
      notes: "Samsung support pilot. Background-work limits under test.", serial: "R5CW30KQ2LA", approvedNumbers: [],
      keyFingerprint: "", sipStatus: "unregistered", rebootedAt: null,
    },
    {
      userId, name: "Spare Moto G", manufacturer: "Motorola", model: "Moto G Power", androidVersion: 11, ramGb: 4,
      securityPatch: dateAgo(400), ownership: "personal", voiceProvider: "none", phoneNumber: "",
      battery: 40, provisioningStep: 1, approvals: [], lastSeenAt: ago(60 * 24 * 6),
      notes: "Below the Android 12 and 6 GB floor.", serial: "ZY22MG8841", approvedNumbers: [],
      keyFingerprint: "", sipStatus: "unregistered", rebootedAt: null,
    },
  ];
  const inserted = await db.insert(devices).values(defs).returning({ id: devices.id });
  const diagFor = [
    (id: number) => certified(id, defs[0], true, true),
    (id: number) => certified(id, defs[1], true, true),
    (id: number) => certified(id, defs[2], false, false),
  ];
  for (let i = 0; i < diagFor.length; i++) {
    await db.update(devices).set({ diagnostics: diagFor[i](inserted[i].id) }).where(eq(devices.id, inserted[i].id));
  }
  const [d1, d2] = inserted;

  // Policies
  await db.insert(policies).values([
    { userId, name: "Reading is always allowed", description: "Level 1 tools may run without asking.", matchType: "level", matchValue: "1", decision: "allow" },
    { userId, name: "Drafts may run automatically", description: "Level 2 tools prepare work but never send it.", matchType: "level", matchValue: "2", decision: "allow" },
    { userId, name: "Confirm every outbound call", description: "Placing a call always shows a confirmation card.", matchType: "tool", matchValue: "voice.telnyx:place_call", decision: "confirm" },
    { userId, name: "Web Butler asks before browsing", description: "Any Web Butler tool needs confirmation, even read-only ones.", matchType: "capability", matchValue: "com.tyreeseburton.playwright.web-task", decision: "confirm" },
    { userId, name: "Level 4 always needs step-up", description: "Restricted tools require re-authentication and can never be silent.", matchType: "level", matchValue: "4", decision: "confirm" },
    { userId, name: "Never unlock doors from the phone", description: "Hard block for Home Assistant locks.", matchType: "tool", matchValue: "homeassistant:unlock_door", decision: "deny" },
  ]);

  // Plans + receipts (backdated so the timeline feels lived-in)
  const p1 = await createPlan(
    userId, d1.id,
    "Call John and tell him I'm twenty minutes away. Open his work order. Navigate to the job at 125 Main Street. When I arrive, remind me to take four inspection photographs. Then prepare the estimate.",
    ago(130),
  );
  if (p1) await executePlan(userId, p1, ago(128));
  const p2 = await createPlan(userId, d1.id, "Text Maria that the estimate is ready, then tell me what's on my day.", ago(60 * 27));
  if (p2) await executePlan(userId, p2, ago(60 * 27 - 1));
  const p3 = await createPlan(userId, d2.id, "Open the vendor portal website and fill in the onboarding form, then submit it.", ago(60 * 52));
  if (p3) await executePlan(userId, p3, ago(60 * 52 - 1));

  await createPlan(
    userId, d1.id,
    "Call Dana, write an email to her with the estimate, then fill in the vendor portal form for the permit.",
    ago(14),
  );
  await createPlan(
    userId, d2.id,
    "Send the invoice to Acme, refund order 441, and unlock the shop door.",
    ago(6),
  );
  const cancelled = await createPlan(userId, d2.id, "Post to Slack that I'm running late.", ago(60 * 5));
  if (cancelled) {
    await db.update(plans).set({ status: "cancelled" }).where(eq(plans.id, cancelled));
    await recordReceipt({
      userId, planId: cancelled, deviceId: d2.id, title: "Plan cancelled by user", executor: "android",
      capabilitySlug: "slack", tool: "post_message", level: 3, decision: "deny", outcome: "cancelled", authMethod: "none",
      userQuery: "Post to Slack that I'm running late.", detail: "You cancelled the plan before any step ran.", evidence: [], createdAt: ago(60 * 5 - 1),
    });
  }

  const extra = [
    {
      userId, deviceId: d1.id, title: "Incoming call from Jordan (Fleet dispatch)", executor: "voice",
      capabilitySlug: "voice.telnyx", capabilityVersion: "2.1.3", tool: "receive_call", target: "+1 (214) 555-0110", level: 1, decision: "allow", outcome: "success" as const,
      detail: "Answered over Wi-Fi after the app was terminated. Duration 3m 12s.", evidence: ["call_log", "push_wakeup"], durationMs: 192_000, providerSessionId: `CA${randomId(10)}`, createdAt: ago(60 * 3),
    },
    {
      userId, deviceId: d1.id, title: "Captured permit portal screenshot", executor: "playwright",
      capabilitySlug: "com.tyreeseburton.playwright.web-task", capabilityVersion: "1.0.0", tool: "capture_page", level: 1, decision: "confirm", outcome: "success" as const,
      authMethod: "ui_confirmation_card", confirmedAt: ago(60 * 8 + 1),
      detail: "Loaded permits.dallascityhall.com (approved domain). Download quarantined.", evidence: ["screenshot.png", "action_log", "final_url"], durationMs: 6400, createdAt: ago(60 * 8),
    },
    {
      userId, deviceId: d2.id, title: "Blocked: unapproved domain", executor: "playwright",
      capabilitySlug: "com.tyreeseburton.playwright.web-task", capabilityVersion: "1.0.0", tool: "complete_web_task", target: "promo-offers.example", level: 3, decision: "deny", outcome: "blocked" as const, authMethod: "none",
      detail: "Capability asked to visit promo-offers.example. Domain is not on the approved list.", evidence: ["policy_decision"], createdAt: ago(60 * 30),
    },
    {
      userId, deviceId: d1.id, title: "Health check: Fleet OS", executor: "mcp",
      capabilitySlug: "fleetos", capabilityVersion: "3.2.0", tool: "health_check", level: 1, decision: "allow", outcome: "success" as const, durationMs: 212,
      detail: "MCP server responded in 212 ms. Tool schemas unchanged.", evidence: ["schema_hash"], createdAt: ago(60 * 40),
    },
    {
      userId, deviceId: d2.id, title: "Capability update failed: Slack", executor: "api",
      capabilitySlug: "slack", capabilityVersion: "1.2.0", tool: "oauth_refresh", level: 1, decision: "allow", outcome: "failed" as const,
      detail: "OAuth token expired. Reconnect Slack in the marketplace.", evidence: ["oauth_error"], createdAt: ago(60 * 44),
    },
    {
      userId, deviceId: d1.id, title: "Readiness certificate issued", executor: "android", capabilitySlug: "android.core", capabilityVersion: "1.4.0",
      tool: "self_test", level: 1, decision: "allow", outcome: "success" as const, authMethod: "device_certificate",
      detail: "Self-test passed (4/4 clean).", evidence: ["self_test_report", "readiness_certificate"], createdAt: ago(60 * 24 * 12),
    },
    {
      userId, deviceId: d1.id, title: "Rebooted into AI Phone launcher", executor: "android", capabilitySlug: "android.core", capabilityVersion: "1.4.0",
      tool: "boot_check", level: 1, decision: "allow", outcome: "success" as const, authMethod: "device_certificate",
      detail: "Device booted directly into the conversation launcher as the default HOME app. SIP registration dropped and must be re-established.", evidence: ["boot_log", "home_role_check"], createdAt: ago(60 * 20),
    },
    {
      userId, deviceId: d1.id, title: "SIP registered — listening for incoming calls", executor: "voice", capabilitySlug: "voice.telnyx", capabilityVersion: "2.1.3",
      tool: "gateway_redeem", level: 1, decision: "allow", outcome: "success" as const, authMethod: "device_certificate",
      detail: "WSS signaling connected with an ephemeral token. Device is in active listening standby.", evidence: ["wss_handshake"], providerSessionId: `GW${randomId(5)}`, createdAt: ago(60 * 20 - 2),
    },
  ];
  for (const r of extra) await recordReceipt(r);

  // Voice tokens: one redeemed, one expired unused
  await db.insert(callTokens).values([
    { userId, deviceId: d1.id, jti: randomId(12), direction: "listen", numbers: [], status: "used", issuedAt: ago(60 * 20 - 1), expiresAt: ago(60 * 20 - 16), usedAt: ago(60 * 20 - 2) },
    { userId, deviceId: d1.id, jti: randomId(12), direction: "outbound", numbers: NUMBERS, status: "issued", issuedAt: ago(60 * 26), expiresAt: ago(60 * 26 - 15) },
  ]);
}

export async function ensureDemoUser(): Promise<number> {
  await ensureCatalog();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL));
  if (existing) return existing.id;
  const [u] = await db
    .insert(users)
    .values({ email: DEMO_EMAIL, name: "Tyreese Burton", passwordHash: hashPassword(DEMO_PASSWORD) })
    .returning({ id: users.id });
  await resetUserData(u.id);
  return u.id;
}

export { inArray };
