import { createHash, createHmac } from "crypto";
import type { CapabilityTool, ManifestVerification } from "@/db/schema";

export const MCP_VERSION = "2026-07-28";
export const MANIFEST_SCHEMA = "https://aiphone.dev/schemas/v3/mcp-capability.json";

export type ManifestTool = {
  name: string;
  description?: string;
  riskLevel: "level_1_read" | "level_2_prepare" | "level_3_act" | "level_4_restricted";
  confirmationRequired?: boolean;
  requiredEvidence?: string[];
  inputSchema?: Record<string, unknown>;
};

export type Manifest = {
  $schema?: string;
  mcpVersion: string;
  capabilityId: string;
  name: string;
  version: string;
  description?: string;
  publisher: { organization: string; developerId?: string; verified?: boolean; publicKeyFingerprint?: string; cimdUri?: string };
  runtimeRequirements?: { minAndroidApi?: number; requiresNetwork?: boolean; requiresBackgroundExecution?: boolean };
  permissions?: Array<{ name: string; reason?: string }>;
  tools: ManifestTool[];
  mcpApps?: Array<{ templateId: string; entryPoint: string; sandboxPermissions?: string[] }>;
  endpoint?: string;
  networkDestinations?: string[];
};

export const RISK_TO_LEVEL: Record<ManifestTool["riskLevel"], number> = { level_1_read: 1, level_2_prepare: 2, level_3_act: 3, level_4_restricted: 4 };
export const LEVEL_TO_RISK: Record<number, CapabilityTool["risk"]> = { 1: "read", 2: "prepare", 3: "consequential", 4: "restricted" };

// ---------- Publisher signature (deterministic stand-in for Ed25519 over the canonical manifest) ----------
const PUBLISHER_ROOT = process.env.PUBLISHER_ROOT_SECRET ?? "aiphone-publisher-root";

export function canonicalize(m: Manifest) {
  const { ...rest } = m;
  return JSON.stringify(rest, Object.keys(rest).sort());
}
export function publisherFingerprint(developerId: string) {
  return "SHA256:" + createHash("sha256").update(`${PUBLISHER_ROOT}:${developerId}`).digest("hex").slice(0, 32);
}
export function signManifest(m: Manifest) {
  return "ed25519:" + createHmac("sha256", `${PUBLISHER_ROOT}:${m.publisher.developerId ?? "anon"}`).update(canonicalize(m)).digest("base64url");
}

// ---------- Validation ----------
export function validateManifest(input: unknown): { ok: true; manifest: Manifest; issues: string[] } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  if (!input || typeof input !== "object") return { ok: false, issues: ["Manifest must be a JSON object"] };
  const m = input as Partial<Manifest>;
  if (m.mcpVersion !== MCP_VERSION) issues.push(`mcpVersion must be ${MCP_VERSION} (stateless core); got ${m.mcpVersion ?? "none"}`);
  if (!m.capabilityId || !/^[a-z0-9]+(\.[a-z0-9-]+)+$/i.test(m.capabilityId)) issues.push("capabilityId must be reverse-DNS (e.g. com.acme.capability)");
  if (!m.name) issues.push("name is required");
  if (!m.version || !/^\d+\.\d+\.\d+$/.test(m.version)) issues.push("version must be semver");
  if (!m.publisher?.organization) issues.push("publisher.organization is required");
  if (!Array.isArray(m.tools) || m.tools.length === 0) issues.push("at least one tool is required");
  else {
    m.tools.forEach((t, i) => {
      if (!t.name || !/^[a-z][a-z0-9_]*$/.test(t.name)) issues.push(`tools[${i}].name must be snake_case`);
      if (!t.riskLevel || !(t.riskLevel in RISK_TO_LEVEL)) issues.push(`tools[${i}].riskLevel must be level_1_read | level_2_prepare | level_3_act | level_4_restricted`);
      const lvl = t.riskLevel ? RISK_TO_LEVEL[t.riskLevel] : 0;
      if (lvl >= 3 && t.confirmationRequired === false) issues.push(`tools[${i}] (${t.name}) declares ${t.riskLevel} but confirmationRequired=false — rejected: Level 3/4 cannot bypass the broker`);
      if (t.inputSchema && (t.inputSchema as { type?: string }).type !== "object") issues.push(`tools[${i}].inputSchema.type must be "object"`);
    });
  }
  (m.permissions ?? []).forEach((p, i) => { if (!p.name) issues.push(`permissions[${i}].name is required`); if (!p.reason) issues.push(`permissions[${i}] (${p.name}) must declare a reason`); });
  if ((m.runtimeRequirements?.minAndroidApi ?? 33) < 31) issues.push("minAndroidApi below 31 (Android 12) is unsupported");
  const blocking = issues.filter((i) => !i.startsWith("permissions["));
  if (blocking.length) return { ok: false, issues };
  return { ok: true, manifest: m as Manifest, issues };
}

export function verifyManifest(m: Manifest, providedSignature: string | null | undefined): ManifestVerification {
  const issues: string[] = [];
  const expected = signManifest(m);
  let publisherSignature: ManifestVerification["publisherSignature"] = "unsigned";
  if (providedSignature) publisherSignature = providedSignature === expected ? "valid" : "invalid";
  if (publisherSignature === "invalid") issues.push("signature.sig does not match the canonical manifest — package tampered or wrong key");
  if (publisherSignature === "unsigned") issues.push("No publisher signature supplied — install allowed as UNVERIFIED only");
  const fp = m.publisher.developerId ? publisherFingerprint(m.publisher.developerId) : null;
  if (m.publisher.publicKeyFingerprint && fp && m.publisher.publicKeyFingerprint !== fp) issues.push("publicKeyFingerprint does not match the developer's registered key");
  const cimdResolved = !!m.publisher.cimdUri && /^https:\/\/[^/]+\/\.well-known\/mcp-client-metadata\.json$/.test(m.publisher.cimdUri);
  if (!cimdResolved) issues.push("CIMD document not resolvable at https://<host>/.well-known/mcp-client-metadata.json");
  return { schemaValid: true, publisherSignature, cimdResolved, mcpVersion: m.mcpVersion, fingerprint: fp, checkedAt: new Date().toISOString(), issues };
}

export function manifestToTools(m: Manifest): CapabilityTool[] {
  return m.tools.map((t) => {
    const level = RISK_TO_LEVEL[t.riskLevel];
    return {
      name: t.name,
      description: t.description,
      risk: LEVEL_TO_RISK[level],
      confirmation: level >= 4 ? "step_up" : level === 3 || t.confirmationRequired ? "required" : "none",
      evidence: t.requiredEvidence?.length ? t.requiredEvidence : ["tool_response"],
      inputSchema: t.inputSchema,
    };
  });
}

export function capabilityFromManifest(m: Manifest) {
  const tools = manifestToTools(m);
  const maxLevel = Math.max(...m.tools.map((t) => RISK_TO_LEVEL[t.riskLevel]));
  const host = m.endpoint ? new URL(m.endpoint).host : m.publisher.cimdUri ? new URL(m.publisher.cimdUri).host : null;
  return {
    slug: m.capabilityId.split(".").slice(-2).join("-").replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
    name: m.name,
    publisher: m.publisher.organization,
    version: m.version,
    category: "MCP",
    executor: "mcp",
    level: maxLevel,
    description: m.description ?? "",
    can: m.tools.filter((t) => RISK_TO_LEVEL[t.riskLevel] <= 2).map((t) => t.description ?? t.name),
    cannot: m.tools.filter((t) => RISK_TO_LEVEL[t.riskLevel] >= 3).map((t) => `${t.description ?? t.name} — without ${RISK_TO_LEVEL[t.riskLevel] === 4 ? "biometric step-up" : "confirmation"}`),
    dataAccess: (m.permissions ?? []).map((p) => p.reason ?? p.name),
    tools,
    permissions: (m.permissions ?? []).map((p) => p.name),
    networkDestinations: m.networkDestinations ?? (host ? [host] : []),
    verified: false,
    cimdUri: m.publisher.cimdUri ?? null,
    endpoint: m.endpoint ?? (host ? `https://${host}/mcp/v3/invoke` : null),
    manifest: m as unknown as Record<string, unknown>,
  };
}

// ---------- Stateless JSON-RPC envelope ----------
export function buildInvocation(opts: { endpoint: string; tool: string; args: Record<string, unknown>; proof: { confirmationType: string; confirmedAt: number; hardwareSignature: string } | null; requestId: string }) {
  const url = new URL(opts.endpoint);
  const headers: Record<string, string> = {
    Host: url.host,
    "MCP-Protocol-Version": MCP_VERSION,
    "Mcp-Method": "tools/call",
    "Mcp-Name": opts.tool,
    Authorization: "Bearer [scoped_short_lived_oauth_token]",
    "Content-Type": "application/json",
  };
  const body = {
    jsonrpc: "2.0",
    id: opts.requestId,
    method: "tools/call",
    params: {
      name: opts.tool,
      arguments: opts.args,
      _meta: {
        "modelcontextprotocol/clientInfo": { name: "AIPhoneRuntime", version: "1.0.0" },
        ...(opts.proof ? { "com.aiphone/policyProof": opts.proof } : {}),
      },
    },
  };
  return { requestLine: `POST ${url.pathname} HTTP/1.1`, headers, body };
}

/** Validate arguments against a minimal JSON-schema subset (type, required, pattern, enum). */
export function validateArgs(schema: Record<string, unknown> | undefined, args: Record<string, unknown>): string[] {
  if (!schema) return [];
  const errs: string[] = [];
  const props = (schema.properties ?? {}) as Record<string, { type?: string; pattern?: string; enum?: unknown[] }>;
  for (const r of (schema.required as string[] | undefined) ?? []) if (args[r] === undefined || args[r] === "") errs.push(`missing required "${r}"`);
  for (const [k, v] of Object.entries(args)) {
    const p = props[k];
    if (!p) { errs.push(`unexpected argument "${k}"`); continue; }
    if (p.type === "number" && typeof v !== "number") errs.push(`"${k}" must be a number`);
    if (p.type === "string" && typeof v !== "string") errs.push(`"${k}" must be a string`);
    if (p.type === "array" && !Array.isArray(v)) errs.push(`"${k}" must be an array`);
    if (p.pattern && typeof v === "string" && !new RegExp(p.pattern).test(v)) errs.push(`"${k}" does not match ${p.pattern}`);
    if (p.enum && !p.enum.includes(v)) errs.push(`"${k}" must be one of ${p.enum.join(", ")}`);
  }
  return errs;
}

export const SAMPLE_MANIFEST: Manifest = {
  $schema: MANIFEST_SCHEMA,
  mcpVersion: MCP_VERSION,
  capabilityId: "com.moms.fleetos.capability",
  name: "Fleet OS Capability",
  version: "1.4.0",
  description: "Exposes vehicle work orders, diagnostic dispatch, and estimate drafting to the AI Phone Runtime.",
  publisher: { organization: "MOMS Mobile Oil Change LLC", developerId: "dev_moms_01982a", verified: true, publicKeyFingerprint: publisherFingerprint("dev_moms_01982a"), cimdUri: "https://fleetos.com/.well-known/mcp-client-metadata.json" },
  runtimeRequirements: { minAndroidApi: 33, requiresNetwork: true, requiresBackgroundExecution: false },
  permissions: [
    { name: "android.permission.INTERNET", reason: "Required to query Fleet OS cloud APIs over mTLS." },
    { name: "aiphone.permission.CAMERA_READ", reason: "Required to capture inspection photos for work order attachments." },
  ],
  tools: [
    { name: "get_work_order", description: "Fetch detailed information regarding an assigned vehicle work order.", riskLevel: "level_1_read", confirmationRequired: false, inputSchema: { type: "object", properties: { workOrderId: { type: "string", pattern: "^WO-[0-9]{4,8}$" } }, required: ["workOrderId"] } },
    { name: "draft_estimate", description: "Prepares an itemized repair estimate for customer review.", riskLevel: "level_2_prepare", confirmationRequired: false, inputSchema: { type: "object", properties: { workOrderId: { type: "string" }, lineItems: { type: "array" } }, required: ["workOrderId", "lineItems"] } },
    { name: "dispatch_technician", description: "Assigns and dispatches a mobile technician to job location.", riskLevel: "level_3_act", confirmationRequired: true, requiredEvidence: ["user_location_snapshot", "dispatch_timestamp"], inputSchema: { type: "object", properties: { workOrderId: { type: "string" }, technicianId: { type: "string" } }, required: ["workOrderId", "technicianId"] } },
  ],
  mcpApps: [{ templateId: "work_order_card", entryPoint: "ui_templates/main.html", sandboxPermissions: ["allow-scripts"] }],
  endpoint: "https://api.fleetos.com/mcp/v3/invoke",
};
