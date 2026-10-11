import type { VoiceProvider } from "@/lib/phone/voice";
import { TelnyxVoiceProvider } from "@/lib/phone/providers/telnyx";

export function getVoiceProvider(): VoiceProvider {
  const provider = (process.env.PHONE_VOICE_PROVIDER || "telnyx").trim().toLowerCase();
  if (provider === "telnyx") return new TelnyxVoiceProvider();
  throw new Error(`Unsupported PHONE_VOICE_PROVIDER: ${provider}`);
}
