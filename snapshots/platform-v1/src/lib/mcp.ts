import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "crypto";
import type { ToolDef } from "@/db/schema";
import { deviceKey, hmacHex, secretDerive, sortKeys } from "@/lib/crypto";

export const MCP_VERSION = "2026-07-28";

type Json = Record<string, unknown>;

export const LEVEL_FROM: Record<string, 1 | 2 | 3 | 4> = {
  level_1_read: 1,
  level_2_prepare: 2,
  level_3_act: 3,
  level_4_restricted: 4,
};
export const LEVEL_NAME: Record<number, string> = {
  1: "level_1_read",
  2: "level_2_prepare",
  3: "level_3_act",
  4: "level_4_restricted",
};

// ---------------------------------------------------------------- types

export type ManifestTool = {
  name: string;
  description: string;
  riskLevel: string;
  confirmationRequired: boolean;
  requiredEvidence?: string[];
  inputSchema: Json;
};

export type Manifest = {
  $schema?: string;
  mcpVersion: string;
  capabilityId: string;
  name: string;
  version: string;
  description: string;
  category?: string;
  publisher: { organization: string; developerId: string; verified?: boolean; publicKeyFingerprint: string; cimdUri: string };
  runtimeRequirements: { minAndroidApi: number; requiresNetwork: boolean; requiresBackgroundExecution: boolean };
  permissions: { name: string; reason: string }[];
  tools: ManifestTool[];
  oauthScopes?: string[];
  networkDestinations?: string[];
  dataAccess?: string[];
  dataRetention?: string;
  mcpApps?: { templateId: string; entryPoint: string; sandboxPermissions: string[] }[];
};

// ---------------------------------------------------------------- canonical JSON + Ed25519

export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Json;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

export function generateKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
  };
}

export function fingerprintOf(publicKeyB64: string): string {
  return "SHA256:" + createHash("sha256").update(Buffer.from(publicKeyB64, "base64")).digest("hex");
}

function privateKeyObj(b64: string) {
  return createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" });
}

export function publicFromPrivate(privateKeyB64: string): string {
  return createPublicKey(privateKeyObj(privateKeyB64)).export({ type: "spki", format: "der" }).toString("base64");
}

export function signManifest(manifest: unknown, privateKeyB64: string): string {
  return sign(null, Buffer.from(canonical(manifest)), privateKeyObj(privateKeyB64)).toString("base64");
}

export function verifySignature(manifest: unknown, signatureB64: string, publicKeyB64: string): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" });
    return verify(null, Buffer.from(canonical(manifest)), key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

// Marketplace review key: counter-signs curated capabilities. Derived from the server secret (HSM stand-in).
let market: { privateKey: string; publicKey: string; fingerprint: string } | null = null;
export function marketplaceKey() {
  if (!market) {
    const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), secretDerive("marketplace-ed25519")]);
    const privateKey = pkcs8.toString("base64");
    const publicKey = publicFromPrivate(privateKey);
    market = { privateKey, publicKey, fingerprint: fingerprintOf(publicKey) };
  }
  return market;
}

// ---------------------------------------------------------------- manifest validation

const SEMVER = /^\d+\.\d+\.\d+$/;
const CAP_ID = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){2,}$/;
const TOOL_NAME = /^[a-z][a-z0-9_]{1,47}$/;
const ANDROID_ALLOWED = new Set([
  "INTERNET", "ACCESS_NETWORK_STATE", "CAMERA", "RECORD_AUDIO", "READ_CONTACTS", "ACCESS_COARSE_LOCATION",
  "ACCESS_FINE_LOCATION", "POST_NOTIFICATIONS", "BLUETOOTH_CONNECT", "VIBRATE",
]);
// Tool-name tokens that imply side effects. A manifest cannot declare these tools below the matching level.
const ACT_TOKENS = new Set(["send", "post", "place", "submit", "schedule", "dispatch", "publish", "complete"]);
const RESTRICTED_TOKENS = new Set(["transfer", "pay", "refund", "delete", "unlock", "purchase", "buy", "wipe", "grant", "revoke", "disable"]);
const SCHEMA_TYPES = new Set(["object", "string", "number", "integer", "boolean", "array"]);

const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown, min = 1, max = 500): v is string => typeof v === "string" && v.trim().length >= min && v.length <= max;

function checkSchema(s: unknown, path: string, errors: string[], depth = 0) {
  if (!isObj(s)) return void errors.push(`${path}: schema must be an object`);
  if (depth > 4) return void errors.push(`${path}: schema nested too deeply`);
  if (typeof s.type !== "string" || !SCHEMA_TYPES.has(s.type)) return void errors.push(`${path}: "type" must be one of ${[...SCHEMA_TYPES].join(", ")}`);
  if (s.pattern !== undefined) {
    if (typeof s.pattern !== "string" || s.pattern.length > 100) errors.push(`${path}: pattern must be a string up to 100 characters`);
    else if (/\([^)]*[+*][^)]*\)[+*{]/.test(s.pattern)) errors.push(`${path}: pattern has nested quantifiers (ReDoS risk)`);
    else {
      try {
        new RegExp(s.pattern);
      } catch {
        errors.push(`${path}: pattern is not a valid regular expression`);
      }
    }
  }
  if (s.type === "object") {
    if (!isObj(s.properties)) return void errors.push(`${path}: object schema needs "properties"`);
    const keys = Object.keys(s.properties);
    if (keys.length > 30) errors.push(`${path}: too many properties`);
    for (const k of keys) checkSchema(s.properties[k], `${path}.${k}`, errors, depth + 1);
    if (s.required !== undefined) {
      if (!Array.isArray(s.required) || s.required.some((r) => typeof r !== "string" || !keys.includes(r))) errors.push(`${path}: "required" must list declared properties`);
    }
  }
  if (s.type === "array") {
    if (s.items === undefined) errors.push(`${path}: array schema needs "items"`);
    else checkSchema(s.items, `${path}[]`, errors, depth + 1);
  }
}

export function validateManifest(input: unknown): { errors: string[]; warnings: string[]; manifest: Manifest | null } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(input)) return { errors: ["Manifest must be a JSON object"], warnings, manifest: null };
  if (canonical(input).length > 64_000) return { errors: ["Manifest exceeds the 64 KB limit"], warnings, manifest: null };
  const m = input;

  if (m.mcpVersion !== MCP_VERSION) errors.push(`mcpVersion must be "${MCP_VERSION}"`);
  if (!isStr(m.capabilityId, 5, 100) || !CAP_ID.test(m.capabilityId)) errors.push("capabilityId must be reverse-DNS, e.g. com.company.product.capability");
  if (!isStr(m.name, 2, 60)) errors.push("name must be 2–60 characters");
  if (!isStr(m.version, 5, 20) || !SEMVER.test(m.version)) errors.push("version must be semver (1.2.3)");
  if (!isStr(m.description, 10, 400)) errors.push("description must be 10–400 characters");
  if (m.category !== undefined && !isStr(m.category, 2, 40)) errors.push("category must be 2–40 characters");

  // publisher
  const p = m.publisher;
  if (!isObj(p)) errors.push("publisher block is required");
  else {
    if (!isStr(p.organization, 2, 100)) errors.push("publisher.organization is required");
    if (!isStr(p.developerId, 3, 60)) errors.push("publisher.developerId is required");
    if (!isStr(p.publicKeyFingerprint, 10, 100) || !/^SHA256:[0-9a-f]{64}$/.test(p.publicKeyFingerprint)) errors.push("publisher.publicKeyFingerprint must be SHA256:<64 hex>");
    if (!isStr(p.cimdUri, 10, 300)) errors.push("publisher.cimdUri is required");
    else {
      try {
        const u = new URL(p.cimdUri);
        const h = u.hostname;
        if (u.protocol !== "https:") errors.push("publisher.cimdUri must use https");
        else if (h === "localhost" || /^[\d.]+$/.test(h) || h.includes(":") || !h.includes(".") || /\.(local|internal|lan)$/.test(h)) errors.push("publisher.cimdUri must be a public DNS host (no localhost, IPs or internal names)");
        else if (!u.pathname.startsWith("/.well-known/")) warnings.push("publisher.cimdUri should live under /.well-known/");
      } catch {
        errors.push("publisher.cimdUri is not a valid URL");
      }
    }
    if (p.verified === true) warnings.push("publisher.verified is ignored. Verification is assigned by marketplace review, never self-declared.");
  }

  // runtime requirements
  const r = m.runtimeRequirements;
  if (!isObj(r)) errors.push("runtimeRequirements block is required");
  else {
    if (typeof r.minAndroidApi !== "number" || !Number.isInteger(r.minAndroidApi) || r.minAndroidApi < 31 || r.minAndroidApi > 40) errors.push("runtimeRequirements.minAndroidApi must be an integer ≥ 31 (Android 12)");
    if (typeof r.requiresNetwork !== "boolean") errors.push("runtimeRequirements.requiresNetwork must be boolean");
    if (typeof r.requiresBackgroundExecution !== "boolean") errors.push("runtimeRequirements.requiresBackgroundExecution must be boolean");
    else if (r.requiresBackgroundExecution) warnings.push("Background execution requested. Users will see an extra consent prompt.");
  }

  // permissions
  if (!Array.isArray(m.permissions)) errors.push("permissions must be an array");
  else {
    const seen = new Set<string>();
    m.permissions.forEach((perm, i) => {
      if (!isObj(perm) || !isStr(perm.name, 3, 100)) return void errors.push(`permissions[${i}].name is required`);
      if (!isStr(perm.reason, 10, 200)) errors.push(`permissions[${i}] (${perm.name}) needs a reason of at least 10 characters`);
      if (seen.has(perm.name)) errors.push(`permissions[${i}]: duplicate ${perm.name}`);
      seen.add(perm.name);
      if (perm.name.startsWith("android.permission.")) {
        const short = perm.name.slice("android.permission.".length);
        if (!ANDROID_ALLOWED.has(short)) errors.push(`permissions[${i}]: ${perm.name} is not grantable to marketplace capabilities`);
      } else if (!/^aiphone\.permission\.[A-Z_]+$/.test(perm.name)) errors.push(`permissions[${i}]: ${perm.name} must be android.permission.* (allow-listed) or aiphone.permission.*`);
    });
  }

  // tools
  const toolNames = new Set<string>();
  if (!Array.isArray(m.tools) || m.tools.length === 0) errors.push("tools must be a non-empty array");
  else if (m.tools.length > 20) errors.push("A capability may declare at most 20 tools");
  else {
    m.tools.forEach((t, i) => {
      const at = `tools[${i}]`;
      if (!isObj(t)) return void errors.push(`${at} must be an object`);
      const nm = typeof t.name === "string" ? t.name : "";
      if (!TOOL_NAME.test(nm)) return void errors.push(`${at}.name must be snake_case (2–48 chars)`);
      if (toolNames.has(nm)) errors.push(`${at}: duplicate tool ${nm}`);
      toolNames.add(nm);
      if (!isStr(t.description, 10, 300)) errors.push(`${nm}: description must be 10–300 characters`);
      const level = typeof t.riskLevel === "string" ? LEVEL_FROM[t.riskLevel] : undefined;
      if (!level) return void errors.push(`${nm}: riskLevel must be one of ${Object.keys(LEVEL_FROM).join(", ")}`);
      if (typeof t.confirmationRequired !== "boolean") errors.push(`${nm}: confirmationRequired must be boolean`);
      else if (level >= 3 && !t.confirmationRequired) errors.push(`${nm}: ${t.riskLevel} tools must set confirmationRequired: true`);
      const tokens = nm.split("_");
      if (RESTRICTED_TOKENS.has(tokens.find((x) => RESTRICTED_TOKENS.has(x)) ?? "") && level < 4)
        errors.push(`${nm}: name implies a money, deletion or access change, so it cannot be declared below level_4_restricted`);
      else if (tokens.some((x) => ACT_TOKENS.has(x)) && level < 3)
        errors.push(`${nm}: name implies an external side effect, so it cannot be declared below level_3_act`);
      if (level >= 3) {
        if (!Array.isArray(t.requiredEvidence) || t.requiredEvidence.length === 0 || t.requiredEvidence.some((e) => typeof e !== "string"))
          errors.push(`${nm}: level 3+ tools must declare requiredEvidence`);
      } else if (t.requiredEvidence !== undefined && (!Array.isArray(t.requiredEvidence) || t.requiredEvidence.some((e) => typeof e !== "string"))) {
        errors.push(`${nm}: requiredEvidence must be a string array`);
      }
      checkSchema(t.inputSchema, `${nm}.inputSchema`, errors);
      if (isObj(t.inputSchema) && t.inputSchema.type !== "object") errors.push(`${nm}.inputSchema: root type must be "object"`);
    });
  }

  // optional blocks
  for (const key of ["oauthScopes", "networkDestinations", "dataAccess"] as const) {
    const v = m[key];
    if (v !== undefined && (!Array.isArray(v) || v.length > 30 || v.some((x) => !isStr(x, 1, 150)))) errors.push(`${key} must be an array of short strings`);
  }
  if (Array.isArray(m.networkDestinations) && m.networkDestinations.some((d) => typeof d === "string" && (/^[\d.]+(:\d+)?$/.test(d) || d.includes("*"))))
    errors.push("networkDestinations may not contain IP literals or wildcards");
  if (m.dataRetention !== undefined && !isStr(m.dataRetention, 3, 300)) errors.push("dataRetention must be a short string");

  if (m.mcpApps !== undefined) {
    if (!Array.isArray(m.mcpApps) || m.mcpApps.length > 10) errors.push("mcpApps must be an array of up to 10 views");
    else
      m.mcpApps.forEach((a, i) => {
        if (!isObj(a) || !isStr(a.templateId, 2, 60)) return void errors.push(`mcpApps[${i}].templateId is required`);
        if (!isStr(a.entryPoint, 5, 100) || !a.entryPoint.startsWith("ui_templates/") || a.entryPoint.includes("..")) errors.push(`mcpApps[${i}].entryPoint must be inside ui_templates/`);
        const sb = a.sandboxPermissions;
        if (!Array.isArray(sb) || sb.some((x) => x !== "allow-scripts" && x !== "allow-forms"))
          errors.push(`mcpApps[${i}].sandboxPermissions may only contain allow-scripts and allow-forms (no same-origin, navigation, popups)`);
      });
  }

  return { errors, warnings, manifest: errors.length ? null : (m as unknown as Manifest) };
}

// ---------------------------------------------------------------- derived views

export function toolsFromManifest(m: Manifest): ToolDef[] {
  return m.tools.map((t) => {
    const level = LEVEL_FROM[t.riskLevel];
    return {
      name: t.name,
      description: t.description,
      level,
      confirmation: level === 4 ? "step_up" : level === 3 || t.confirmationRequired ? "required" : "none",
      ...(t.requiredEvidence ? { requiredEvidence: t.requiredEvidence } : {}),
      inputSchema: t.inputSchema,
    } as ToolDef;
  });
}

export type Stored = {
  manifest: Json | null;
  signature: string;
  publisherKey: string;
  tools: ToolDef[];
  verification: string;
};

export function verifyStored(c: Stored): { signature: "valid" | "invalid" | "unsigned"; fingerprintMatch: boolean; toolsMatch: boolean; ok: boolean } {
  if (!c.manifest || !c.signature || !c.publisherKey) return { signature: "unsigned", fingerprintMatch: false, toolsMatch: false, ok: false };
  const pub = isObj(c.manifest.publisher) ? c.manifest.publisher : {};
  const fingerprintMatch = pub.publicKeyFingerprint === fingerprintOf(c.publisherKey);
  let sigOk = verifySignature(c.manifest, c.signature, c.publisherKey);
  if (c.verification === "curated" && c.publisherKey !== marketplaceKey().publicKey) sigOk = false;
  let toolsMatch = false;
  try {
    // Enforcement tables must match what the publisher signed — a downgraded level in the DB is caught here.
    toolsMatch = canonical(toolsFromManifest(c.manifest as unknown as Manifest)) === canonical(c.tools);
  } catch {
    toolsMatch = false;
  }
  return { signature: sigOk ? "valid" : "invalid", fingerprintMatch, toolsMatch, ok: sigOk && fingerprintMatch && toolsMatch };
}

export function diffManifests(prev: Manifest, next: Manifest) {
  const prevTools = new Map(prev.tools.map((t) => [t.name, LEVEL_FROM[t.riskLevel]]));
  const addedTools = next.tools.filter((t) => !prevTools.has(t.name)).map((t) => t.name);
  const removedTools = [...prevTools.keys()].filter((n) => !next.tools.some((t) => t.name === n));
  const raisedRisk = next.tools.filter((t) => prevTools.has(t.name) && LEVEL_FROM[t.riskLevel] > (prevTools.get(t.name) ?? 0)).map((t) => t.name);
  const prevPerms = new Set(prev.permissions.map((p) => p.name));
  const addedPermissions = next.permissions.filter((p) => !prevPerms.has(p.name)).map((p) => p.name);
  const prevScopes = new Set(prev.oauthScopes ?? []);
  const addedScopes = (next.oauthScopes ?? []).filter((s) => !prevScopes.has(s));
  return { addedTools, removedTools, raisedRisk, addedPermissions, addedScopes, escalated: addedTools.length + raisedRisk.length + addedPermissions.length + addedScopes.length > 0 };
}

export function compareSemver(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}

// ---------------------------------------------------------------- curated packages

const SCHEMAS: Record<string, Json> = {
  get_work_order: { type: "object", properties: { workOrderId: { type: "string", pattern: "^WO-[0-9]{4,8}$" } }, required: ["workOrderId"], additionalProperties: false },
  place_call: { type: "object", properties: { to: { type: "string", minLength: 7, maxLength: 30 }, purpose: { type: "string", maxLength: 200 } }, required: ["to"], additionalProperties: false },
  send_sms: { type: "object", properties: { to: { type: "string", minLength: 7, maxLength: 30 }, body: { type: "string", maxLength: 500 } }, required: ["to", "body"], additionalProperties: false },
  start_navigation: { type: "object", properties: { address: { type: "string", minLength: 3, maxLength: 200 } }, required: ["address"], additionalProperties: false },
};
const DEFAULT_SCHEMA: Json = {
  type: "object",
  properties: { target: { type: "string", maxLength: 200 }, note: { type: "string", maxLength: 500 } },
  additionalProperties: false,
};

export function enrichCuratedTools(tools: ToolDef[]): ToolDef[] {
  return tools.map((t) => ({
    ...t,
    inputSchema: SCHEMAS[t.name] ?? DEFAULT_SCHEMA,
    ...(t.level >= 3 ? { requiredEvidence: t.level === 4 ? ["policy_decision", "confirmation_record", "step_up_audit"] : ["policy_decision", "confirmation_record"] } : {}),
  }));
}

export function curatedManifest(c: {
  slug: string; name: string; publisher: string; version: string; description: string; category: string;
  tools: ToolDef[]; permissions: string[]; oauthScopes: string[]; networkDestinations: string[]; dataAccess: string[]; retention: string;
}): Manifest {
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    $schema: "https://aiphone.dev/schemas/v3/mcp-capability.json",
    mcpVersion: MCP_VERSION,
    capabilityId: c.slug,
    name: c.name,
    version: c.version,
    description: c.description,
    category: c.category,
    publisher: {
      organization: c.publisher,
      developerId: `dev_${slugify(c.publisher)}`,
      verified: true,
      publicKeyFingerprint: marketplaceKey().fingerprint,
      cimdUri: `https://aiphone.dev/.well-known/publishers/${slugify(c.publisher)}.json`,
    },
    runtimeRequirements: { minAndroidApi: 31, requiresNetwork: c.networkDestinations.length > 0, requiresBackgroundExecution: false },
    permissions: c.permissions.map((name) => ({ name, reason: `Required by ${c.name} tools` })),
    tools: c.tools.map((t) => ({
      name: t.name,
      description: t.description,
      riskLevel: LEVEL_NAME[t.level],
      confirmationRequired: t.confirmation !== "none",
      ...(t.requiredEvidence ? { requiredEvidence: t.requiredEvidence } : {}),
      inputSchema: (t.inputSchema ?? DEFAULT_SCHEMA) as Json,
    })),
    oauthScopes: c.oauthScopes,
    networkDestinations: c.networkDestinations,
    dataAccess: c.dataAccess,
    dataRetention: c.retention,
  };
}

// ---------------------------------------------------------------- stateless invocation envelope

export type ConfirmationType = "AUTO_POLICY" | "UI_CARD_CONFIRMED" | "STEP_UP_CONFIRMED";

export function buildInvocation(a: {
  requestId: string;
  capabilityId: string;
  tool: string;
  args: Json;
  confirmationType: ConfirmationType;
  confirmedAt: number;
  deviceRef: string;
  host: string;
}) {
  // The proof binds the exact arguments, tool, capability and confirmation, not just names.
  const proof = [a.requestId, a.capabilityId, a.tool, canonical(a.args), a.confirmationType, a.confirmedAt].join("|");
  const hardwareSignature = hmacHex(deviceKey(a.deviceRef), proof);
  return sortKeys({
    http: {
      method: "POST",
      url: `https://${a.host}/mcp/v3/invoke`,
      headers: {
        "MCP-Protocol-Version": MCP_VERSION,
        "Mcp-Method": "tools/call",
        "Mcp-Name": a.tool,
        Authorization: "Bearer <scoped-short-lived-oauth-token>",
        "Content-Type": "application/json",
      },
    },
    body: {
      jsonrpc: "2.0",
      id: a.requestId,
      method: "tools/call",
      params: {
        name: a.tool,
        arguments: a.args,
        _meta: {
          "modelcontextprotocol/clientInfo": { name: "AIPhoneRuntime", version: "1.0.0" },
          "com.aiphone/policyProof": { confirmationType: a.confirmationType, confirmedAt: a.confirmedAt, hardwareSignature },
        },
      },
    },
  }) as Json;
}

// ---------------------------------------------------------------- argument validation against a tool's inputSchema

export function validateArgs(schema: unknown, value: unknown, path = "arguments", depth = 0): string[] {
  const errs: string[] = [];
  if (!isObj(schema) || depth > 5) return errs;
  const type = schema.type;
  const kind = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
  const typeOk =
    type === "integer" ? typeof value === "number" && Number.isInteger(value) :
    type === "number" ? typeof value === "number" && Number.isFinite(value) :
    type === "array" ? Array.isArray(value) :
    type === "object" ? isObj(value) : kind === type;
  if (!typeOk) return [`${path}: expected ${String(type)}, got ${kind}`];

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) errs.push(`${path}: must be one of ${schema.enum.join(", ")}`);
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) errs.push(`${path}: shorter than ${schema.minLength} characters`);
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) errs.push(`${path}: longer than ${schema.maxLength} characters`);
    if (typeof schema.pattern === "string" && value.length <= 2000) {
      try {
        if (!new RegExp(schema.pattern).test(value)) errs.push(`${path}: does not match ${schema.pattern}`);
      } catch {
        errs.push(`${path}: schema pattern is unusable`);
      }
    }
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) errs.push(`${path}: below minimum ${schema.minimum}`);
    if (typeof schema.maximum === "number" && value > schema.maximum) errs.push(`${path}: above maximum ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (value.length > 200) errs.push(`${path}: too many items`);
    else value.forEach((v, i) => errs.push(...validateArgs(schema.items, v, `${path}[${i}]`, depth + 1)));
  }
  if (isObj(value) && isObj(schema.properties)) {
    const props = schema.properties;
    if (Array.isArray(schema.required)) for (const r of schema.required) if (typeof r === "string" && value[r] === undefined) errs.push(`${path}.${r}: is required`);
    for (const [k, v] of Object.entries(value)) {
      if (props[k] === undefined) {
        if (schema.additionalProperties === false) errs.push(`${path}.${k}: is not allowed`);
      } else errs.push(...validateArgs(props[k], v, `${path}.${k}`, depth + 1));
    }
  }
  return errs;
}
