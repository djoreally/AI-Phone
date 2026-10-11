import { NextResponse } from "next/server";
import { ApiError, handle, readJson, str } from "@/lib/api";
import { requireRuntimeDevice } from "@/lib/runtimeAuth";
import { getVoiceProvider } from "@/lib/phone/provider";

export const dynamic = "force-dynamic";

type VoiceBody = {
  deviceId?: number;
  action?: "start" | "answer" | "reject" | "end";
  to?: string;
  providerCallId?: string;
  clientState?: string;
};

function isEmergencyNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits === "911" || digits === "112" || digits === "999";
}

export function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<VoiceBody>(req);
    const deviceId = Number(body.deviceId);
    if (!Number.isInteger(deviceId) || deviceId <= 0) throw new ApiError(400, "Invalid deviceId");

    const device = await requireRuntimeDevice(req, deviceId);
    if (!device.assignedNumber) throw new ApiError(409, "This device has no assigned phone number");

    const provider = getVoiceProvider();
    const action = body.action;

    if (action === "start") {
      const to = str(body.to);
      if (!to) throw new ApiError(400, "Destination number is required");
      if (isEmergencyNumber(to)) {
        throw new ApiError(403, "Emergency calling is reserved for the explicit phone.emergency path");
      }
      const call = await provider.startCall({
        type: "phone.call.start",
        to,
        from: device.assignedNumber,
        clientState: str(body.clientState) || undefined,
      });
      return NextResponse.json({ ok: true, call });
    }

    const providerCallId = str(body.providerCallId);
    if (!providerCallId) throw new ApiError(400, "providerCallId is required");

    if (action === "answer") await provider.answerCall(providerCallId);
    else if (action === "reject") await provider.rejectCall(providerCallId);
    else if (action === "end") await provider.endCall(providerCallId);
    else throw new ApiError(400, "Unsupported voice action");

    return NextResponse.json({ ok: true, provider: provider.name, providerCallId, action });
  });
}
