import { NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { requireRuntimeDevice } from "@/lib/runtimeAuth";

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ApiError(503, `${name} is not configured`);
  return value;
}

export function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const deviceId = Number(url.searchParams.get("deviceId"));
    if (!Number.isInteger(deviceId) || deviceId <= 0) throw new ApiError(400, "Invalid deviceId");
    await requireRuntimeDevice(req, deviceId);

    return NextResponse.json({
      firebase: {
        applicationId: env("AI_PHONE_FIREBASE_APPLICATION_ID"),
        projectId: env("AI_PHONE_FIREBASE_PROJECT_ID"),
        apiKey: env("AI_PHONE_FIREBASE_API_KEY"),
        gcmSenderId: env("AI_PHONE_FIREBASE_SENDER_ID"),
      },
    });
  });
}
