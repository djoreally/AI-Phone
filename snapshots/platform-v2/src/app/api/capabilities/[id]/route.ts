import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { capabilities } from "@/db/schema";
import { ApiError, handle, idFrom, readJson, requireUser } from "@/lib/api";
import { parseCapability, type CapabilityInput } from "@/lib/parsers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const body = await readJson<Partial<CapabilityInput> & { action?: string }>(req);
    const [existing] = await db.select().from(capabilities).where(and(eq(capabilities.id, id), eq(capabilities.userId, user.id)));
    if (!existing) throw new ApiError(404, "Capability not found");

    if (body.action === "install") {
      const [row] = await db.update(capabilities).set({ status: "installed", healthy: true, installedAt: new Date() }).where(eq(capabilities.id, id)).returning();
      return NextResponse.json(row);
    }
    if (body.action === "revoke") {
      const [row] = await db.update(capabilities).set({ status: "revoked" }).where(eq(capabilities.id, id)).returning();
      return NextResponse.json(row);
    }
    if (body.action === "health") {
      const [row] = await db.update(capabilities).set({ healthy: true }).where(eq(capabilities.id, id)).returning();
      return NextResponse.json(row);
    }
    const values = parseCapability({ ...existing, ...body });
    const [row] = await db.update(capabilities).set({ ...values, tools: existing.tools.length ? existing.tools : values.tools }).where(eq(capabilities.id, id)).returning();
    return NextResponse.json(row);
  });
}

export function DELETE(_: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const deleted = await db.delete(capabilities).where(and(eq(capabilities.id, id), eq(capabilities.userId, user.id))).returning({ id: capabilities.id });
    if (!deleted.length) throw new ApiError(404, "Capability not found");
    return NextResponse.json({ ok: true });
  });
}
