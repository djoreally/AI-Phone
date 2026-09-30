import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { capabilities, devices, installations, planSteps, plans, policies } from "@/db/schema";
import { recordReceipt } from "@/lib/receipts";
import { randomId } from "@/lib/crypto";
import { ensureCatalog } from "@/lib/catalogStore";
import { buildInvocation, verifyStored, type ConfirmationType } from "@/lib/mcp";

// ---------- Policy broker ----------

export type Decision = "allow" | "confirm" | "deny";

type PolicyRow = { name: string; matchType: string; matchValue: string; decision: string };

const RANK: Record<string, number> = { allow: 0, confirm: 1, deny: 2 };

export function decide(args: {
  level: number;
  slug: string;
  tool: string;
  policies: PolicyRow[];
  installStatus: string | undefined;
  target?: string;
  approvedNumbers?: string[] | null;
  confirmation?: string;
  integrityOk?: boolean;
}): { decision: Decision; stepUp: boolean; reason: string } {
  const { level, slug, tool, policies: pol, installStatus } = args;

  if (!installStatus) {
    return { decision: "deny", stepUp: false, reason: "Capability is not installed" };
  }
  if (installStatus !== "connected") {
    return { decision: "deny", stepUp: false, reason: "Capability is installed but not connected" };
  }

  // A package whose signed manifest no longer verifies is quarantined: nothing runs.
  if (args.integrityOk === false) {
    return { decision: "deny", stepUp: false, reason: "Manifest signature verification failed. Capability is quarantined" };
  }

  // Telephony scope: calls and texts may only reach numbers on the device's approved list
  // (mirrors the number-scoped, short-lived voice token).
  if ((tool === "place_call" || tool === "send_sms") && args.approvedNumbers) {
    const digits = (n: string) => n.replace(/\D/g, "");
    const t = digits(args.target ?? "");
    if (!t) return { decision: "deny", stepUp: false, reason: "No phone number on file for this contact" };
    if (!args.approvedNumbers.some((n) => digits(n) === t)) {
      return { decision: "deny", stepUp: false, reason: `${args.target} is not on this device's approved call list` };
    }
  }

  // Floors: a policy can tighten but never loosen these.
  let decision: Decision = level >= 3 ? "confirm" : "allow";
  let reason =
    level >= 4
      ? "Level 4 is restricted: confirmation and step-up authentication required"
      : level === 3
        ? "Level 3 acts on the world: confirmation required"
        : `Level ${level} is ${level === 1 ? "read-only" : "prepare-only"}: allowed`;

  for (const p of pol) {
    const hit =
      (p.matchType === "level" && p.matchValue === String(level)) ||
      (p.matchType === "capability" && p.matchValue === slug) ||
      (p.matchType === "tool" && p.matchValue === `${slug}:${tool}`);
    if (hit && RANK[p.decision] > RANK[decision]) {
      decision = p.decision as Decision;
      reason = `Policy “${p.name}” → ${p.decision}`;
    }
  }
  // The publisher's manifest can ask for more caution than the level implies, never less.
  if (args.confirmation === "required" && decision === "allow") {
    decision = "confirm";
    reason = "Publisher manifest requires confirmation for this tool";
  }
  return { decision, stepUp: level >= 4 && decision !== "deny", reason };
}

// ---------- Planner (rule-based intent → typed capability requests) ----------

type Ctx = { name: string; address: string; workOrder: string; voiceSlug: string; text: string; number: string };

type Rule = {
  re: RegExp;
  unless?: RegExp;
  slug: string | ((c: Ctx) => string);
  tool: string;
  title: (c: Ctx) => string;
};

const RULES: Rule[] = [
  { re: /\bcall\b/, slug: (c) => c.voiceSlug, tool: "place_call", title: (c) => `Call ${c.name} using the assigned business number` },
  { re: /\b(text|sms)\b/, slug: (c) => c.voiceSlug, tool: "send_sms", title: (c) => `Send a text message to ${c.name}` },
  { re: /work order|\bwo-?\d+/, slug: () => "fleetos", tool: "get_work_order", title: (c) => `Open work order ${c.workOrder}` },
  { re: /navigat|directions|route to|drive to|take me to/, slug: () => "android.core", tool: "start_navigation", title: (c) => `Start navigation to ${c.address}` },
  { re: /remind/, slug: () => "android.core", tool: "create_reminder", title: () => "Create an arrival reminder" },
  { re: /photo|camera|picture|inspection/, slug: () => "android.core", tool: "open_camera", title: () => "Open the inspection camera" },
  { re: /estimate/, unless: /send\s+(\w+\s+){0,2}estimate/, slug: () => "fleetos", tool: "draft_estimate", title: () => "Draft an estimate after the inspection" },
  { re: /send\s+(\w+\s+){0,2}estimate/, slug: () => "fleetos", tool: "send_estimate", title: () => "Send the estimate to the customer" },
  { re: /invoice/, unless: /send\s+(\w+\s+){0,2}invoice/, slug: () => "quickbooks", tool: "draft_invoice", title: () => "Prepare an invoice draft in QuickBooks" },
  { re: /send\s+(\w+\s+){0,2}invoice/, slug: () => "quickbooks", tool: "send_invoice", title: () => "Send the invoice to the customer" },
  { re: /refund/, slug: () => "quickbooks", tool: "issue_refund", title: () => "Issue a customer refund in QuickBooks" },
  { re: /unlock|\bdoor\b/, slug: () => "homeassistant", tool: "unlock_door", title: () => "Unlock the door with Home Assistant" },
  { re: /slack/, slug: () => "slack", tool: "post_message", title: () => "Post a message to Slack" },
  { re: /spotify|play .*(music|playlist)/, slug: () => "spotify", tool: "play_media", title: () => "Play music on Spotify" },
  { re: /send\s+(\w+\s+){0,2}(email|mail)/, slug: (c) => (/outlook|microsoft/.test(c.text) ? "microsoft.365" : "google.workspace"), tool: "send_email", title: () => "Send the email" },
  { re: /e-?mail|\bmail\b/, unless: /send\s+(\w+\s+){0,2}(email|mail)/, slug: (c) => (/outlook|microsoft/.test(c.text) ? "microsoft.365" : "google.workspace"), tool: "draft_email", title: () => "Write an email draft" },
  { re: /calendar|schedule|appointment|meeting/, unless: /what'?s on|my day|today'?s (schedule|calendar)/, slug: (c) => (/outlook|microsoft/.test(c.text) ? "microsoft.365" : "google.workspace"), tool: "create_event", title: () => "Schedule the appointment on the calendar" },
  { re: /portal|website|web form|browser|\bform\b|\.com\b/, slug: () => "com.tyreeseburton.playwright.web-task", tool: "fill_form", title: () => "Fill the web form in the Web Butler browser worker (no submit)" },
  { re: /submit/, slug: () => "com.tyreeseburton.playwright.web-task", tool: "complete_web_task", title: () => "Submit the web form and capture evidence" },
  { re: /what'?s on|my day|today'?s (schedule|calendar)/, slug: () => "google.workspace", tool: "read_calendar", title: () => "Read today's calendar" },
];

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const CONTACTS: Record<string, string> = {
  john: "+1 (215) 555-0199",
  maria: "+1 (214) 555-0163",
  dana: "+1 (469) 555-0128",
  jordan: "+1 (214) 555-0110",
  "test line": "+1 (214) 555-0100",
};

function extractCtx(utterance: string, voiceSlug: string): Ctx {
  const text = utterance.toLowerCase();
  const testLine = /\b(?:my\s+)?test line\b/i.test(utterance);
  const nameMatch = utterance.match(/\b(?:call|text|sms)\s+(?!the\b|my\b|a\b)([A-Za-z][\w'-]*)/i);
  const addr = utterance.match(/\b\d{1,6}\s+[A-Za-z0-9 .]+?\s(?:street|st|avenue|ave|road|rd|drive|dr|blvd|lane|ln|way)\b/i);
  const wo = utterance.match(/\bWO-?(\d+)\b/i);
  const num = utterance.match(/\+?\d[\d\s().-]{8,}\d/);
  const name = testLine ? "your test line" : nameMatch ? cap(nameMatch[1]) : "the contact";
  const key = testLine ? "test line" : nameMatch ? nameMatch[1].toLowerCase() : "";
  return {
    name,
    address: addr ? addr[0].replace(/\b\w/g, (c) => c.toUpperCase()) : "the job site",
    workOrder: wo ? `WO-${wo[1]}` : "WO-1842",
    voiceSlug,
    text,
    number: num ? num[0].trim() : (CONTACTS[key] ?? ""),
  };
}

type Draft = { title: string; slug: string; tool: string; at: number; target: string };

export function composeDrafts(utterance: string, voiceSlug: string): Draft[] {
  const ctx = extractCtx(utterance, voiceSlug);
  const drafts: Draft[] = [];
  for (const r of RULES) {
    if (r.unless && r.unless.test(ctx.text)) continue;
    const m = ctx.text.match(r.re);
    if (!m || m.index === undefined) continue;
    const slug = typeof r.slug === "function" ? r.slug(ctx) : r.slug;
    if (drafts.some((d) => d.slug === slug && d.tool === r.tool)) continue;
    const target =
      r.tool === "place_call" || r.tool === "send_sms" ? ctx.number : r.tool === "start_navigation" ? ctx.address : r.tool === "get_work_order" ? ctx.workOrder : "";
    drafts.push({ title: r.title(ctx), slug, tool: r.tool, at: m.index, target });
  }
  return drafts.sort((a, b) => a.at - b.at);
}

function summarize(utterance: string, count: number) {
  const clean = utterance.replace(/\s+/g, " ").trim();
  const short = clean.length > 70 ? `${clean.slice(0, 67)}…` : clean;
  return `${count}-step plan: ${short}`;
}

export async function createPlan(
  userId: number,
  deviceId: number | null,
  utterance: string,
  at: Date = new Date(),
): Promise<number | null> {
  let voiceSlug = "voice.telnyx";
  let approvedNumbers: string[] | null = null;
  if (deviceId) {
    const [dev] = await db.select().from(devices).where(and(eq(devices.id, deviceId), eq(devices.userId, userId)));
    if (dev?.voiceProvider === "twilio") voiceSlug = "voice.twilio";
    if (dev) approvedNumbers = dev.approvedNumbers;
  }
  const drafts = composeDrafts(utterance, voiceSlug);
  if (drafts.length === 0) return null;

  await ensureCatalog();
  const catalog = await db.select().from(capabilities);
  const integrity = new Map(catalog.map((c) => [c.slug, verifyStored(c).ok]));
  const bySlug = new Map(catalog.map((c) => [c.slug, c]));
  const installs = await db
    .select({ slug: capabilities.slug, status: installations.status })
    .from(installations)
    .innerJoin(capabilities, eq(capabilities.id, installations.capabilityId))
    .where(eq(installations.userId, userId));
  const installMap = new Map(installs.map((i) => [i.slug, i.status]));
  const pol = await db
    .select()
    .from(policies)
    .where(and(eq(policies.userId, userId), eq(policies.enabled, true)));

  const [plan] = await db
    .insert(plans)
    .values({ userId, deviceId, utterance, summary: summarize(utterance, drafts.length), createdAt: at, updatedAt: at })
    .returning({ id: plans.id });

  const rows = drafts.map((d, i) => {
    const capRow = bySlug.get(d.slug);
    const toolDef = capRow?.tools.find((t) => t.name === d.tool);
    const level = toolDef?.level ?? 3;
    const verdict = decide({
      level,
      slug: d.slug,
      tool: d.tool,
      policies: pol,
      installStatus: installMap.get(d.slug),
      target: d.target,
      approvedNumbers,
      confirmation: toolDef?.confirmation,
      integrityOk: integrity.get(d.slug) ?? true,
    });
    return {
      target: d.target,
      planId: plan.id,
      position: i + 1,
      title: d.title,
      executor: capRow?.executor ?? "api",
      capabilitySlug: d.slug,
      tool: d.tool,
      level,
      decision: verdict.decision,
      stepUp: verdict.stepUp,
      reason: verdict.reason,
    };
  });
  // Safe-first ordering: unless the user sequenced the steps ("then", "when", "after"…),
  // read/prepare steps run before steps that act on the world.
  if (!/\b(then|after|when|before|once|finally)\b/i.test(utterance)) {
    rows.sort((a, b) => (a.level >= 3 ? 1 : 0) - (b.level >= 3 ? 1 : 0));
    rows.forEach((r, i) => (r.position = i + 1));
  }
  await db.insert(planSteps).values(rows);
  return plan.id;
}

// ---------- Execution (simulated executors, real receipts) ----------

function simulate(tool: string, title: string): { detail: string; evidence: string[]; durationMs: number; sessionId: string } {
  const r = simulateBase(tool, title);
  return {
    ...r,
    durationMs: tool === "place_call" ? 42_100 : 180 + ((title.length * 37) % 1400),
    sessionId: tool === "place_call" || tool === "send_sms" ? `${tool === "place_call" ? "CA" : "SM"}${randomId(10)}` : "",
  };
}

function simulateBase(tool: string, title: string): { detail: string; evidence: string[] } {
  switch (tool) {
    case "place_call":
      return { detail: "Connected over WebRTC on the assigned number. Duration 1m 42s. Consent notice played.", evidence: ["call_log", "consent_notice"] };
    case "send_sms":
      return { detail: "Message delivered. Carrier receipt received.", evidence: ["delivery_receipt"] };
    case "get_work_order":
      return { detail: "Work order loaded: HVAC inspection, 125 Main Street. Customer and site attached.", evidence: ["work_order_snapshot"] };
    case "start_navigation":
      return { detail: "Maps navigation started. ETA 20 minutes.", evidence: ["maps_intent", "eta"] };
    case "create_reminder":
      return { detail: "Geofence reminder armed (150 m radius). It fires on arrival.", evidence: ["geofence_id"] };
    case "open_camera":
      return { detail: "Inspection template ready: 4 photographs required.", evidence: ["camera_template"] };
    case "draft_estimate":
      return { detail: "Estimate drafted, not sent. Waiting for inspection photographs.", evidence: ["draft_estimate.pdf"] };
    case "send_estimate":
      return { detail: "Estimate sent to the customer.", evidence: ["sent_estimate.pdf", "delivery_receipt"] };
    case "draft_invoice":
      return { detail: "Invoice draft created. Not sent.", evidence: ["invoice_draft.pdf"] };
    case "send_invoice":
      return { detail: "Invoice sent to the customer.", evidence: ["invoice_sent.pdf"] };
    case "issue_refund":
      return { detail: "Refund issued after step-up authentication.", evidence: ["refund_confirmation", "stepup_audit"] };
    case "unlock_door":
      return { detail: "Door unlocked for 30 seconds after step-up authentication.", evidence: ["lock_event", "stepup_audit"] };
    case "post_message":
      return { detail: "Message posted to the channel.", evidence: ["message_permalink"] };
    case "play_media":
      return { detail: "Playback started on this phone.", evidence: ["playback_state"] };
    case "send_email":
      return { detail: "Email sent from your account.", evidence: ["sent_message_id"] };
    case "draft_email":
      return { detail: "Draft saved. Not sent.", evidence: ["draft_id"] };
    case "create_event":
      return { detail: "Calendar event created and invitations queued.", evidence: ["event_link"] };
    case "fill_form":
      return { detail: "Form filled on an approved domain. Submit was not pressed.", evidence: ["screenshot_before_submit.png", "action_log", "final_url"] };
    case "complete_web_task":
      return { detail: "Form submitted. Confirmation page captured.", evidence: ["screenshot_confirmation.png", "action_log", "final_url"] };
    case "read_calendar":
      return { detail: "3 events today. Next: 9:30 AM site visit.", evidence: ["calendar_snapshot"] };
    default:
      return { detail: title, evidence: ["action_log"] };
  }
}

export async function executePlan(userId: number, planId: number, at: Date = new Date()) {
  const [plan] = await db.select().from(plans).where(and(eq(plans.id, planId), eq(plans.userId, userId)));
  if (!plan) return null;
  const steps = await db.select().from(planSteps).where(eq(planSteps.planId, planId)).orderBy(asc(planSteps.position));
  const caps = await db.select({ slug: capabilities.slug, version: capabilities.version, dest: capabilities.networkDestinations }).from(capabilities);
  const version = new Map(caps.map((c) => [c.slug, c.version]));
  const host = new Map(caps.map((c) => [c.slug, c.dest[0] ?? "on-device"]));
  const [device] = plan.deviceId ? await db.select().from(devices).where(eq(devices.id, plan.deviceId)) : [];

  let problems = 0;
  let t = at.getTime();
  for (const s of steps) {
    t += 4000;
    const when = new Date(t);
    const base = {
      userId, planId, deviceId: plan.deviceId, title: s.title, executor: s.executor, capabilitySlug: s.capabilitySlug,
      capabilityVersion: version.get(s.capabilitySlug) ?? "", tool: s.tool, level: s.level, userQuery: plan.utterance,
      target: s.target, createdAt: when,
    };

    // Runtime guards that sit beneath the policy decision.
    let runtimeBlock = "";
    if (device && device.lifecycle !== "active") runtimeBlock = `Device is ${device.lifecycle}. All capability tokens are suspended.`;
    else if (device && s.tool === "place_call" && device.sipStatus !== "registered")
      runtimeBlock = "Telephony engine is not registered. Register the device for standby to obtain a short-lived token.";

    if (s.decision === "deny") {
      problems += 1;
      await db.update(planSteps).set({ status: "blocked", result: s.reason }).where(eq(planSteps.id, s.id));
      await recordReceipt({
        ...base, decision: "deny", outcome: "blocked", authMethod: "none",
        detail: `Blocked by policy broker. ${s.reason}.`, evidence: ["policy_decision"],
      });
    } else if (runtimeBlock) {
      problems += 1;
      await db.update(planSteps).set({ status: "blocked", result: runtimeBlock }).where(eq(planSteps.id, s.id));
      await recordReceipt({
        ...base, decision: s.decision, outcome: "failed", authMethod: "none",
        detail: runtimeBlock, evidence: ["runtime_guard"],
      });
    } else {
      const sim = simulate(s.tool, s.title);
      await db.update(planSteps).set({ status: "done", result: sim.detail }).where(eq(planSteps.id, s.id));
      const confirmed = s.decision === "confirm";
      // Capability calls carry a stateless MCP envelope whose policy proof binds the exact arguments.
      const invocation =
        s.executor === "mcp" || s.executor === "api" || s.executor === "playwright"
          ? buildInvocation({
              requestId: `req_${randomId(4)}`, capabilityId: s.capabilitySlug, tool: s.tool, args: s.target ? { target: s.target } : {},
              confirmationType: (!confirmed ? "AUTO_POLICY" : s.stepUp ? "STEP_UP_CONFIRMED" : "UI_CARD_CONFIRMED") as ConfirmationType,
              confirmedAt: confirmed ? at.getTime() : 0, deviceRef: plan.deviceId ? `dev_${plan.deviceId}` : "",
              host: host.get(s.capabilitySlug) ?? "on-device",
            })
          : null;
      await recordReceipt({
        ...base, invocation, decision: s.decision, outcome: "success",
        authMethod: !confirmed ? "auto_policy" : s.stepUp ? "step_up_auth" : "ui_confirmation_card",
        confirmedAt: confirmed ? at : null,
        detail: sim.detail, evidence: sim.evidence, durationMs: sim.durationMs, providerSessionId: sim.sessionId,
      });
    }
  }
  const status = problems > 0 ? "partial" : "completed";
  await db.update(plans).set({ status, updatedAt: new Date(t) }).where(eq(plans.id, planId));
  return status;
}
