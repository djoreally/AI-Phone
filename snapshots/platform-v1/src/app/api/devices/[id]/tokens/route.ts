import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { callTokens, devices } from "@/db/schema";
import { randomId, signJwt } from "@/lib/crypto";
import { fail, json, parseId, readBody, requireUser, str } from "@/lib/http";
import { recordReceipt } from "@/lib/receipts";
import { evaluateDevice } from "@/lib/shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const TTL_SECONDS = 15 * 60;

export async function GET(_req: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const id = parseId((await ctx.params).id);
  if (!id) return fail("Invalid id", 404);
  const rows = await db
    .select()
    .from(callTokens)
    .where(and(eq(callTokens.deviceId, id), eq(callTokens.userId, user.id)))
    .orderBy(desc(callTokens.issuedAt))
    .limit(8);
  return json(
    rows.map((r) => ({
      id: r.id,
      direction: r.direction,
      numbers: r.numbers,
      status: r.status === "issued" && r.expiresAt < new Date() ? "expired" : r.status,
      issuedAt: r.issuedAt,
      expiresAt: r.expiresAt,
      usedAt: r.usedAt,
    })),
  );
}

// Auth Gateway: exchange the device's client certificate (simulated by the signed-in session) for a scoped token.
export async function POST(req: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const id = parseId((await ctx.params).id);
  if (!id) return fail("Invalid id", 404);
  const [dev] = await db.select().from(devices).where(and(eq(devices.id, id), eq(devices.userId, user.id)));
  if (!dev) return fail("Device not found", 404);
  const body = await readBody(req);
  const direction = str(body.direction, 10) === "listen" ? "listen" : "outbound";

  if (dev.lifecycle !== "active") return fail(`Device is ${dev.lifecycle}. Tokens are suspended.`, 409);
  if (dev.voiceProvider === "none") return fail("Choose a voice provider for this device first", 409);
  if (evaluateDevice(dev).readiness === "unsupported") return fail("This phone is below the support floor", 409);
  if (dev.provisioningStep < 11 || !dev.keyFingerprint) return fail("Finish key vaulting (step 10–11) before requesting tokens. The gateway needs the device certificate.", 409);
  if (direction === "outbound" && dev.approvedNumbers.length === 0) return fail("Add at least one approved number before issuing an outbound token", 400);

  const jti = randomId(12);
  const numbers = direction === "outbound" ? dev.approvedNumbers : [];
  const { token, claims } = signJwt(
    { sub: `dev_${id}`, jti, scope: direction === "outbound" ? "call.outbound" : "call.listen", numbers, provider: dev.voiceProvider },
    TTL_SECONDS,
  );
  const [row] = await db
    .insert(callTokens)
    .values({ userId: user.id, deviceId: id, jti, direction, numbers, issuedAt: new Date(claims.iat * 1000), expiresAt: new Date(claims.exp * 1000) })
    .returning();
  await recordReceipt({
    userId: user.id, deviceId: id, title: `Issued 15-minute ${direction === "outbound" ? "outbound-call" : "inbound-listener"} token`,
    executor: "voice", capabilitySlug: dev.voiceProvider === "twilio" ? "voice.twilio" : "voice.telnyx", tool: "issue_token",
    level: 1, decision: "allow", outcome: "success", authMethod: "device_certificate",
    detail: direction === "outbound" ? `Single-use JWT scoped to ${numbers.length} approved number${numbers.length === 1 ? "" : "s"}. Expires in 15 minutes.` : "Single-use JWT for the incoming-call listener. Expires in 15 minutes.",
    evidence: ["jwt_claims", `jti:${jti.slice(0, 8)}`],
  });
  return json({ token, claims, id: row.id }, 201);
}
