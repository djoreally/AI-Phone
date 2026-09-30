import { ApiError, bool, num, str, strList } from "@/lib/api";
import { buildCompatibility } from "@/lib/engine";

export type DeviceInput = {
  name: string; manufacturer: string; model: string; androidVersion: number; ramGb: number;
  securityPatch: string; playCertified: boolean; enrollmentMode: string; voiceProvider: string; assignedNumber?: string | null;
};

export function parseDevice(body: Partial<DeviceInput>) {
  const name = str(body.name);
  const manufacturer = str(body.manufacturer);
  const model = str(body.model);
  if (!name || !manufacturer || !model) throw new ApiError(400, "Name, manufacturer, and model are required");
  const androidVersion = num(body.androidVersion, 0);
  if (androidVersion < 5 || androidVersion > 30) throw new ApiError(400, "Android version looks invalid");
  const ramGb = num(body.ramGb, 0);
  if (ramGb <= 0) throw new ApiError(400, "RAM must be a positive number");
  const securityPatch = str(body.securityPatch) || "2024-01-01";
  const playCertified = bool(body.playCertified, true);
  const enrollmentMode = ["personal", "managed"].includes(str(body.enrollmentMode)) ? str(body.enrollmentMode) : "personal";
  const voiceProvider = ["twilio", "telnyx", "sip", "sim"].includes(str(body.voiceProvider)) ? str(body.voiceProvider) : "twilio";
  const assignedNumber = str(body.assignedNumber ?? "") || null;
  const { checks, status } = buildCompatibility({ manufacturer, androidVersion, ramGb, playCertified, securityPatch, enrollmentMode, voiceProvider });
  return { name, manufacturer, model, androidVersion, ramGb, securityPatch, playCertified, enrollmentMode, voiceProvider, assignedNumber, compatibility: checks, status };
}

export type CapabilityInput = {
  name: string; publisher: string; version: string; category: string; executor: string; level: number; description: string;
  can: string[] | string; cannot: string[] | string; dataAccess: string[] | string; permissions: string[] | string; networkDestinations: string[] | string; verified: boolean;
};

export function parseCapability(body: Partial<CapabilityInput>) {
  const name = str(body.name);
  const publisher = str(body.publisher);
  if (!name || !publisher) throw new ApiError(400, "Name and publisher are required");
  const level = Math.min(4, Math.max(1, Math.round(num(body.level, 1))));
  const executor = ["android", "api", "mcp", "playwright", "voice"].includes(str(body.executor)) ? str(body.executor) : "mcp";
  const risk = (["read", "prepare", "consequential", "restricted"] as const)[level - 1];
  const confirmation = level >= 4 ? "step_up" : level === 3 ? "required" : "none";
  return {
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    publisher,
    version: str(body.version) || "1.0.0",
    category: str(body.category) || "Productivity",
    executor,
    level,
    description: str(body.description),
    can: strList(body.can),
    cannot: strList(body.cannot),
    dataAccess: strList(body.dataAccess),
    permissions: strList(body.permissions),
    networkDestinations: strList(body.networkDestinations),
    verified: bool(body.verified, false),
    tools: [{ name: "primary_tool", risk, confirmation: confirmation as "none" | "required" | "step_up", evidence: ["action_log"] }],
  };
}

export type PolicyInput = { name: string; description: string; scope: string; actionPattern: string; minLevel: number; decision: string; priority: number; enabled: boolean };

export function parsePolicy(body: Partial<PolicyInput>) {
  const name = str(body.name);
  if (!name) throw new ApiError(400, "Policy name is required");
  const decision = ["allow", "confirm", "deny", "step_up"].includes(str(body.decision)) ? str(body.decision) : "confirm";
  return {
    name,
    description: str(body.description),
    scope: str(body.scope) || "*",
    actionPattern: str(body.actionPattern) || "*",
    minLevel: Math.min(4, Math.max(1, Math.round(num(body.minLevel, 1)))),
    decision,
    priority: Math.max(1, Math.round(num(body.priority, 100))),
    enabled: bool(body.enabled, true),
  };
}
