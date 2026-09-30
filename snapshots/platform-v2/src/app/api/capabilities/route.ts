import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { capabilities } from "@/db/schema";
import { handle, readJson, requireUser } from "@/lib/api";

import { parseCapability, type CapabilityInput } from "@/lib/parsers";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = await db.select().from(capabilities).where(eq(capabilities.userId, user.id)).orderBy(asc(capabilities.name));
    return NextResponse.json(rows);
  });
}

export function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await readJson<Partial<CapabilityInput>>(req);
    const values = parseCapability(body);
    const [row] = await db.insert(capabilities).values({ ...values, userId: user.id, status: "available" }).returning();
    return NextResponse.json(row, { status: 201 });
  });
}
