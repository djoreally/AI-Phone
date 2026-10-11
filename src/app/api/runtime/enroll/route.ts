import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { ApiError, handle, readJson } from "@/lib/api";
import { requireRuntimeDevice } from "@/lib/runtimeAuth";

type Body = { deviceId: number; publicKeyPem: string; keyFingerprint: string };

export function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<Body>(req);
    if (!Number.isInteger(body.deviceId) || body.deviceId <= 0) throw new ApiError(400, "Invalid deviceId");
    if (!body.publicKeyPem?.includes("BEGIN PUBLIC KEY")) throw new ApiError(400, "Invalid public key");
    if (!body.keyFingerprint?.trim()) throw new ApiError(400, "Missing key fingerprint");
    const device = await requireRuntimeDevice(req, body.deviceId);
    await db.update(devices).set({
      publicKeyPem: body.publicKeyPem.trim(),
      keyFingerprint: body.keyFingerprint.trim(),
      enrolledAt: new Date(),
      lastSeenAt: new Date(),
      status: "ready",
    }).where(eq(devices.id, device.id));
    return NextResponse.json({ ok: true, deviceId: device.id, status: "ready" });
  });
}
