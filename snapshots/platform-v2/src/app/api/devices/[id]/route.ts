import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { ApiError, handle, idFrom, readJson, requireUser } from "@/lib/api";
import { parseDevice, type DeviceInput } from "@/lib/parsers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export function GET(_: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const [row] = await db.select().from(devices).where(and(eq(devices.id, id), eq(devices.userId, user.id)));
    if (!row) throw new ApiError(404, "Device not found");
    return NextResponse.json(row);
  });
}

export function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const body = await readJson<Partial<DeviceInput> & { action?: string }>(req);
    const [existing] = await db.select().from(devices).where(and(eq(devices.id, id), eq(devices.userId, user.id)));
    if (!existing) throw new ApiError(404, "Device not found");

    if (body.action === "approve") {
      const compatibility = existing.compatibility.map((c) => (c.status === "awaiting" ? { ...c, status: "supported" as const, note: "Approved by user" } : c));
      const unsupported = compatibility.some((c) => c.status === "unsupported");
      const [row] = await db.update(devices).set({ compatibility, status: unsupported ? "blocked" : "ready", lastSeenAt: new Date() }).where(eq(devices.id, id)).returning();
      return NextResponse.json(row);
    }
    if (body.action === "revoke") {
      const [row] = await db.update(devices).set({ status: "revoked" }).where(eq(devices.id, id)).returning();
      return NextResponse.json(row);
    }
    if (body.action === "recertify") {
      const values = parseDevice(existing);
      const [row] = await db.update(devices).set({ compatibility: values.compatibility, status: values.status, lastSeenAt: new Date() }).where(eq(devices.id, id)).returning();
      return NextResponse.json(row);
    }

    const values = parseDevice({ ...existing, ...body });
    const [row] = await db.update(devices).set({ ...values, lastSeenAt: new Date() }).where(eq(devices.id, id)).returning();
    return NextResponse.json(row);
  });
}

export function DELETE(_: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const deleted = await db.delete(devices).where(and(eq(devices.id, id), eq(devices.userId, user.id))).returning({ id: devices.id });
    if (!deleted.length) throw new ApiError(404, "Device not found");
    return NextResponse.json({ ok: true });
  });
}
