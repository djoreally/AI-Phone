import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { devices, provisioningRuns } from "@/db/schema";
import { ApiError, handle, idFrom, requireUser } from "@/lib/api";
import { buildCertificate, runStep } from "@/lib/phase1";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Advance the pipeline by one stage. */
export function POST(_: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const [run] = await db.select().from(provisioningRuns).where(and(eq(provisioningRuns.id, id), eq(provisioningRuns.userId, user.id)));
    if (!run) throw new ApiError(404, "Run not found");
    if (run.status !== "running") throw new ApiError(400, "This run has already finished");
    const [device] = await db.select().from(devices).where(eq(devices.id, run.deviceId));
    if (!device) throw new ApiError(404, "Device no longer exists");

    const steps = runStep(device, run.steps, run.currentStep);
    const failed = steps[run.currentStep]?.status === "failed";
    const last = run.currentStep >= steps.length - 1;
    let update: Partial<typeof provisioningRuns.$inferInsert> = { steps, currentStep: Math.min(run.currentStep + 1, steps.length) };

    if (failed || last) {
      const cert = buildCertificate(device, steps);
      update = { ...update, status: failed ? "failed" : "certified", certificate: cert.text, completedAt: new Date() };
      if (!failed) {
        const hasWarnings = steps.some((s) => s.status === "warning");
        await db.update(devices).set({ status: hasWarnings && device.status !== "ready" ? "needs_approval" : device.status === "blocked" ? "blocked" : "ready", lastSeenAt: new Date() }).where(eq(devices.id, device.id));
      }
    }
    const [updated] = await db.update(provisioningRuns).set(update).where(eq(provisioningRuns.id, id)).returning();
    return NextResponse.json(updated);
  });
}

export function DELETE(_: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const deleted = await db.delete(provisioningRuns).where(and(eq(provisioningRuns.id, id), eq(provisioningRuns.userId, user.id))).returning({ id: provisioningRuns.id });
    if (!deleted.length) throw new ApiError(404, "Run not found");
    return NextResponse.json({ ok: true });
  });
}
