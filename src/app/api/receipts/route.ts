import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { receipts } from "@/db/schema";
import { ApiError, handle, num, readJson, requireUser, str, strList } from "@/lib/api";
import { authMethodFor, newReceiptRef, receiptPayload, signPayload } from "@/lib/phase1";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = await db.select().from(receipts).where(eq(receipts.userId, user.id)).orderBy(desc(receipts.createdAt)).limit(300);
    return NextResponse.json(rows);
  });
}

export function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await readJson<{ action?: string; capability?: string; executor?: string; level?: number; decision?: string; outcome?: string; summary?: string; evidence?: string[] | string; deviceId?: number | null }>(req);
    const action = str(body.action);
    if (!action) throw new ApiError(400, "Action is required");
    const decision = ["allowed", "confirmed", "denied", "step_up"].includes(str(body.decision)) ? str(body.decision) : "allowed";
    const [inserted] = await db
      .insert(receipts)
      .values({
        userId: user.id,
        receiptRef: newReceiptRef(),
        authMethod: authMethodFor(decision),
        deviceId: body.deviceId ? num(body.deviceId) : null,
        action,
        capability: str(body.capability) || "manual",
        executor: ["android", "api", "mcp", "playwright", "voice"].includes(str(body.executor)) ? str(body.executor) : "api",
        level: Math.min(4, Math.max(1, Math.round(num(body.level, 1)))),
        decision,
        outcome: ["success", "failed", "blocked"].includes(str(body.outcome)) ? str(body.outcome) : "success",
        summary: str(body.summary),
        evidence: strList(body.evidence),
        durationMs: 0,
      })
      .returning();
    const [row] = await db.update(receipts).set({ signature: signPayload(receiptPayload(inserted), inserted.deviceId) }).where(eq(receipts.id, inserted.id)).returning();
    return NextResponse.json(row, { status: 201 });
  });
}
