import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, verifyPassword } from "@/lib/auth";
import { ApiError, handle, readJson, str } from "@/lib/api";
import { ensureDemoUser, seedWorkspace } from "@/lib/seed";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return handle(async () => {
    await ensureDemoUser();
    const body = await readJson<{ email?: string; password?: string }>(req);
    const email = str(body.email).toLowerCase();
    const password = str(body.password);
    if (!email || !password) throw new ApiError(400, "Email and password are required");
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !verifyPassword(password, user.passwordHash)) throw new ApiError(401, "Invalid email or password");
    await seedWorkspace(user.id);
    await createSession(user.id);
    return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
  });
}
