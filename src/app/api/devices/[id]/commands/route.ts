import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { devices, runtimeCommands } from "@/db/schema";
import { ApiError, handle, idFrom, readJson, requireUser } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };
type Body = { capability: string; tool: string; level?: number; payload?: Record<string, unknown> };

export function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const [device] = await db.select().from(devices).where(and(eq(devices.id, id), eq(devices.userId, user.id)));
    if (!device) throw new ApiError(404, "Device not found");
    if (device.status !== "ready") throw new ApiError(409, "Device is not ready");
    const body = await readJson<Body>(req);
    if (!body.capability?.trim() || !body.tool?.trim()) throw new ApiError(400, "capability and tool are required");
    const [command] = await db.insert(runtimeCommands).values({
      userId: user.id,
      deviceId: id,
      capability: body.capability.trim(),
      tool: body.tool.trim(),
      level: body.level ?? 3,
      payload: body.payload ?? {},
    }).returning();
    return NextResponse.json(command, { status: 201 });
  });
}

export function GET(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const rows = await db.select().from(runtimeCommands)
      .where(and(eq(runtimeCommands.deviceId, id), eq(runtimeCommands.userId, user.id)))
      .orderBy(desc(runtimeCommands.createdAt));
    return NextResponse.json(rows);
  });
}
