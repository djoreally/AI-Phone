import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { callTokens, devices } from "@/db/schema";
import { verifyJwt } from "@/lib/crypto";
import { fail, json, readBody, str } from "@/lib/http";
import { recordReceipt } from "@/lib/receipts";

export const dynamic = "force-dynamic";

// Telephony gateway: the handset presents its token. Tokens are single-use and expire after 15 minutes.
export async function POST(req: Request) {
  const body = await readBody(req);
  const v = verifyJwt(str(body.token, 2000));
  if (!v.ok) return fail(`Token rejected: ${v.reason}`, 401);

  const [row] = await db.select().from(callTokens).where(eq(callTokens.jti, v.claims.jti));
  if (!row) return fail("Token rejected: unknown token", 401);
  if (row.status === "used") return fail("Token rejected: already used (tokens are single-use)", 401);
  if (row.status === "revoked") return fail("Token rejected: revoked", 401);

  const [dev] = await db.select().from(devices).where(eq(devices.id, row.deviceId));
  if (!dev || dev.lifecycle !== "active") return fail("Token rejected: device is not active", 401);

  // Atomic single-use: only one request can flip issued → used.
  const claimed = await db
    .update(callTokens)
    .set({ status: "used", usedAt: new Date() })
    .where(and(eq(callTokens.id, row.id), eq(callTokens.status, "issued")))
    .returning({ id: callTokens.id });
  if (claimed.length === 0) return fail("Token rejected: already used (tokens are single-use)", 401);

  if (row.direction === "listen") {
    await db.update(devices).set({ sipStatus: "registered", lastSeenAt: new Date() }).where(eq(devices.id, dev.id));
  }
  await recordReceipt({
    userId: row.userId, deviceId: dev.id,
    title: row.direction === "listen" ? "SIP registered — listening for incoming calls" : "Outbound call session authorized",
    executor: "voice", capabilitySlug: v.claims.provider === "twilio" ? "voice.twilio" : "voice.telnyx", tool: "gateway_redeem",
    level: 1, decision: "allow", outcome: "success", authMethod: "device_certificate",
    detail: row.direction === "listen" ? "WSS signaling connected with an ephemeral token. Device is in active listening standby." : `Session scoped to: ${row.numbers.join(", ")}.`,
    evidence: ["wss_handshake", `jti:${row.jti.slice(0, 8)}`],
    providerSessionId: `GW${row.jti.slice(0, 10)}`,
  });
  return json({ ok: true, scope: v.claims.scope, numbers: v.claims.numbers, sub: v.claims.sub });
}
