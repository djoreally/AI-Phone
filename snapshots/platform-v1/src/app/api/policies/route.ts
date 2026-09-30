import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { policies } from "@/db/schema";
import { policyFields } from "@/lib/fields";
import { fail, json, readBody, requireUser } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const rows = await db.select().from(policies).where(eq(policies.userId, user.id)).orderBy(asc(policies.id));
  return json(rows);
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const body = await readBody(req);
  try {
    const f = policyFields(body, false) as typeof policies.$inferInsert;
    const [row] = await db.insert(policies).values({ ...f, userId: user.id }).returning();
    return json(row, 201);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Invalid policy");
  }
}
