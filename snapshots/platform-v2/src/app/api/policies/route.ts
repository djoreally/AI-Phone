import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { policies } from "@/db/schema";
import { handle, readJson, requireUser } from "@/lib/api";

import { parsePolicy, type PolicyInput } from "@/lib/parsers";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = await db.select().from(policies).where(eq(policies.userId, user.id)).orderBy(asc(policies.priority));
    return NextResponse.json(rows);
  });
}

export function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await readJson<Partial<PolicyInput>>(req);
    const [row] = await db.insert(policies).values({ ...parsePolicy(body), userId: user.id }).returning();
    return NextResponse.json(row, { status: 201 });
  });
}
