import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { devices, provisioningRuns } from "@/db/schema";
import { ApiError, handle, num, readJson, requireUser, str } from "@/lib/api";
import { initialSteps, keyFingerprint } from "@/lib/phase1";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = await db.select().from(provisioningRuns).where(eq(provisioningRuns.userId, user.id)).orderBy(desc(provisioningRuns.createdAt));
    return NextResponse.json(rows);
  });
}

export function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await readJson<{ deviceId?: number; transport?: string }>(req);
    const deviceId = num(body.deviceId);
    const [device] = await db.select().from(devices).where(and(eq(devices.id, deviceId), eq(devices.userId, user.id)));
    if (!device) throw new ApiError(404, "Device not found");
    const transport = str(body.transport) === "qr_enrollment" ? "qr_enrollment" : "usb_adb";
    const [run] = await db
      .insert(provisioningRuns)
      .values({ userId: user.id, deviceId, transport, steps: initialSteps(device, transport), currentStep: 0, status: "running", keyFingerprint: keyFingerprint(device.id) })
      .returning();
    return NextResponse.json(run, { status: 201 });
  });
}
