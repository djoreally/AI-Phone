import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, verifyPassword } from "@/lib/auth";
import { fail, json, readBody, str } from "@/lib/http";
import { DEMO_EMAIL, ensureDemoUser } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readBody(req);
  const email = str(body.email, 200).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (email === DEMO_EMAIL) await ensureDemoUser();
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u || !verifyPassword(password, u.passwordHash)) return fail("Incorrect email or password", 401);
  await createSession(u.id);
  return json({ ok: true });
}
