import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, type PlanStep } from "@/db/schema";
import { ApiError, handle, idFrom, readJson, requireUser, str } from "@/lib/api";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export function GET(_: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const [row] = await db.select().from(plans).where(and(eq(plans.id, id), eq(plans.userId, user.id)));
    if (!row) throw new ApiError(404, "Plan not found");
    return NextResponse.json(row);
  });
}

export function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const body = await readJson<{ action?: string; steps?: PlanStep[]; request?: string }>(req);
    const [existing] = await db.select().from(plans).where(and(eq(plans.id, id), eq(plans.userId, user.id)));
    if (!existing) throw new ApiError(404, "Plan not found");
    if (body.action === "cancel") {
      const [row] = await db.update(plans).set({ status: "cancelled", completedAt: new Date(), steps: existing.steps.map((s) => (s.status === "pending" ? { ...s, status: "skipped" } : s)) }).where(eq(plans.id, id)).returning();
      return NextResponse.json(row);
    }
    if (body.action === "confirm") {
      if (existing.status !== "proposed") throw new ApiError(400, "Only proposed plans can be confirmed");
      const [row] = await db.update(plans).set({ status: "confirmed" }).where(eq(plans.id, id)).returning();
      return NextResponse.json(row);
    }
    if (body.action === "remove_step" && Array.isArray(body.steps)) {
      if (existing.status !== "proposed") throw new ApiError(400, "Only proposed plans can be edited");
      const keep = new Set(body.steps.map((s) => s.id));
      const steps = existing.steps.filter((s) => keep.has(s.id));
      if (!steps.length) throw new ApiError(400, "A plan needs at least one step");
      const [row] = await db.update(plans).set({ steps }).where(eq(plans.id, id)).returning();
      return NextResponse.json(row);
    }
    if (body.request !== undefined) {
      const request = str(body.request);
      if (!request) throw new ApiError(400, "Request cannot be empty");
      const [row] = await db.update(plans).set({ request }).where(eq(plans.id, id)).returning();
      return NextResponse.json(row);
    }
    throw new ApiError(400, "Unknown action");
  });
}

export function DELETE(_: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const deleted = await db.delete(plans).where(and(eq(plans.id, id), eq(plans.userId, user.id))).returning({ id: plans.id });
    if (!deleted.length) throw new ApiError(404, "Plan not found");
    return NextResponse.json({ ok: true });
  });
}
