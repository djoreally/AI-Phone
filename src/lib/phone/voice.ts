export type PhoneCallDirection = "inbound" | "outbound";
export type PhoneCallState =
  | "queued"
  | "ringing"
  | "answered"
  | "ended"
  | "rejected"
  | "failed";

export type PhoneCallCommand =
  | { type: "phone.call.start"; to: string; from?: string; clientState?: string }
  | { type: "phone.call.answer"; providerCallId: string }
  | { type: "phone.call.reject"; providerCallId: string }
  | { type: "phone.call.end"; providerCallId: string };

export type PhoneCall = {
  provider: string;
  providerCallId: string;
  direction: PhoneCallDirection;
  state: PhoneCallState;
  from: string;
  to: string;
  createdAt: string;
};

export interface VoiceProvider {
  readonly name: string;
  startCall(input: Extract<PhoneCallCommand, { type: "phone.call.start" }>): Promise<PhoneCall>;
  answerCall(providerCallId: string): Promise<void>;
  rejectCall(providerCallId: string): Promise<void>;
  endCall(providerCallId: string): Promise<void>;
}

export class VoiceProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "VoiceProviderError";
  }
}
