// Types + pure helpers shared by server and client.

export type Level = 1 | 2 | 3 | 4;

export const LEVEL_META: Record<
  number,
  { label: string; short: string; blurb: string; tone: string; dot: string }
> = {
  1: {
    label: "Read",
    short: "L1",
    blurb: "Look things up. Weather, work orders, documents, notification summaries.",
    tone: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
    dot: "bg-emerald-500",
  },
  2: {
    label: "Prepare",
    short: "L2",
    blurb: "Draft, route, or fill without submitting. Nothing leaves the phone.",
    tone: "bg-sky-100 text-sky-800 ring-sky-600/20",
    dot: "bg-sky-500",
  },
  3: {
    label: "Act with confirmation",
    short: "L3",
    blurb: "Send, call, submit, schedule. Always asks first.",
    tone: "bg-amber-100 text-amber-900 ring-amber-600/30",
    dot: "bg-amber-500",
  },
  4: {
    label: "Restricted",
    short: "L4",
    blurb: "Spend, delete, refund, unlock. Needs step-up authentication. Never silent.",
    tone: "bg-red-100 text-red-800 ring-red-600/20",
    dot: "bg-red-500",
  },
};

export const EXECUTOR_LABEL: Record<string, string> = {
  android: "Android",
  voice: "Voice",
  api: "API",
  mcp: "MCP",
  playwright: "Playwright",
};

export const PROVISIONING_STEPS = [
  "Detect device & serial (ADB / QR)",
  "Validate reference hardware",
  "Run health diagnostics",
  "Sign compatibility report",
  "Assign Device Owner (DPC)",
  "Exempt from battery termination",
  "Install signed Runtime APK",
  "Set default launcher (HOME)",
  "Set assistant role",
  "Generate RSA-4096 keypair",
  "Store bootstrap credential",
  "Self-test & readiness certificate",
];

export const PROVISIONING_STAGES: { name: string; steps: number[] }[] = [
  { name: "1 · Connection & handshake", steps: [0, 1] },
  { name: "2 · Capability diagnostics", steps: [2, 3] },
  { name: "3 · Device Owner provisioning", steps: [4, 5] },
  { name: "4 · Runtime & launcher install", steps: [6, 7, 8] },
  { name: "5 · Telephony & key vaulting", steps: [9, 10] },
  { name: "6 · Self-test & verification", steps: [11] },
];

export type SelfTestItem = { name: string; status: "pass" | "warn" | "fail"; note: string };

export type Diagnostics = {
  playIntegrity: string;
  selinux: string;
  storageFreeGb: number;
  storageTotalGb: number;
  batteryHealthPct: number;
  ramFreeGb: number;
  collectedAt: string;
  reportSignature?: string;
  reportSignedAt?: string;
  selfTest?: SelfTestItem[];
  selfTestAt?: string;
};

export function makeDiagnostics(d: { id: number; androidVersion: number; ramGb: number }): Diagnostics {
  const id = Math.abs(d.id);
  return {
    playIntegrity: d.androidVersion >= 13 ? "MEETS_STRONG_INTEGRITY" : d.androidVersion >= 12 ? "MEETS_DEVICE_INTEGRITY" : "MEETS_BASIC_INTEGRITY",
    selinux: "Enforcing",
    storageTotalGb: 128,
    storageFreeGb: 40 + ((id * 7) % 60),
    batteryHealthPct: 88 + ((id * 3) % 11),
    ramFreeGb: Math.round(d.ramGb * 0.45 * 10) / 10,
    collectedAt: new Date().toISOString(),
  };
}

export function runSelfTest(d: { androidVersion: number; voiceProvider: string; phoneNumber: string; approvals: string[] }): SelfTestItem[] {
  const pending = 2 - d.approvals.filter((a) => ["notification_access", "assistant_role"].includes(a)).length;
  return [
    d.androidVersion >= 12
      ? { name: "Launcher launch check", status: "pass", note: "Runtime resolved as HOME activity" }
      : { name: "Launcher launch check", status: "fail", note: "Android 12+ required" },
    d.voiceProvider === "none"
      ? { name: "SIP registration ping", status: "fail", note: "No voice provider configured" }
      : d.phoneNumber
        ? { name: "SIP registration ping", status: "pass", note: `Registered via ${d.voiceProvider}` }
        : { name: "SIP registration ping", status: "warn", note: "Reachable, but no number assigned yet" },
    pending > 0
      ? { name: "System API permission check", status: "warn", note: `${pending} user approval${pending > 1 ? "s" : ""} still pending` }
      : { name: "System API permission check", status: "pass", note: "All required roles granted" },
    { name: "Receipt store initialization", status: "pass", note: "Signing key bound to hardware Keystore" },
  ];
}

export const APPROVAL_LABEL: Record<string, string> = {
  notification_access: "Notification access",
  assistant_role: "Default assistant role",
};

export type CheckStatus = "supported" | "limited" | "awaiting" | "unsupported";

export type DeviceInput = {
  androidVersion: number;
  ramGb: number;
  securityPatch: string;
  ownership: string;
  voiceProvider: string;
  approvals: string[];
  lifecycle: string;
  provisioningStep: number;
  manufacturer?: string;
  model?: string;
};

export function isReferenceHardware(d: { manufacturer?: string; model?: string; androidVersion: number }) {
  return (d.manufacturer ?? "").toLowerCase() === "google" && /pixel\s*(8|9)/i.test(d.model ?? "") && d.androidVersion >= 14;
}

export type Compatibility = {
  checks: { label: string; status: CheckStatus; note?: string; approvalKey?: string }[];
  result: string;
  readiness: "ready" | "needs_approval" | "provisioning" | "unsupported" | "lost" | "revoked";
  requiredApprovals: number;
};

export function evaluateDevice(d: DeviceInput): Compatibility {
  const okAndroid = d.androidVersion >= 12;
  const okRam = d.ramGb >= 6;
  const calling: CheckStatus = okAndroid && okRam ? "supported" : "unsupported";
  const patchAgeDays = (Date.now() - new Date(d.securityPatch).getTime()) / 86_400_000;
  const managed = d.ownership === "managed";

  const checks: Compatibility["checks"] = [
    {
      label: "Android version",
      status: okAndroid ? "supported" : "unsupported",
      note: okAndroid ? `Android ${d.androidVersion}` : "Android 12 or newer required",
    },
    {
      label: "Phase 1 reference hardware",
      status: isReferenceHardware(d) ? "supported" : "limited",
      note: isReferenceHardware(d) ? "Pixel 8/9 series on Android 14+" : "Outside the Pixel 8/9 + Android 14 reference matrix",
    },
    {
      label: "Memory (6 GB minimum)",
      status: okRam ? "supported" : "unsupported",
      note: `${d.ramGb} GB`,
    },
    {
      label: "Security patch",
      status: patchAgeDays <= 180 ? "supported" : "limited",
      note: patchAgeDays <= 180 ? d.securityPatch : `${d.securityPatch} — update recommended`,
    },
    { label: "AI Launcher", status: okAndroid ? "supported" : "unsupported" },
    managed
      ? { label: "Assistant role", status: okAndroid ? "supported" : "unsupported", note: "Enforced by managed policy" }
      : d.approvals.includes("assistant_role")
        ? { label: "Assistant role", status: "supported", note: "Approved by user" }
        : { label: "Assistant role", status: "awaiting", note: "User must approve", approvalKey: "assistant_role" },
    {
      label: "Managed-device mode",
      status: managed ? "supported" : "limited",
      note: managed ? "Android Enterprise enrolled" : "Personal device — user-approved roles only",
    },
    { label: "Twilio calling", status: calling },
    { label: "Telnyx calling", status: calling },
    d.approvals.includes("notification_access")
      ? { label: "Notification access", status: "supported", note: "Approved by user" }
      : { label: "Notification access", status: "awaiting", note: "User must approve", approvalKey: "notification_access" },
    {
      label: "Local model",
      status: d.ramGb >= 12 ? "supported" : d.ramGb >= 6 ? "limited" : "unsupported",
      note: d.ramGb >= 12 ? undefined : "Limited by available memory",
    },
  ];

  const hardFail = !okAndroid || !okRam;
  const requiredApprovals = checks.filter((c) => c.status === "awaiting").length;
  let readiness: Compatibility["readiness"];
  if (d.lifecycle === "lost") readiness = "lost";
  else if (d.lifecycle === "revoked") readiness = "revoked";
  else if (hardFail) readiness = "unsupported";
  else if (d.provisioningStep < 12) readiness = "provisioning";
  else if (requiredApprovals > 0) readiness = "needs_approval";
  else readiness = "ready";

  let result: string;
  if (hardFail) result = "NOT SUPPORTED";
  else if (requiredApprovals === 0) result = "READY";
  else result = `READY WITH ${requiredApprovals} REQUIRED APPROVAL${requiredApprovals > 1 ? "S" : ""}`;

  return { checks, result, readiness, requiredApprovals };
}

export const READINESS_META: Record<string, { label: string; tone: string }> = {
  ready: { label: "Ready", tone: "bg-emerald-100 text-emerald-800 ring-emerald-600/20" },
  needs_approval: { label: "Needs approval", tone: "bg-amber-100 text-amber-900 ring-amber-600/30" },
  provisioning: { label: "Provisioning", tone: "bg-sky-100 text-sky-800 ring-sky-600/20" },
  unsupported: { label: "Unsupported", tone: "bg-stone-200 text-stone-700 ring-stone-500/20" },
  lost: { label: "Lost — locked", tone: "bg-red-100 text-red-800 ring-red-600/20" },
  revoked: { label: "Revoked", tone: "bg-red-100 text-red-800 ring-red-600/20" },
};

// ----- JSON-shaped API types -----

export type DeviceDTO = {
  id: number;
  name: string;
  manufacturer: string;
  model: string;
  androidVersion: number;
  ramGb: number;
  securityPatch: string;
  ownership: string;
  voiceProvider: string;
  phoneNumber: string;
  battery: number;
  provisioningStep: number;
  approvals: string[];
  lifecycle: string;
  notes: string;
  serial: string;
  keyFingerprint: string;
  diagnostics: Diagnostics | null;
  sipStatus: string;
  approvedNumbers: string[];
  rebootedAt: string | null;
  lastSeenAt: string;
  createdAt: string;
};

export type CapabilityDTO = {
  id: number;
  slug: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  category: string;
  executor: string;
  level: number;
  verified: boolean;
  signed: boolean;
  builtin: boolean;
  tools: { name: string; description: string; level: number; confirmation: string; requiredEvidence?: string[]; inputSchema?: Record<string, unknown> }[];
  canDo: string[];
  cannotDo: string[];
  dataAccess: string[];
  permissions: string[];
  oauthScopes: string[];
  networkDestinations: string[];
  retention: string;
  verification: string;
  mcpVersion: string;
  publisherFingerprint: string;
  publisherKey: string;
  owned: boolean;
  integrity: { signature: "valid" | "invalid" | "unsigned"; fingerprintMatch: boolean; toolsMatch: boolean; ok: boolean };
  manifest: Record<string, unknown> | null;
  installation: { status: string; lastHealthCheckAt: string | null; installedAt: string } | null;
};

export type PolicyDTO = {
  id: number;
  name: string;
  description: string;
  matchType: string;
  matchValue: string;
  decision: string;
  enabled: boolean;
  createdAt: string;
};

export type PlanStepDTO = {
  id: number;
  planId: number;
  position: number;
  title: string;
  executor: string;
  capabilitySlug: string;
  tool: string;
  level: number;
  decision: string;
  stepUp: boolean;
  reason: string;
  status: string;
  result: string;
  target: string;
};

export type PlanDTO = {
  id: number;
  deviceId: number | null;
  deviceName: string | null;
  utterance: string;
  summary: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  steps: PlanStepDTO[];
};

export type ReceiptDTO = {
  id: number;
  planId: number | null;
  deviceId: number | null;
  deviceName: string | null;
  title: string;
  executor: string;
  capabilitySlug: string;
  tool: string;
  level: number;
  decision: string;
  outcome: string;
  detail: string;
  evidence: string[];
  createdAt: string;
  uid: string;
  signature: string;
  signatureStatus: "valid" | "invalid" | "unsigned";
  payload: Record<string, unknown>;
};

export type TokenDTO = {
  id: number;
  direction: string;
  numbers: string[];
  status: "issued" | "used" | "revoked" | "expired";
  issuedAt: string;
  expiresAt: string;
  usedAt: string | null;
};

export const PLAN_STATE: Record<string, string> = {
  proposed: "PENDING_APPROVAL",
  completed: "COMPLETED",
  partial: "COMPLETED_WITH_BLOCKS",
  cancelled: "CANCELLED",
};

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
