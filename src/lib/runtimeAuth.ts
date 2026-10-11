import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { ApiError } from "@/lib/api";

export function newRuntimeToken() {
  return randomBytes(32).toString("base64url");
}

export function hashRuntimeToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function bearer(req: Request) {
  const value = req.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function requireRuntimeDevice(req: Request, deviceId: number) {
  const token = bearer(req);
  if (!token) throw new ApiError(401, "Missing runtime credential");
  const [device] = await db.select().from(devices).where(and(eq(devices.id, deviceId)));
  if (!device?.runtimeTokenHash) throw new ApiError(401, "Device is not enrolled");
  const actual = Buffer.from(hashRuntimeToken(token), "hex");
  const expected = Buffer.from(device.runtimeTokenHash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ApiError(401, "Invalid runtime credential");
  if (device.status === "revoked") throw new ApiError(403, "Device is revoked");
  return device;
}
