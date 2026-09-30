import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { receipts } from "@/db/schema";
import { ApiError, handle, idFrom, readJson, requireUser, str, strList } from "@/lib/api";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const body = await readJson<{ summary?: string; evidence?: string[] | string; outcome?: string }>(req);
    const update: Partial<typeof receipts.$inferInsert> = {};
    if (body.summary !== undefined) update.summary = str(body.summary);
    if (body.evidence !== undefined) update.evidence = strList(body.evidence);
    if (body.outcome !== undefined && ["success", "failed", "blocked"].includes(body.outcome)) update.outcome = body.outcome;
    const [row] = await db.update(receipts).set(update).where(and(eq(receipts.id, id), eq(receipts.userId, user.id))).returning();
    if (!row) throw new ApiError(404, "Receipt not found");
    return NextResponse.json(row);
  });
}

export function DELETE(_: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const deleted = await db.delete(receipts).where(and(eq(receipts.id, id), eq(receipts.userId, user.id))).returning({ id: receipts.id });
    if (!deleted.length) throw new ApiError(404, "Receipt not found");
    return NextResponse.json({ ok: true });
  });
}
