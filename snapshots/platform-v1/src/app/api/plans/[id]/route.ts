import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { planSteps, plans, users } from "@/db/schema";
import { recordReceipt } from "@/lib/receipts";
import { verifyPassword } from "@/lib/auth";
import { fail, json, parseId, readBody, requireUser, str } from "@/lib/http";
import { executePlan } from "@/lib/planner";
import { loadPlans } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const id = parseId((await ctx.params).id);
  if (!id) return fail("Invalid id", 404);
  const [plan] = await db.select().from(plans).where(and(eq(plans.id, id), eq(plans.userId, user.id)));
  if (!plan) return fail("Plan not found", 404);
  const body = await readBody(req);
  const action = str(body.action, 20);

  if (plan.status !== "proposed") return fail("Only proposed plans can be changed", 409);

  if (action === "confirm") {
    const steps = await db.select().from(planSteps).where(eq(planSteps.planId, id));
    if (steps.some((s) => s.stepUp && s.decision !== "deny")) {
      const password = typeof body.password === "string" ? body.password : "";
      const [u] = await db.select().from(users).where(eq(users.id, user.id));
      if (!password || !u || !verifyPassword(password, u.passwordHash)) {
        return Response.json({ error: "Step-up authentication failed", needsStepUp: true }, { status: 403 });
      }
    }
    await executePlan(user.id, id);
  } else if (action === "cancel") {
    await db.update(plans).set({ status: "cancelled", updatedAt: new Date() }).where(eq(plans.id, id));
    await recordReceipt({
      userId: user.id, planId: id, deviceId: plan.deviceId, title: "Plan cancelled by user", executor: "android",
      outcome: "cancelled", decision: "deny", authMethod: "none", userQuery: plan.utterance,
      detail: "You cancelled the plan before any step ran.", evidence: [],
    });
  } else if (action === "edit") {
    if ("summary" in body) {
      const summary = str(body.summary, 200);
      if (!summary) return fail("Summary can't be empty");
      await db.update(plans).set({ summary, updatedAt: new Date() }).where(eq(plans.id, id));
    }
    if (body.removeStepId) {
      const stepId = Number(body.removeStepId);
      const steps = await db.select().from(planSteps).where(eq(planSteps.planId, id)).orderBy(asc(planSteps.position));
      if (steps.length <= 1) return fail("A plan needs at least one step. Cancel it instead.");
      if (!steps.some((s) => s.id === stepId)) return fail("Step not found", 404);
      await db.delete(planSteps).where(eq(planSteps.id, stepId));
      const rest = steps.filter((s) => s.id !== stepId);
      for (let i = 0; i < rest.length; i++) {
        await db.update(planSteps).set({ position: i + 1 }).where(eq(planSteps.id, rest[i].id));
      }
    }
  } else {
    return fail("Unknown action");
  }
  const [updated] = await loadPlans(user.id, id);
  return json(updated);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const id = parseId((await ctx.params).id);
  if (!id) return fail("Invalid id", 404);
  await db.delete(plans).where(and(eq(plans.id, id), eq(plans.userId, user.id)));
  return json({ ok: true });
}
