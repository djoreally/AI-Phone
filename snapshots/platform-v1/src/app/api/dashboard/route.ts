import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { capabilities, devices, installations, plans, receipts } from "@/db/schema";
import { evaluateDevice } from "@/lib/shared";
import { fail, json, requireUser } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);

  const devs = await db.select().from(devices).where(eq(devices.userId, user.id));
  const readiness = devs.map((d) => ({ d, c: evaluateDevice(d) }));
  const installs = await db
    .select({ level: capabilities.level, status: installations.status, name: capabilities.name })
    .from(installations)
    .innerJoin(capabilities, eq(capabilities.id, installations.capabilityId))
    .where(eq(installations.userId, user.id));
  const pending = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.userId, user.id), eq(plans.status, "proposed")));
  const dayAgo = new Date(Date.now() - 86_400_000);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const week = await db
    .select({ outcome: receipts.outcome, level: receipts.level, createdAt: receipts.createdAt })
    .from(receipts)
    .where(and(eq(receipts.userId, user.id), gte(receipts.createdAt, weekAgo)));
  const recent = await db
    .select({
      id: receipts.id, title: receipts.title, executor: receipts.executor, level: receipts.level,
      outcome: receipts.outcome, detail: receipts.detail, createdAt: receipts.createdAt,
    })
    .from(receipts)
    .where(eq(receipts.userId, user.id))
    .orderBy(desc(receipts.createdAt), desc(receipts.id))
    .limit(6);

  // receipts per day for the last 7 days
  const days: { label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - i);
    const end = new Date(start.getTime() + 86_400_000);
    days.push({
      label: start.toLocaleDateString("en-US", { weekday: "short" }),
      count: week.filter((r) => r.createdAt >= start && r.createdAt < end).length,
    });
  }

  return json({
    devices: {
      total: devs.length,
      ready: readiness.filter((r) => r.c.readiness === "ready").length,
      needsApproval: readiness.filter((r) => r.c.readiness === "needs_approval").length,
      provisioning: readiness.filter((r) => r.c.readiness === "provisioning").length,
      unsupported: readiness.filter((r) => ["unsupported", "lost", "revoked"].includes(r.c.readiness)).length,
      list: readiness.slice(0, 4).map((r) => ({
        id: r.d.id, name: r.d.name, model: r.d.model, readiness: r.c.readiness, result: r.c.result,
        step: r.d.provisioningStep, battery: r.d.battery,
      })),
    },
    capabilities: {
      installed: installs.length,
      needsAuth: installs.filter((i) => i.status !== "connected").length,
      byLevel: [1, 2, 3, 4].map((l) => ({ level: l, count: installs.filter((i) => i.level === l).length })),
    },
    pendingPlans: pending.length,
    actions24h: week.filter((r) => r.createdAt >= dayAgo).length,
    blockedWeek: week.filter((r) => r.outcome === "blocked").length,
    actionsWeek: week.length,
    days,
    recent,
  });
}
