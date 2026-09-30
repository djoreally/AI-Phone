import type { devices, policies } from "@/db/schema";
import { str } from "@/lib/http";

export function deviceFields(body: Record<string, unknown>, partial: boolean) {
  const out: Partial<typeof devices.$inferInsert> = {};
  if (!partial || "name" in body) {
    const v = str(body.name, 80);
    if (!v) throw new Error("Device name is required");
    out.name = v;
  }
  if (!partial || "model" in body) {
    const v = str(body.model, 80);
    if (!v) throw new Error("Model is required");
    out.model = v;
  }
  if ("manufacturer" in body) out.manufacturer = str(body.manufacturer, 60) || "Google";
  if (!partial || "androidVersion" in body) {
    const n = Number(body.androidVersion);
    if (!Number.isInteger(n) || n < 5 || n > 20) throw new Error("Android version must be between 5 and 20");
    out.androidVersion = n;
  }
  if (!partial || "ramGb" in body) {
    const n = Number(body.ramGb);
    if (!Number.isInteger(n) || n < 1 || n > 64) throw new Error("RAM must be between 1 and 64 GB");
    out.ramGb = n;
  }
  if (!partial || "securityPatch" in body) {
    const v = str(body.securityPatch, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("Security patch must be a date (YYYY-MM-DD)");
    out.securityPatch = v;
  }
  if ("ownership" in body) {
    const v = str(body.ownership, 20);
    if (!["personal", "managed"].includes(v)) throw new Error("Invalid ownership");
    out.ownership = v;
  }
  if ("voiceProvider" in body) {
    const v = str(body.voiceProvider, 20);
    if (!["telnyx", "twilio", "sip", "none"].includes(v)) throw new Error("Invalid voice provider");
    out.voiceProvider = v;
  }
  if ("phoneNumber" in body) out.phoneNumber = str(body.phoneNumber, 30);
  if ("notes" in body) out.notes = str(body.notes, 500);
  if ("approvedNumbers" in body) {
    const raw = Array.isArray(body.approvedNumbers) ? body.approvedNumbers.map(String) : String(body.approvedNumbers ?? "").split(/[\n,;]+/);
    const list = Array.from(new Set(raw.map((n) => n.trim().slice(0, 30)).filter(Boolean)));
    if (list.length > 20) throw new Error("At most 20 approved numbers");
    if (list.some((n) => n.replace(/\D/g, "").length < 7)) throw new Error("Approved numbers must be valid phone numbers");
    out.approvedNumbers = list;
  }
  return out;
}

export function policyFields(body: Record<string, unknown>, partial: boolean) {
  const out: Partial<typeof policies.$inferInsert> = {};
  if (!partial || "name" in body) {
    const v = str(body.name, 100);
    if (!v) throw new Error("Policy name is required");
    out.name = v;
  }
  if ("description" in body) out.description = str(body.description, 300);
  if (!partial || "matchType" in body) {
    const v = str(body.matchType, 20);
    if (!["level", "capability", "tool"].includes(v)) throw new Error("Invalid match type");
    out.matchType = v;
  }
  if (!partial || "matchValue" in body) {
    const v = str(body.matchValue, 150);
    if (!v) throw new Error("Match value is required");
    out.matchValue = v;
  }
  if (!partial || "decision" in body) {
    const v = str(body.decision, 20);
    if (!["allow", "confirm", "deny"].includes(v)) throw new Error("Invalid decision");
    out.decision = v;
  }
  if ("enabled" in body) out.enabled = Boolean(body.enabled);
  return out;
}
