import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { policies } from "@/db/schema";
import { ApiError, handle, idFrom, readJson, requireUser } from "@/lib/api";
import { parsePolicy, type PolicyInput } from "@/lib/parsers";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const body = await readJson<Partial<PolicyInput>>(req);
    const [existing] = await db.select().from(policies).where(and(eq(policies.id, id), eq(policies.userId, user.id)));
    if (!existing) throw new ApiError(404, "Policy not found");
    const [row] = await db.update(policies).set(parsePolicy({ ...existing, ...body })).where(eq(policies.id, id)).returning();
    return NextResponse.json(row);
  });
}

export function DELETE(_: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const deleted = await db.delete(policies).where(and(eq(policies.id, id), eq(policies.userId, user.id))).returning({ id: policies.id });
    if (!deleted.length) throw new ApiError(404, "Policy not found");
    return NextResponse.json({ ok: true });
  });
}
