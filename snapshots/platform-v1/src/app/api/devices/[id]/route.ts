import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { callTokens, devices } from "@/db/schema";
import { deviceKey, hmacHex, randomFingerprint } from "@/lib/crypto";
import { deviceFields } from "@/lib/fields";
import { fail, json, parseId, readBody, requireUser, str } from "@/lib/http";
import { recordReceipt } from "@/lib/receipts";
import { evaluateDevice, makeDiagnostics, runSelfTest, type Diagnostics } from "@/lib/shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const id = parseId((await ctx.params).id);
  if (!id) return fail("Invalid id", 404);
  const [dev] = await db.select().from(devices).where(and(eq(devices.id, id), eq(devices.userId, user.id)));
  if (!dev) return fail("Device not found", 404);

  const body = await readBody(req);
  const action = str(body.action, 30);
  let patch: Partial<typeof devices.$inferInsert> = {};
  const note = (title: string, tool: string, detail: string, evidence: string[]) =>
    recordReceipt({
      userId: user.id, deviceId: id, title, executor: "android", capabilitySlug: "android.core", tool,
      level: 1, decision: "allow", outcome: "success", authMethod: "device_certificate", detail, evidence,
    });

  try {
    if (action === "advance") {
      if (dev.provisioningStep >= 12) return fail("Provisioning is already complete", 409);
      if (evaluateDevice(dev).readiness === "unsupported") return fail("This phone is below the support floor", 409);
      const n = dev.provisioningStep + 1; // 1-based step being completed
      patch = { provisioningStep: n, lastSeenAt: new Date() };
      let diag: Diagnostics | null = dev.diagnostics;

      if (n === 3) diag = makeDiagnostics(dev);
      if (n === 4) {
        diag = diag ?? makeDiagnostics(dev);
        const c = evaluateDevice(dev);
        const report = JSON.stringify({ serial: dev.serial, model: dev.model, android: dev.androidVersion, ramGb: dev.ramGb, checks: c.checks.map((x) => [x.label, x.status]), diag });
        diag = { ...diag, reportSignature: hmacHex(deviceKey(`dev_${id}`), report), reportSignedAt: new Date().toISOString() };
        await note("Signed DeviceCompatibilityReport", "sign_report", `Result: ${c.result}.`, ["compatibility_report", "hmac_signature"]);
      }
      if (n === 10) {
        patch.keyFingerprint = randomFingerprint();
        await note("Generated RSA-4096 device keypair", "generate_keypair", "Private key created inside the hardware Keystore and is non-exportable.", ["public_key_fingerprint"]);
      }
      if (n === 12) {
        const tests = runSelfTest(dev);
        const failed = tests.filter((t) => t.status === "fail");
        if (failed.length) return fail(`Self-test failed — ${failed.map((f) => `${f.name}: ${f.note}`).join("; ")}`, 422);
        diag = { ...(diag ?? makeDiagnostics(dev)), selfTest: tests, selfTestAt: new Date().toISOString() };
        await note("Readiness certificate issued", "self_test", `Self-test passed (${tests.filter((t) => t.status === "pass").length}/${tests.length} clean).`, ["self_test_report", "readiness_certificate"]);
      }
      patch.diagnostics = diag;
    } else if (action === "back") {
      patch = { provisioningStep: Math.max(0, dev.provisioningStep - 1) };
    } else if (action === "approve") {
      const key = str(body.key, 40);
      if (!["notification_access", "assistant_role"].includes(key)) return fail("Unknown approval");
      patch = { approvals: Array.from(new Set([...dev.approvals, key])) };
    } else if (action === "reboot") {
      if (dev.provisioningStep < 12) return fail("Finish provisioning before the reboot test", 409);
      if (dev.lifecycle !== "active") return fail("Device is not active", 409);
      patch = { rebootedAt: new Date(), lastSeenAt: new Date(), sipStatus: "unregistered" };
      await db.update(callTokens).set({ status: "revoked" }).where(and(eq(callTokens.deviceId, id), eq(callTokens.status, "issued")));
      await note("Rebooted into AI Phone launcher", "boot_check", "Device booted directly into the conversation launcher as the default HOME app. SIP registration dropped and must be re-established.", ["boot_log", "home_role_check"]);
    } else if (action === "lifecycle") {
      const v = str(body.lifecycle, 20);
      if (!["active", "lost", "revoked"].includes(v)) return fail("Invalid lifecycle");
      patch = { lifecycle: v };
      if (v !== "active") {
        patch.sipStatus = "unregistered";
        await db.update(callTokens).set({ status: "revoked" }).where(and(eq(callTokens.deviceId, id), eq(callTokens.status, "issued")));
        await note(v === "lost" ? "Lost-device mode enabled" : "Device revoked", "device_lifecycle", "Outstanding voice tokens revoked. Capabilities suspended.", ["token_revocation"]);
      }
    } else {
      patch = deviceFields(body, true);
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Invalid input");
  }

  const [row] = await db.update(devices).set(patch).where(eq(devices.id, id)).returning();
  return json(row);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const id = parseId((await ctx.params).id);
  if (!id) return fail("Invalid id", 404);
  await db.delete(devices).where(and(eq(devices.id, id), eq(devices.userId, user.id)));
  return json({ ok: true });
}
