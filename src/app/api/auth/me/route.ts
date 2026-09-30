import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, handle, readJson, requireUser, str } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => {
    const user = await requireUser();
    return NextResponse.json({ id: user.id, name: user.name, email: user.email, organization: user.organization });
  });
}

export function PATCH(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await readJson<{ name?: string; organization?: string; currentPassword?: string; newPassword?: string }>(req);
    const update: Partial<typeof users.$inferInsert> = {};
    if (body.name !== undefined) {
      const name = str(body.name);
      if (!name) throw new ApiError(400, "Name cannot be empty");
      update.name = name;
    }
    if (body.organization !== undefined) update.organization = str(body.organization) || "Personal workspace";
    if (body.newPassword) {
      if (!verifyPassword(str(body.currentPassword), user.passwordHash)) throw new ApiError(400, "Current password is incorrect");
      if (body.newPassword.length < 8) throw new ApiError(400, "New password must be at least 8 characters");
      update.passwordHash = hashPassword(body.newPassword);
    }
    const [updated] = await db.update(users).set(update).where(eq(users.id, user.id)).returning();
    return NextResponse.json({ id: updated.id, name: updated.name, email: updated.email, organization: updated.organization });
  });
}
