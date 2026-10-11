import {
  PhoneCall,
  VoiceProvider,
  VoiceProviderError,
} from "@/lib/phone/voice";

type TelnyxCallResponse = {
  data?: {
    call_control_id?: string;
    call_leg_id?: string;
    from?: string;
    to?: string;
  };
  errors?: Array<{ detail?: string; title?: string }>;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new VoiceProviderError(`${name} is not configured`, "telnyx");
  return value;
}

async function telnyxRequest(path: string, init: RequestInit) {
  const apiKey = requireEnv("TELNYX_API_KEY");
  const response = await fetch(`https://api.telnyx.com/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as TelnyxCallResponse;
  if (!response.ok) {
    const detail = body.errors?.[0]?.detail || body.errors?.[0]?.title || `Telnyx request failed (${response.status})`;
    throw new VoiceProviderError(detail, "telnyx", response.status);
  }
  return body;
}

export class TelnyxVoiceProvider implements VoiceProvider {
  readonly name = "telnyx";

  async startCall(input: { type: "phone.call.start"; to: string; from?: string; clientState?: string }): Promise<PhoneCall> {
    const connectionId = requireEnv("TELNYX_CALL_CONTROL_CONNECTION_ID");
    const from = input.from?.trim() || requireEnv("TELNYX_DEFAULT_FROM_NUMBER");

    const body = await telnyxRequest("/calls", {
      method: "POST",
      body: JSON.stringify({
        connection_id: connectionId,
        to: input.to,
        from,
        ...(input.clientState ? { client_state: input.clientState } : {}),
      }),
    });

    const providerCallId = body.data?.call_control_id || body.data?.call_leg_id;
    if (!providerCallId) throw new VoiceProviderError("Telnyx did not return a call identifier", "telnyx");

    return {
      provider: this.name,
      providerCallId,
      direction: "outbound",
      state: "queued",
      from: body.data?.from || from,
      to: body.data?.to || input.to,
      createdAt: new Date().toISOString(),
    };
  }

  async answerCall(providerCallId: string) {
    await telnyxRequest(`/calls/${encodeURIComponent(providerCallId)}/actions/answer`, {
      method: "POST",
      body: "{}",
    });
  }

  async rejectCall(providerCallId: string) {
    await telnyxRequest(`/calls/${encodeURIComponent(providerCallId)}/actions/hangup`, {
      method: "POST",
      body: JSON.stringify({ cause: "CALL_REJECTED" }),
    });
  }

  async endCall(providerCallId: string) {
    await telnyxRequest(`/calls/${encodeURIComponent(providerCallId)}/actions/hangup`, {
      method: "POST",
      body: "{}",
    });
  }
}
