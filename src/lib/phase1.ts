import "server-only";
import { createHmac, randomBytes, createHash } from "crypto";
import type { Device, ProvisionStep, Receipt } from "@/db/schema";

// ---------- Signing (stand-in for hardware KeyStore HMAC) ----------
const SECRET = process.env.RECEIPT_SIGNING_SECRET ?? "aiphone-dev-signing-key";

export function deviceKey(deviceId: number | null) {
  return createHash("sha256").update(`${SECRET}:device:${deviceId ?? "unassigned"}`).digest();
}
export function keyFingerprint(deviceId: number) {
  const h = createHash("sha256").update(deviceKey(deviceId)).digest("hex");
  return h.match(/.{1,4}/g)!.slice(0, 8).join(":").toUpperCase();
}

export type ReceiptPayload = {
  receiptId: string;
  timestamp: string;
  deviceId: string;
  planId: string | null;
  capability: { id: string; riskLevel: string };
  intent: { parsedAction: string; executor: string };
  policyEvaluation: { gatePassed: boolean; decision: string; authMethod: string };
  executionDetails: { status: string; durationMs: number };
  evidence: string[];
};

export function receiptPayload(r: Omit<Receipt, "signature"> & { signature?: string | null }): ReceiptPayload {
  return {
    receiptId: r.receiptRef ?? `rcpt_${r.id}`,
    timestamp: new Date(r.createdAt).toISOString(),
    deviceId: r.deviceId ? `device_${r.deviceId}` : "unassigned",
    planId: r.planId ? `plan_${r.planId}` : null,
    capability: { id: r.capability, riskLevel: `level_${r.level}_${["read", "prepare", "act", "restricted"][r.level - 1] ?? "read"}` },
    intent: { parsedAction: r.action, executor: r.executor },
    policyEvaluation: { gatePassed: r.decision !== "denied", decision: r.decision, authMethod: r.authMethod },
    executionDetails: { status: r.outcome.toUpperCase(), durationMs: r.durationMs },
    evidence: r.evidence,
  };
}

export function signPayload(payload: unknown, deviceId: number | null) {
  return "hmac-sha256:" + createHmac("sha256", deviceKey(deviceId)).update(JSON.stringify(payload)).digest("base64url");
}

export function verifyReceipt(r: Receipt) {
  if (!r.signature) return { valid: false, reason: "UNSIGNED" };
  const expected = signPayload(receiptPayload(r), r.deviceId);
  return expected === r.signature ? { valid: true, reason: "SIGNATURE_OK" } : { valid: false, reason: "SIGNATURE_MISMATCH" };
}

export function newReceiptRef() {
  return `rcpt_${randomBytes(8).toString("hex")}`;
}

export function authMethodFor(decision: string) {
  return decision === "confirmed" ? "ui_confirmation_card" : decision === "step_up" ? "biometric_step_up" : decision === "denied" ? "policy_denied" : "auto_policy";
}

// ---------- Short-lived voice tokens ----------
export function mintVoiceToken(device: Device, scope: string, allowedNumber: string | null) {
  const jti = randomBytes(12).toString("hex");
  const exp = Math.floor(Date.now() / 1000) + 15 * 60;
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT", kid: keyFingerprint(device.id) })).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({ iss: "aiphone-auth-gateway", sub: `device_${device.id}`, aud: device.voiceProvider, jti, scope, allowed_number: allowedNumber, from: device.assignedNumber, exp }),
  ).toString("base64url");
  const sig = createHmac("sha256", deviceKey(device.id)).update(`${header}.${body}`).digest("base64url");
  return { jti, token: `${header}.${body}.${sig}`, expiresAt: new Date(exp * 1000) };
}

// ---------- Provisioning pipeline ----------
export function initialSteps(device: Device, transport: string): ProvisionStep[] {
  return [
    { key: "handshake", title: "Device connection & handshake", detail: transport === "usb_adb" ? "ADB over USB — validate serial, model, OS baseline" : "QR enrollment — pair over local network", status: "pending", log: [] },
    { key: "diagnostics", title: "Capability & compatibility diagnostics", detail: "RAM, battery, Play Integrity, SELinux, storage → signed DeviceCompatibilityReport", status: "pending", log: [] },
    { key: "dpc", title: "Android Enterprise / DPC provisioning", detail: device.enrollmentMode === "managed" ? "Assign Device Owner, exempt runtime from battery termination" : "Personal profile — request sensitive roles via user approval", status: "pending", log: [] },
    { key: "payload", title: "Runtime payload & launcher installation", detail: "Install signed APK, set HOME category, assign ASSISTANT role", status: "pending", log: [] },
    { key: "vault", title: "Telephony & API key vaulting", detail: "Generate hardware-backed keypair, store bootstrap credential only", status: "pending", log: [] },
    { key: "selftest", title: "Self-test & verification pipeline", detail: "Launcher check, SIP registration ping, permission audit, receipt store init", status: "pending", log: [] },
  ];
}

export function runStep(device: Device, steps: ProvisionStep[], index: number): ProvisionStep[] {
  const next = steps.map((s) => ({ ...s, log: [...s.log] }));
  const step = next[index];
  if (!step) return next;
  const compat = device.compatibility;
  const find = (label: string) => compat.find((c) => c.label.toLowerCase().includes(label))?.status;
  let status: ProvisionStep["status"] = "passed";
  const log: string[] = [];

  switch (step.key) {
    case "handshake": {
      log.push(`serial=${(device.manufacturer.slice(0, 2) + device.model.replace(/\s/g, "")).toUpperCase()}${String(device.id).padStart(4, "0")}`);
      log.push(`model=${device.manufacturer} ${device.model}`, `android=${device.androidVersion}`);
      if (device.androidVersion < 12) { status = "failed"; log.push("FAIL: Android 12+ required"); }
      else if (!/google/i.test(device.manufacturer)) { status = "warning"; log.push("WARN: not reference hardware (Pixel 8/9) — device-matrix entry required"); }
      else log.push("OK: reference hardware");
      break;
    }
    case "diagnostics": {
      log.push(`ram=${device.ramGb}GB`, `play_integrity=${device.playCertified ? "MEETS_DEVICE_INTEGRITY" : "FAILED"}`, `selinux=enforcing`, `security_patch=${device.securityPatch}`);
      if (!device.playCertified || device.ramGb < 6) { status = "failed"; log.push("FAIL: does not meet baseline"); }
      else if (find("local model") === "limited" || find("security patch") === "limited") { status = "warning"; log.push("WARN: limited local model or stale patch level"); }
      log.push("DeviceCompatibilityReport signed");
      break;
    }
    case "dpc": {
      if (device.enrollmentMode === "managed") log.push("dpm set-device-owner com.aiphone.runtime/.DeviceAdmin → success", "battery optimization exemption granted");
      else { status = "warning"; log.push("personal profile: Device Owner not available", "user must approve ASSISTANT role + notification access on handset"); }
      break;
    }
    case "payload": {
      log.push("pm install -r aiphone-runtime-1.0.0.apk → Success", "cmd package set-home-activity com.aiphone.runtime/.LauncherActivity", `role ASSISTANT → ${find("assistant") === "supported" ? "granted" : "awaiting user approval"}`);
      if (find("assistant") === "awaiting") status = "warning";
      break;
    }
    case "vault": {
      log.push("keystore: generate RSA-4096 (StrongBox) → ok", `fingerprint=${keyFingerprint(device.id)}`, `provider=${device.voiceProvider}`, "bootstrap credential stored (15-min TTL). No master secrets on handset.");
      break;
    }
    case "selftest": {
      log.push("launcher boot check → ok", `sip register ${device.voiceProvider} → 200 OK (ephemeral token)`, "permission audit → " + (find("notification") === "awaiting" ? "1 pending approval" : "complete"), "receipt store init → ok");
      if (find("notification") === "awaiting") status = "warning";
      break;
    }
  }
  next[index] = { ...step, status, log };
  return next;
}

export function buildCertificate(device: Device, steps: ProvisionStep[]) {
  const failed = steps.some((s) => s.status === "failed");
  const warnings = steps.filter((s) => s.status === "warning").length;
  const body = {
    certificate: "aiphone.readiness.v1",
    device: `${device.manufacturer} ${device.model}`,
    deviceId: `device_${device.id}`,
    android: device.androidVersion,
    keyFingerprint: keyFingerprint(device.id),
    voiceProvider: device.voiceProvider,
    steps: steps.map((s) => ({ key: s.key, status: s.status })),
    result: failed ? "NOT_CERTIFIED" : warnings ? `CERTIFIED_WITH_${warnings}_REQUIRED_APPROVAL${warnings > 1 ? "S" : ""}` : "CERTIFIED",
    issuedAt: new Date().toISOString(),
  };
  return { text: JSON.stringify({ ...body, signature: signPayload(body, device.id) }, null, 2), failed };
}
