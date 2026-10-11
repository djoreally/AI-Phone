import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { ApiError, handle, idFrom, requireUser } from "@/lib/api";
import { hashRuntimeToken, newRuntimeToken } from "@/lib/runtimeAuth";

type Ctx = { params: Promise<{ id: string }> };

export function POST(_req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const [device] = await db.select().from(devices).where(and(eq(devices.id, id), eq(devices.userId, user.id)));
    if (!device) throw new ApiError(404, "Device not found");
    const token = newRuntimeToken();
    await db.update(devices).set({ runtimeTokenHash: hashRuntimeToken(token), status: "pending" }).where(eq(devices.id, id));
    return NextResponse.json({ deviceId: id, token });
  });
}
