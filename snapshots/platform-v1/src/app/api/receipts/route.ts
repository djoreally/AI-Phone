import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { devices, receipts } from "@/db/schema";
import { fail, json, requireUser } from "@/lib/http";
import { receiptPayload, verifyReceipt } from "@/lib/receipts";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const rows = await db
    .select({ r: receipts, deviceName: devices.name })
    .from(receipts)
    .leftJoin(devices, eq(devices.id, receipts.deviceId))
    .where(eq(receipts.userId, user.id))
    .orderBy(desc(receipts.createdAt), desc(receipts.id))
    .limit(200);
  return json(
    rows.map(({ r, deviceName }) => ({
      id: r.id,
      planId: r.planId,
      deviceId: r.deviceId,
      deviceName,
      title: r.title,
      executor: r.executor,
      capabilitySlug: r.capabilitySlug,
      tool: r.tool,
      level: r.level,
      decision: r.decision,
      outcome: r.outcome,
      detail: r.detail,
      evidence: r.evidence,
      createdAt: r.createdAt,
      uid: r.uid,
      signature: r.signature,
      signatureStatus: verifyReceipt(r),
      payload: receiptPayload(r),
    })),
  );
}
