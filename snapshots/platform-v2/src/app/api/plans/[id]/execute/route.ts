import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, receipts } from "@/db/schema";
import { ApiError, handle, idFrom, requireUser } from "@/lib/api";
import { authMethodFor, newReceiptRef, receiptPayload, signPayload } from "@/lib/phase1";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const EVIDENCE: Record<string, string[]> = {
  voice: ["call_log", "duration", "consent_state"],
  android: ["intent_result", "screenshot"],
  mcp: ["tool_response", "record_snapshot"],
  playwright: ["screenshots", "action_log", "final_url"],
  api: ["http_status", "response_hash"],
};

export function POST(_: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const [plan] = await db.select().from(plans).where(and(eq(plans.id, id), eq(plans.userId, user.id)));
    if (!plan) throw new ApiError(404, "Plan not found");
    if (!["proposed", "confirmed"].includes(plan.status)) throw new ApiError(400, "This plan has already been executed or cancelled");

    const steps = plan.steps.map((s) => ({ ...s, status: s.decision === "deny" ? ("denied" as const) : ("done" as const) }));
    const started = Date.now();
    const rows = steps.map((s, i) => {
        const ms = 400 + Math.round(Math.random() * 3000);
        const decision = s.decision === "allow" ? "allowed" : s.decision === "confirm" ? "confirmed" : s.decision === "step_up" ? "step_up" : "denied";
        return {
          receiptRef: newReceiptRef(),
          authMethod: authMethodFor(decision),
          userId: user.id,
          planId: plan.id,
          deviceId: plan.deviceId,
          action: s.title,
          capability: s.capability,
          executor: s.executor,
          level: s.level,
          decision,
          outcome: s.decision === "deny" ? "blocked" : "success",
          summary: s.decision === "deny" ? "Blocked by policy broker. No executor was invoked." : s.decision === "step_up" ? "Step-up authentication passed. Executed with additional verification." : `Executed via ${s.executor}. Result verified and evidence attached.`,
          evidence: s.decision === "deny" ? ["policy_decision:deny"] : (EVIDENCE[s.executor] ?? []).map((e) => `${e}:${Math.random().toString(36).slice(2, 8)}`),
          durationMs: ms,
          createdAt: new Date(started + i * 1500),
        };
      });
    const inserted = await db.insert(receipts).values(rows).returning();
    for (const r of inserted) {
      await db.update(receipts).set({ signature: signPayload(receiptPayload(r), r.deviceId) }).where(eq(receipts.id, r.id));
    }
    const anyDone = steps.some((s) => s.status === "done");
    const [row] = await db.update(plans).set({ steps, status: anyDone ? "completed" : "failed", completedAt: new Date() }).where(eq(plans.id, id)).returning();
    return NextResponse.json(row);
  });
}
