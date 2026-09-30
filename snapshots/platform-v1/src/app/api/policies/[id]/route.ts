import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { policies } from "@/db/schema";
import { fail, json, parseId, readBody, requireUser } from "@/lib/http";
import { policyFields } from "@/lib/fields";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const id = parseId((await ctx.params).id);
  if (!id) return fail("Invalid id", 404);
  const body = await readBody(req);
  try {
    const patch = policyFields(body, true);
    if (Object.keys(patch).length === 0) return fail("Nothing to update");
    const [row] = await db
      .update(policies)
      .set(patch)
      .where(and(eq(policies.id, id), eq(policies.userId, user.id)))
      .returning();
    if (!row) return fail("Policy not found", 404);
    return json(row);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Invalid policy");
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const id = parseId((await ctx.params).id);
  if (!id) return fail("Invalid id", 404);
  await db.delete(policies).where(and(eq(policies.id, id), eq(policies.userId, user.id)));
  return json({ ok: true });
}
