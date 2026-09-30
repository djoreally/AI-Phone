import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { destroySession } from "@/lib/auth";
import { fail, json, readBody, requireUser, str } from "@/lib/http";
import { resetUserData } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  return json(user);
}

export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const body = await readBody(req);
  if (body.action === "reset_demo") {
    await resetUserData(user.id);
    return json({ ok: true });
  }
  const name = str(body.name, 80);
  if (!name) return fail("Name is required");
  await db.update(users).set({ name }).where(eq(users.id, user.id));
  return json({ ...user, name });
}

export async function DELETE() {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  await db.delete(users).where(eq(users.id, user.id));
  await destroySession();
  return json({ ok: true });
}
