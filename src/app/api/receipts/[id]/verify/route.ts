import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { receipts } from "@/db/schema";
import { ApiError, handle, idFrom, requireUser } from "@/lib/api";
import { receiptPayload, verifyReceipt } from "@/lib/phase1";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export function GET(_: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const [row] = await db.select().from(receipts).where(and(eq(receipts.id, id), eq(receipts.userId, user.id)));
    if (!row) throw new ApiError(404, "Receipt not found");
    return NextResponse.json({ ...verifyReceipt(row), payload: { ...receiptPayload(row), signature: row.signature } });
  });
}
