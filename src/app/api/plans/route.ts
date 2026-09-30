import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { capabilities, plans, policies } from "@/db/schema";
import { ApiError, handle, num, readJson, requireUser, str } from "@/lib/api";
import { generatePlan } from "@/lib/engine";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = await db.select().from(plans).where(eq(plans.userId, user.id)).orderBy(desc(plans.createdAt));
    return NextResponse.json(rows);
  });
}

export function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await readJson<{ request?: string; deviceId?: number | null }>(req);
    const request = str(body.request);
    if (request.length < 4) throw new ApiError(400, "Describe what you want the phone to do");
    const deviceId = body.deviceId ? num(body.deviceId) : null;
    const [policyList, installed] = await Promise.all([
      db.select().from(policies).where(eq(policies.userId, user.id)),
      db.select().from(capabilities).where(and(eq(capabilities.userId, user.id), eq(capabilities.status, "installed"))),
    ]);
    const { steps, understanding } = generatePlan(request, policyList, installed);
    const [row] = await db.insert(plans).values({ userId: user.id, deviceId, request, understanding, steps, status: "proposed" }).returning();
    return NextResponse.json(row, { status: 201 });
  });
}
