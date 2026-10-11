import crypto from "node:crypto";

export type TelnyxDeviceVoiceIdentity = {
  connectionId: string;
  sipUsername: string;
  sipPassword: string;
  phoneNumberId: string;
  phoneNumber: string;
};

type TelnyxEnvelope<T> = { data?: T; errors?: Array<{ detail?: string; title?: string }> };

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`https://api.telnyx.com/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env("TELNYX_API_KEY")}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as TelnyxEnvelope<T>;
  if (!response.ok || !body.data) {
    const detail = body.errors?.[0]?.detail || body.errors?.[0]?.title || `Telnyx provisioning failed (${response.status})`;
    throw new Error(detail);
  }
  return body.data;
}

function username(deviceId: number): string {
  return `aiphone${deviceId}${crypto.randomBytes(4).toString("hex")}`.slice(0, 32);
}

function password(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export async function provisionTelnyxDeviceVoice(input: {
  deviceId: number;
  deviceName: string;
  phoneNumberId: string;
  phoneNumber: string;
}): Promise<TelnyxDeviceVoiceIdentity> {
  const sipUsername = username(input.deviceId);
  const sipPassword = password();
  const outboundVoiceProfileId = env("TELNYX_OUTBOUND_VOICE_PROFILE_ID");

  const connection = await request<{ id?: string }>("/credential_connections", {
    method: "POST",
    body: JSON.stringify({
      connection_name: `AI Phone ${input.deviceId} - ${input.deviceName}`.slice(0, 100),
      user_name: sipUsername,
      password: sipPassword,
      active: true,
      outbound: {
        outbound_voice_profile_id: outboundVoiceProfileId,
      },
    }),
  });
  if (!connection.id) throw new Error("Telnyx did not return a credential connection id");

  try {
    await request<{ id?: string; phone_number?: string }>(`/phone_numbers/${encodeURIComponent(input.phoneNumberId)}`, {
      method: "PATCH",
      body: JSON.stringify({ connection_id: connection.id }),
    });
  } catch (error) {
    await fetch(`https://api.telnyx.com/v2/credential_connections/${encodeURIComponent(connection.id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env("TELNYX_API_KEY")}` },
      cache: "no-store",
    }).catch(() => undefined);
    throw error;
  }

  return {
    connectionId: connection.id,
    sipUsername,
    sipPassword,
    phoneNumberId: input.phoneNumberId,
    phoneNumber: input.phoneNumber,
  };
}
