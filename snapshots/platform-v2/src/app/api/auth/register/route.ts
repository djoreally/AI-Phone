import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, hashPassword } from "@/lib/auth";
import { ApiError, handle, readJson, str } from "@/lib/api";
import { seedWorkspace } from "@/lib/seed";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ name?: string; email?: string; password?: string; organization?: string }>(req);
    const name = str(body.name);
    const email = str(body.email).toLowerCase();
    const password = str(body.password);
    const organization = str(body.organization) || "Personal workspace";
    if (!name || !email || !password) throw new ApiError(400, "Name, email, and password are required");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, "Enter a valid email address");
    if (password.length < 8) throw new ApiError(400, "Password must be at least 8 characters");
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length) throw new ApiError(409, "An account with that email already exists");
    const [user] = await db.insert(users).values({ name, email, organization, passwordHash: hashPassword(password) }).returning();
    await seedWorkspace(user.id);
    await createSession(user.id);
    return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } }, { status: 201 });
  });
}
