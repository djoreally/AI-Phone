import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { handle, readJson, requireUser } from "@/lib/api";

import { parseDevice, type DeviceInput } from "@/lib/parsers";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = await db.select().from(devices).where(eq(devices.userId, user.id)).orderBy(desc(devices.createdAt));
    return NextResponse.json(rows);
  });
}

export function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await readJson<Partial<DeviceInput>>(req);
    const values = parseDevice(body);
    const [row] = await db.insert(devices).values({ ...values, userId: user.id, lastSeenAt: new Date() }).returning();
    return NextResponse.json(row, { status: 201 });
  });
}
