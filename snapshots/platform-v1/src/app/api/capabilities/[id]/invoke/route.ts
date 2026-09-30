import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { capabilities, devices, installations, policies, users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth";
import { randomId, sortKeys } from "@/lib/crypto";
import { fail, json, parseId, readBody, requireUser, str } from "@/lib/http";
import { buildInvocation, canonical, validateArgs, verifyStored, type ConfirmationType } from "@/lib/mcp";
import { decide } from "@/lib/planner";
import { recordReceipt } from "@/lib/receipts";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Policy-gated tool call. Two-phase: the first call returns the broker's decision; confirming re-evaluates it server-side.
export async function POST(req: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const id = parseId((await ctx.params).id);
  if (!id) return fail("Invalid id", 404);
  const body = await readBody(req);

  const [cap] = await db
    .select()
    .from(capabilities)
    .where(and(eq(capabilities.id, id), or(isNull(capabilities.ownerUserId), eq(capabilities.ownerUserId, user.id))));
  if (!cap) return fail("Capability not found", 404);
  const [inst] = await db.select().from(installations).where(and(eq(installations.userId, user.id), eq(installations.capabilityId, id)));
  if (!inst) return fail("Install the capability first", 409);

  const toolName = str(body.tool, 60);
  const tool = cap.tools.find((t) => t.name === toolName);
  if (!tool) return fail("Unknown tool", 404);
  const args = body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments) ? (body.arguments as Record<string, unknown>) : {};

  let deviceId: number | null = null;
  if (body.deviceId) {
    const [d] = await db.select().from(devices).where(and(eq(devices.id, Number(body.deviceId)), eq(devices.userId, user.id)));
    if (!d) return fail("Device not found", 404);
    deviceId = d.id;
    if (d.lifecycle !== "active") return fail(`Device is ${d.lifecycle}. Capability calls are suspended.`, 409);
  }

  const base = {
    userId: user.id, deviceId, title: `${cap.name}: ${tool.name}`, executor: cap.executor, capabilitySlug: cap.slug,
    capabilityVersion: cap.version, tool: tool.name, level: tool.level, userQuery: `Manual tool call from the marketplace console`,
    target: canonical(args).slice(0, 200),
  };

  const integrity = verifyStored(cap);
  const pol = await db.select().from(policies).where(and(eq(policies.userId, user.id), eq(policies.enabled, true)));
  const verdict = decide({
    level: tool.level, slug: cap.slug, tool: tool.name, policies: pol, installStatus: inst.status,
    confirmation: tool.confirmation, integrityOk: integrity.ok,
  });

  if (verdict.decision === "deny") {
    await recordReceipt({ ...base, decision: "deny", outcome: "blocked", authMethod: "none", detail: `Blocked by policy broker. ${verdict.reason}.`, evidence: ["policy_decision"] });
    return Response.json({ error: verdict.reason, decision: "deny" }, { status: 403 });
  }

  const errors = validateArgs(tool.inputSchema, args);
  if (errors.length) {
    await recordReceipt({
      ...base, decision: verdict.decision, outcome: "blocked", authMethod: "none",
      detail: `Arguments rejected by the tool's input schema: ${errors.slice(0, 3).join("; ")}.`, evidence: ["schema_validation"],
    });
    return Response.json({ error: "Arguments rejected by the tool's input schema", errors }, { status: 422 });
  }

  if (verdict.decision === "confirm" && body.confirm !== true) {
    return json({
      status: "needs_confirmation", decision: "confirm", stepUp: verdict.stepUp, reason: verdict.reason,
      summary: `${cap.name} will run ${tool.name}(${canonical(args)}). ${tool.description}`,
      requiredEvidence: tool.requiredEvidence ?? [],
    });
  }

  if (verdict.stepUp) {
    const password = typeof body.password === "string" ? body.password : "";
    const [u] = await db.select().from(users).where(eq(users.id, user.id));
    if (!password || !u || !verifyPassword(password, u.passwordHash)) {
      return Response.json({ error: "Step-up authentication failed", needsStepUp: true }, { status: 403 });
    }
  }

  const confirmed = verdict.decision === "confirm";
  const now = Date.now();
  const confirmationType: ConfirmationType = !confirmed ? "AUTO_POLICY" : verdict.stepUp ? "STEP_UP_CONFIRMED" : "UI_CARD_CONFIRMED";
  const envelope = buildInvocation({
    requestId: `req_${randomId(4)}`, capabilityId: cap.slug, tool: tool.name, args, confirmationType,
    confirmedAt: confirmed ? now : 0, deviceRef: deviceId ? `dev_${deviceId}` : "", host: cap.networkDestinations[0] ?? "on-device",
  });
  const result = {
    content: [{ type: "text", text: `[simulated] ${cap.name} ran ${tool.name} with ${canonical(args)}. No real endpoint was contacted.` }],
    isError: false,
  };
  await recordReceipt({
    ...base, decision: verdict.decision, outcome: "success", authMethod: !confirmed ? "auto_policy" : verdict.stepUp ? "step_up_auth" : "ui_confirmation_card",
    confirmedAt: confirmed ? new Date(now) : null, durationMs: 120 + (canonical(args).length % 400), invocation: sortKeys(envelope),
    detail: `Stateless tools/call accepted. Policy proof bound to ${Object.keys(args).length} argument${Object.keys(args).length === 1 ? "" : "s"}.`,
    evidence: ["policy_proof", "tool_schema_ok", ...(tool.requiredEvidence ?? []).map((e) => `required:${e}`)],
  });
  return json({ status: "executed", decision: verdict.decision, result, envelope });
}
