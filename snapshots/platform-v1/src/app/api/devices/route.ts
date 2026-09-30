import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { deviceFields } from "@/lib/fields";
import { fail, json, readBody, requireUser } from "@/lib/http";
import { randomId } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const rows = await db.select().from(devices).where(eq(devices.userId, user.id)).orderBy(desc(devices.createdAt));
  return json(rows);
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const body = await readBody(req);
  try {
    const fields = deviceFields(body, false) as typeof devices.$inferInsert;
    const [row] = await db
      .insert(devices)
      .values({ ...fields, userId: user.id, provisioningStep: 1, battery: 100, serial: `PXL${randomId(4).toUpperCase()}` })
      .returning();
    return json(row, 201);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Invalid device");
  }
}
