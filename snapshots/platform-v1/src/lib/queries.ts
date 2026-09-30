import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { devices, planSteps, plans } from "@/db/schema";

export async function loadPlans(userId: number, planId?: number) {
  const rows = await db
    .select({
      id: plans.id,
      deviceId: plans.deviceId,
      deviceName: devices.name,
      utterance: plans.utterance,
      summary: plans.summary,
      status: plans.status,
      createdAt: plans.createdAt,
      updatedAt: plans.updatedAt,
    })
    .from(plans)
    .leftJoin(devices, eq(devices.id, plans.deviceId))
    .where(planId ? and(eq(plans.userId, userId), eq(plans.id, planId)) : eq(plans.userId, userId))
    .orderBy(desc(plans.createdAt))
    .limit(60);
  if (rows.length === 0) return [];
  const steps = await db
    .select()
    .from(planSteps)
    .where(inArray(planSteps.planId, rows.map((r) => r.id)))
    .orderBy(asc(planSteps.position));
  return rows.map((r) => ({ ...r, steps: steps.filter((s) => s.planId === r.id) }));
}
