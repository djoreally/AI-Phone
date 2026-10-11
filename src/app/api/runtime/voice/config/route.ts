import { NextResponse } from "next/server";
import { pool } from "@/db";
import { ApiError, handle } from "@/lib/api";
import { requireRuntimeDevice } from "@/lib/runtimeAuth";
import { decryptVoiceSecret } from "@/lib/phone/secret";

export function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const deviceId = Number(url.searchParams.get("deviceId"));
    if (!Number.isInteger(deviceId) || deviceId <= 0) throw new ApiError(400, "Invalid deviceId");

    const device = await requireRuntimeDevice(req, deviceId);
    const result = await pool.query<{
      provider: string;
      phone_number: string;
      sip_username: string;
      sip_secret_ciphertext: string;
      status: string;
    }>(
      `select provider, phone_number, sip_username, sip_secret_ciphertext, status
       from device_voice_identities where device_id = $1 and user_id = $2 limit 1`,
      [device.id, device.userId],
    );
    const identity = result.rows[0];
    if (!identity || identity.status !== "ready") throw new ApiError(404, "Voice is not provisioned for this device");

    await pool.query("update device_voice_identities set last_config_fetch_at = now() where device_id = $1", [device.id]);

    return NextResponse.json({
      provider: identity.provider,
      phoneNumber: identity.phone_number,
      sipUsername: identity.sip_username,
      sipPassword: decryptVoiceSecret(identity.sip_secret_ciphertext),
      callerIdName: device.name,
    });
  });
}
