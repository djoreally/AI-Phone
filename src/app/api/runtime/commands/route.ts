import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { devices, runtimeCommands } from "@/db/schema";
import { ApiError, handle } from "@/lib/api";
import { requireRuntimeDevice } from "@/lib/runtimeAuth";

export function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const deviceId = Number(url.searchParams.get("deviceId"));
    if (!Number.isInteger(deviceId) || deviceId <= 0) throw new ApiError(400, "Invalid deviceId");
    const device = await requireRuntimeDevice(req, deviceId);
    const [command] = await db.select().from(runtimeCommands)
      .where(and(eq(runtimeCommands.deviceId, device.id), eq(runtimeCommands.status, "queued")))
      .orderBy(asc(runtimeCommands.createdAt))
      .limit(1);
    if (!command) {
      await db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, device.id));
      return NextResponse.json({ command: null });
    }
    await db.transaction(async (tx) => {
      await tx.update(runtimeCommands).set({ status: "delivered", deliveredAt: new Date() }).where(eq(runtimeCommands.id, command.id));
      await tx.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, device.id));
    });
    return NextResponse.json({ command: { ...command, status: "delivered" } });
  });
}
