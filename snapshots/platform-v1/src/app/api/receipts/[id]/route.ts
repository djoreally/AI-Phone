import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { receipts } from "@/db/schema";
import { fail, json, parseId, requireUser } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const id = parseId((await ctx.params).id);
  if (!id) return fail("Invalid id", 404);
  await db.delete(receipts).where(and(eq(receipts.id, id), eq(receipts.userId, user.id)));
  return json({ ok: true });
}
