import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { devices, voiceTokens } from "@/db/schema";
import { ApiError, handle, num, readJson, requireUser, str } from "@/lib/api";
import { mintVoiceToken } from "@/lib/phase1";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = await db.select().from(voiceTokens).where(eq(voiceTokens.userId, user.id)).orderBy(desc(voiceTokens.createdAt)).limit(50);
    return NextResponse.json(rows);
  });
}

export function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await readJson<{ deviceId?: number; scope?: string; allowedNumber?: string }>(req);
    const [device] = await db.select().from(devices).where(and(eq(devices.id, num(body.deviceId)), eq(devices.userId, user.id)));
    if (!device) throw new ApiError(404, "Device not found");
    if (device.status === "revoked" || device.status === "blocked") throw new ApiError(403, `Auth gateway refused: device is ${device.status}`);
    const scope = str(body.scope) === "inbound_listener" ? "inbound_listener" : "outbound";
    const allowedNumber = scope === "outbound" ? str(body.allowedNumber) || null : null;
    if (scope === "outbound" && !allowedNumber) throw new ApiError(400, "Outbound tokens must be scoped to an approved number");
    const minted = mintVoiceToken(device, scope, allowedNumber);
    const [row] = await db.insert(voiceTokens).values({ userId: user.id, deviceId: device.id, jti: minted.jti, provider: device.voiceProvider, scope, allowedNumber, token: minted.token, expiresAt: minted.expiresAt }).returning();
    return NextResponse.json(row, { status: 201 });
  });
}
