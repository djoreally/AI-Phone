import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { devices } from "@/db/schema";
import { ApiError, handle, readJson, requireUser, str } from "@/lib/api";
import { encryptVoiceSecret } from "@/lib/phone/secret";
import { provisionTelnyxDeviceVoice } from "@/lib/phone/providers/telnyxProvisioning";

type Ctx = { params: Promise<{ id: string }> };

export function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const deviceId = Number(id);
    if (!Number.isInteger(deviceId) || deviceId <= 0) throw new ApiError(400, "Invalid device id");

    const body = await readJson<{ phoneNumberId?: string; phoneNumber?: string }>(req);
    const phoneNumberId = str(body.phoneNumberId);
    const phoneNumber = str(body.phoneNumber);
    if (!phoneNumberId || !phoneNumber) throw new ApiError(400, "phoneNumberId and phoneNumber are required");

    const [device] = await db.select().from(devices).where(and(eq(devices.id, deviceId), eq(devices.userId, user.id))).limit(1);
    if (!device) throw new ApiError(404, "Device not found");
    if (device.status === "revoked" || device.status === "blocked") throw new ApiError(409, `Device is ${device.status}`);

    const existing = await pool.query("select id from device_voice_identities where device_id = $1 limit 1", [device.id]);
    if (existing.rowCount) throw new ApiError(409, "Voice is already provisioned for this device");

    const identity = await provisionTelnyxDeviceVoice({
      deviceId: device.id,
      deviceName: device.name,
      phoneNumberId,
      phoneNumber,
    });

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into device_voice_identities
          (device_id, user_id, provider, provider_connection_id, provider_phone_number_id, phone_number, sip_username, sip_secret_ciphertext, status)
         values ($1,$2,'telnyx',$3,$4,$5,$6,$7,'ready')`,
        [device.id, user.id, identity.connectionId, identity.phoneNumberId, identity.phoneNumber, identity.sipUsername, encryptVoiceSecret(identity.sipPassword)],
      );
      await client.query(
        "update devices set voice_provider = 'telnyx', assigned_number = $1 where id = $2 and user_id = $3",
        [identity.phoneNumber, device.id, user.id],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    return NextResponse.json({
      ok: true,
      provider: "telnyx",
      deviceId: device.id,
      phoneNumber: identity.phoneNumber,
      connectionId: identity.connectionId,
      status: "ready",
    }, { status: 201 });
  });
}
