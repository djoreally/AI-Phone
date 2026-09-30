import type { Capability, CompatibilityCheck, Device, PlanStep, Policy } from "@/db/schema";

// ---------- Compatibility ----------

export function buildCompatibility(input: {
  manufacturer: string;
  androidVersion: number;
  ramGb: number;
  playCertified: boolean;
  securityPatch: string;
  enrollmentMode: string;
  voiceProvider: string;
}): { checks: CompatibilityCheck[]; status: string } {
  const checks: CompatibilityCheck[] = [];
  const isPixel = /google|pixel/i.test(input.manufacturer);
  const isSamsung = /samsung/i.test(input.manufacturer);

  checks.push({
    label: "Android version",
    status: input.androidVersion >= 12 ? "supported" : "unsupported",
    note: `Android ${input.androidVersion}${input.androidVersion < 12 ? " — Android 12+ required" : ""}`,
  });
  checks.push({
    label: "Play certification",
    status: input.playCertified ? "supported" : "unsupported",
    note: input.playCertified ? "Google Play-certified" : "Uncertified build",
  });
  checks.push({
    label: "AI Launcher",
    status: isPixel ? "supported" : isSamsung ? "supported" : "limited",
    note: isPixel ? "Reference hardware" : isSamsung ? "One UI tested" : "Untested OEM — background limits may apply",
  });
  checks.push({
    label: "Assistant role",
    status: isPixel || isSamsung ? "supported" : "awaiting",
    note: isPixel || isSamsung ? undefined : "Requires user approval on this OEM",
  });
  checks.push({
    label: "Managed-device mode",
    status: input.enrollmentMode === "managed" ? "supported" : "limited",
    note: input.enrollmentMode === "managed" ? "Android Enterprise enrolled" : "Personal profile — sensitive roles need manual approval",
  });
  checks.push({
    label: `${labelProvider(input.voiceProvider)} calling`,
    status: "supported",
    note: "Short-lived device-scoped tokens",
  });
  checks.push({
    label: "Notification access",
    status: input.enrollmentMode === "managed" ? "supported" : "awaiting",
    note: input.enrollmentMode === "managed" ? "Enforced by policy" : "Awaiting user approval",
  });
  checks.push({
    label: "Local model",
    status: input.ramGb >= 12 ? "supported" : input.ramGb >= 6 ? "limited" : "unsupported",
    note: `${input.ramGb} GB RAM${input.ramGb < 12 ? " — limited by available memory" : ""}`,
  });
  const patchYear = Number(input.securityPatch.slice(0, 4));
  checks.push({
    label: "Security patch",
    status: patchYear >= 2025 ? "supported" : "limited",
    note: input.securityPatch,
  });

  const unsupported = checks.filter((c) => c.status === "unsupported").length;
  const awaiting = checks.filter((c) => c.status === "awaiting").length;
  const status = unsupported > 0 ? "blocked" : awaiting > 0 ? "needs_approval" : "ready";
  return { checks, status };
}

export function labelProvider(p: string) {
  return { twilio: "Twilio", telnyx: "Telnyx", sip: "Managed SIP", sim: "SIM/eSIM" }[p] ?? p;
}

export function summarizeCompatibility(device: Device) {
  const awaiting = device.compatibility.filter((c) => c.status === "awaiting").length;
  const unsupported = device.compatibility.filter((c) => c.status === "unsupported").length;
  if (unsupported > 0) return `BLOCKED — ${unsupported} unsupported requirement${unsupported > 1 ? "s" : ""}`;
  if (awaiting > 0) return `READY WITH ${awaiting} REQUIRED APPROVAL${awaiting > 1 ? "S" : ""}`;
  return "READY";
}

// ---------- Policy broker ----------

export type Decision = "allow" | "confirm" | "deny" | "step_up";

const DEFAULT_BY_LEVEL: Record<number, Decision> = { 1: "allow", 2: "allow", 3: "confirm", 4: "step_up" };

function matches(pattern: string, value: string) {
  if (pattern === "*" || !pattern) return true;
  if (pattern.endsWith("*")) return value.toLowerCase().startsWith(pattern.slice(0, -1).toLowerCase());
  return pattern.toLowerCase() === value.toLowerCase();
}

export function decide(
  policiesList: Policy[],
  step: { capability: string; executor: string; level: number; title: string },
): Decision {
  const applicable = policiesList
    .filter((p) => p.enabled)
    .filter((p) => step.level >= p.minLevel)
    .filter((p) => matches(p.scope, step.capability) || matches(p.scope, step.executor))
    .filter((p) => matches(p.actionPattern, step.title))
    .sort((a, b) => a.priority - b.priority);
  const winner = applicable[0];
  const base = winner ? (winner.decision as Decision) : DEFAULT_BY_LEVEL[step.level] ?? "confirm";
  // Level 4 can never silently run.
  if (step.level >= 4 && base === "allow") return "step_up";
  return base;
}

// ---------- Planner ----------

type Intent = {
  test: RegExp;
  title: (m: RegExpMatchArray) => string;
  executor: PlanStep["executor"];
  capability: string;
  level: number;
};

const INTENTS: Intent[] = [
  { test: /\bcall\s+([A-Z][a-z]+|\w+)/i, title: (m) => `Place outbound call to ${cap(m[1])} using the business number`, executor: "voice", capability: "voice-calling", level: 3 },
  { test: /\b(text|message|sms)\s+(\w+)/i, title: (m) => `Send message to ${cap(m[2])}`, executor: "android", capability: "messaging", level: 3 },
  { test: /\bemail\s+(\w+)/i, title: (m) => `Draft email to ${cap(m[1])}`, executor: "mcp", capability: "google-workspace", level: 2 },
  { test: /work\s?order\s*#?\s*([A-Z]{0,3}-?\d+)?/i, title: (m) => `Open work order ${m[1] ? m[1].toUpperCase() : "for this customer"}`, executor: "mcp", capability: "fleet-os", level: 1 },
  { test: /\b(navigate|directions|drive)\b(?:\s+to\s+([^.,;]+))?/i, title: (m) => `Start navigation${m[2] ? ` to ${m[2].trim()}` : " to the job site"}`, executor: "android", capability: "maps", level: 2 },
  { test: /\bremind (?:me )?(?:to )?([^.,;]+)/i, title: (m) => `Create arrival reminder: ${m[1].trim()}`, executor: "android", capability: "reminders", level: 2 },
  { test: /\b(photo|photograph|picture|camera)/i, title: () => "Open inspection camera at arrival", executor: "android", capability: "camera", level: 2 },
  { test: /\b(estimate|quote)\b/i, title: () => "Draft estimate using customer information", executor: "mcp", capability: "fleet-os", level: 2 },
  { test: /\binvoice/i, title: () => "Draft invoice in QuickBooks", executor: "mcp", capability: "quickbooks", level: 2 },
  { test: /\b(send|submit)\b.*\binvoice/i, title: () => "Send invoice to customer", executor: "mcp", capability: "quickbooks", level: 3 },
  { test: /\b(schedule|book|appointment|meeting)/i, title: () => "Schedule appointment on calendar", executor: "mcp", capability: "google-workspace", level: 3 },
  { test: /\b(refund|reimburse)/i, title: () => "Issue refund", executor: "mcp", capability: "quickbooks", level: 4 },
  { test: /\b(pay|purchase|buy|spend)\b/i, title: () => "Authorize payment", executor: "api", capability: "payments", level: 4 },
  { test: /\b(delete|remove|wipe)\b/i, title: () => "Delete records", executor: "api", capability: "data-admin", level: 4 },
  { test: /\b(unlock|open the door|garage)/i, title: () => "Unlock door via Home Assistant", executor: "mcp", capability: "home-assistant", level: 4 },
  { test: /\b(portal|website|web|log ?in to|download)\b/i, title: () => "Complete web task via Web Butler (approved domain only)", executor: "playwright", capability: "web-butler", level: 3 },
  { test: /\b(summari[sz]e|read|check|what'?s|weather|status)\b/i, title: () => "Read and summarize requested information", executor: "api", capability: "reader", level: 1 },
  { test: /\b(slack|notify team|post)\b/i, title: () => "Post update to Slack channel", executor: "mcp", capability: "slack", level: 3 },
  { test: /\b(play|music|spotify)\b/i, title: () => "Start playback on Spotify", executor: "mcp", capability: "spotify", level: 2 },
];

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function generatePlan(request: string, policyList: Policy[], installed: Capability[]) {
  const steps: PlanStep[] = [];
  const seen = new Set<string>();
  for (const intent of INTENTS) {
    const m = request.match(intent.test);
    if (!m) continue;
    const title = intent.title(m);
    if (seen.has(title)) continue;
    seen.add(title);
    const installedCap = installed.find((c) => c.slug === intent.capability);
    const level = installedCap ? Math.max(intent.level, Math.min(installedCap.level, intent.level + 1)) : intent.level;
    steps.push({
      id: `s${steps.length + 1}`,
      title,
      executor: intent.executor,
      capability: intent.capability,
      level,
      decision: decide(policyList, { capability: intent.capability, executor: intent.executor, level, title }),
      status: "pending",
    });
  }
  if (steps.length === 0) {
    steps.push({
      id: "s1",
      title: "Clarify request and summarize what was understood",
      executor: "api",
      capability: "reader",
      level: 1,
      decision: "allow",
      status: "pending",
    });
  }
  const confirms = steps.filter((s) => s.decision === "confirm" || s.decision === "step_up").length;
  const denied = steps.filter((s) => s.decision === "deny").length;
  const understanding = `I understood a ${steps.length}-step request. ${steps.length - confirms - denied} step${steps.length - confirms - denied === 1 ? "" : "s"} can run under policy, ${confirms} require${confirms === 1 ? "s" : ""} your approval${denied ? `, and ${denied} ${denied === 1 ? "is" : "are"} denied by policy` : ""}.`;
  return { steps, understanding };
}

export const EXECUTOR_LABEL: Record<string, string> = {
  android: "Android",
  api: "API",
  mcp: "MCP",
  playwright: "Playwright",
  voice: "Voice",
};

export const LEVEL_LABEL: Record<number, string> = {
  1: "Read",
  2: "Prepare",
  3: "Act with confirmation",
  4: "Restricted",
};
