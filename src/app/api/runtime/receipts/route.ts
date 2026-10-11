import { createVerify } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { receipts, runtimeCommands } from "@/db/schema";
import { ApiError, handle, readJson } from "@/lib/api";
import { requireRuntimeDevice } from "@/lib/runtimeAuth";

type Body = {
  deviceId: number;
  commandId?: number | null;
  payload: string;
  signature: string;
};

type SignedReceipt = {
  uid: string;
  createdAt: string;
  capability: string;
  tool: string;
  decision: string;
  outcome: string;
  target?: string;
  detail?: string;
  keyFingerprint: string;
};

export function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<Body>(req);
    if (!Number.isInteger(body.deviceId) || body.deviceId <= 0) throw new ApiError(400, "Invalid deviceId");
    const device = await requireRuntimeDevice(req, body.deviceId);
    if (!device.publicKeyPem || !device.keyFingerprint) throw new ApiError(409, "Device public key is not enrolled");
    const parsed = JSON.parse(body.payload) as SignedReceipt;
    if (parsed.keyFingerprint !== device.keyFingerprint) throw new ApiError(400, "Receipt key fingerprint mismatch");
    const verifier = createVerify("SHA256");
    verifier.update(Buffer.from(body.payload, "utf8"));
    verifier.end();
    const valid = verifier.verify(device.publicKeyPem, Buffer.from(body.signature, "base64"));
    if (!valid) throw new ApiError(400, "Invalid device receipt signature");

    await db.transaction(async (tx) => {
      await tx.insert(receipts).values({
        userId: device.userId,
        deviceId: device.id,
        action: parsed.tool,
        capability: parsed.capability,
        executor: "android",
        level: 3,
        decision: parsed.decision,
        outcome: parsed.outcome === "cancelled" ? "blocked" : parsed.outcome,
        summary: parsed.detail ?? "",
        evidence: ["device_signature_verified", parsed.uid],
        receiptRef: parsed.uid.slice(0, 60),
        authMethod: parsed.decision === "confirm" ? "ui_confirmation_card" : "auto_policy",
        signature: body.signature,
        createdAt: new Date(parsed.createdAt),
      });
      if (body.commandId) {
        await tx.update(runtimeCommands).set({
          status: parsed.outcome === "success" ? "completed" : "failed",
          completedAt: new Date(),
        }).where(eq(runtimeCommands.id, body.commandId));
      }
    });
    return NextResponse.json({ ok: true, signatureVerified: true, receiptRef: parsed.uid });
  });
}
