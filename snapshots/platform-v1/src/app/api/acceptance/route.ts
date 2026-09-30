import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { devices, planSteps, plans, receipts } from "@/db/schema";
import { fail, json, parseId, requireUser } from "@/lib/http";
import { verifyReceipt } from "@/lib/receipts";
import { evaluateDevice, isReferenceHardware } from "@/lib/shared";

export const dynamic = "force-dynamic";

const ACCEPTANCE_COMMAND = "Call my test line and open my navigation route to 100 Main Street.";

type Status = "pass" | "pending" | "fail";
type Item = { n: number; title: string; status: Status; detail: string; action?: string };

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const deviceId = parseId(new URL(req.url).searchParams.get("deviceId") ?? "");
  if (!deviceId) return fail("deviceId is required");
  const [dev] = await db.select().from(devices).where(and(eq(devices.id, deviceId), eq(devices.userId, user.id)));
  if (!dev) return fail("Device not found", 404);

  const items: Item[] = [];
  const ref = isReferenceHardware(dev);
  items.push({
    n: 1, title: "Reference hardware prep",
    status: ref ? "pass" : "fail",
    detail: ref ? `${dev.manufacturer} ${dev.model} on Android ${dev.androidVersion} is on the Phase 1 reference matrix.` : `${dev.manufacturer} ${dev.model} (Android ${dev.androidVersion}) is outside the Pixel 8/9 + Android 14 matrix.`,
  });

  const selfFail = dev.diagnostics?.selfTest?.some((t) => t.status === "fail");
  const provisioned = dev.provisioningStep >= 12 && !!dev.diagnostics?.selfTest && !selfFail && !!dev.keyFingerprint;
  items.push({
    n: 2, title: "Desktop provisioning deployment",
    status: provisioned ? "pass" : "pending",
    detail: provisioned ? "All 12 provisioning steps done, keypair vaulted, self-test passed." : `Provisioning is at step ${dev.provisioningStep}/12.`,
    action: provisioned ? undefined : "provision",
  });

  items.push({
    n: 3, title: "Disconnect & reboot into launcher",
    status: dev.rebootedAt ? "pass" : "pending",
    detail: dev.rebootedAt ? `Booted directly into the AI Phone launcher at ${dev.rebootedAt.toISOString().slice(0, 16).replace("T", " ")} UTC.` : "Power-cycle the handset and confirm it boots into the launcher as HOME.",
    action: dev.rebootedAt || !provisioned ? undefined : "reboot",
  });

  items.push({
    n: 4, title: "Telephony standby over Wi-Fi",
    status: dev.sipStatus === "registered" ? "pass" : "pending",
    detail: dev.sipStatus === "registered" ? "SIP/WebRTC registered with an ephemeral token and listening." : "Request a 15-minute listener token and register with the gateway (required again after every reboot).",
    action: dev.sipStatus === "registered" || !provisioned ? undefined : "register",
  });

  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.deviceId, deviceId), eq(plans.userId, user.id)))
    .orderBy(desc(plans.createdAt))
    .then((rows) => rows.filter((p) => /test line/i.test(p.utterance)));
  let steps: (typeof planSteps.$inferSelect)[] = [];
  if (plan) steps = await db.select().from(planSteps).where(eq(planSteps.planId, plan.id)).orderBy(asc(planSteps.position));
  const shapeOk = steps.length === 2 && steps[0].tool === "start_navigation" && steps[0].decision === "allow" && steps[1].tool === "place_call" && steps[1].decision === "confirm";
  let planItem: Item;
  if (!plan) planItem = { n: 5, title: "Voice-driven task plan", status: "pending", detail: `Issue the command: “${ACCEPTANCE_COMMAND}”`, action: "command" };
  else if (!shapeOk) planItem = { n: 5, title: "Voice-driven task plan", status: plan.status === "proposed" ? "pending" : "fail", detail: steps.length === 2 ? `Plan shape differs from spec: ${steps.map((s) => `${s.tool}:${s.decision}`).join(", ")}${steps.some((s) => s.decision === "deny") ? ` — ${steps.find((s) => s.decision === "deny")?.reason}` : ""}.` : "Expected a 2-step plan.", action: plan.status === "proposed" ? "assistant" : "command" };
  else if (plan.status === "proposed") planItem = { n: 5, title: "Voice-driven task plan", status: "pending", detail: "Plan card is ready: Step 1 navigation (L2) auto-prepares; Step 2 outbound call (L3) needs [Confirm plan].", action: "assistant" };
  else if (plan.status === "completed") planItem = { n: 5, title: "Voice-driven task plan", status: "pass", detail: "Confirmed. Navigation prepared automatically, call placed after confirmation." };
  else planItem = { n: 5, title: "Voice-driven task plan", status: "fail", detail: `Plan ended ${plan.status}. Check the receipts for the blocking reason.`, action: "command" };
  items.push(planItem);

  let rItem: Item = { n: 6, title: "Receipt inspection & signatures", status: "pending", detail: "Run the plan first. Every step will leave a signed receipt." };
  if (plan && plan.status !== "proposed" && plan.status !== "cancelled") {
    const rs = await db.select().from(receipts).where(and(eq(receipts.planId, plan.id), eq(receipts.userId, user.id)));
    const statuses = rs.map(verifyReceipt);
    const bad = statuses.filter((s) => s !== "valid").length;
    rItem = rs.length >= 2 && bad === 0
      ? { n: 6, title: "Receipt inspection & signatures", status: "pass", detail: `${rs.length} receipts, all HMAC signatures verified.`, action: "receipts" }
      : { n: 6, title: "Receipt inspection & signatures", status: "fail", detail: `${bad} of ${rs.length} receipts failed signature verification.`, action: "receipts" };
  }
  items.push(rItem);

  const passed = items.filter((i) => i.status === "pass").length;
  return json({ device: { id: dev.id, name: dev.name }, command: ACCEPTANCE_COMMAND, items, passed, certified: passed === 6, planId: plan?.id ?? null });
}
