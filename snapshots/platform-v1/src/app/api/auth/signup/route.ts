import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, hashPassword } from "@/lib/auth";
import { fail, json, readBody, str } from "@/lib/http";
import { resetUserData } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readBody(req);
  const name = str(body.name, 80);
  const email = str(body.email, 200).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!name) return fail("Please enter your name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Please enter a valid email");
  if (password.length < 8) return fail("Password must be at least 8 characters");

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return fail("An account with that email already exists", 409);

  const [u] = await db
    .insert(users)
    .values({ name, email, passwordHash: hashPassword(password) })
    .returning({ id: users.id });
  await resetUserData(u.id);
  await createSession(u.id);
  return json({ ok: true });
}
