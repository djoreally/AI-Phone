import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { voiceTokens } from "@/db/schema";
import { ApiError, handle, idFrom, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export function DELETE(_: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const [row] = await db.update(voiceTokens).set({ revoked: true }).where(and(eq(voiceTokens.id, id), eq(voiceTokens.userId, user.id))).returning();
    if (!row) throw new ApiError(404, "Token not found");
    return NextResponse.json(row);
  });
}
