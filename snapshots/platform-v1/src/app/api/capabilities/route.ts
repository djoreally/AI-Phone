import { asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { capabilities, installations } from "@/db/schema";
import { fail, json, requireUser } from "@/lib/http";
import { verifyStored } from "@/lib/mcp";
import { ensureCatalog } from "@/lib/catalogStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  await ensureCatalog();
  const caps = await db
    .select()
    .from(capabilities)
    .where(or(isNull(capabilities.ownerUserId), eq(capabilities.ownerUserId, user.id)))
    .orderBy(asc(capabilities.id));
  const installs = await db.select().from(installations).where(eq(installations.userId, user.id));
  const byCap = new Map(installs.map((i) => [i.capabilityId, i]));
  return json(
    caps.map((c) => {
      const i = byCap.get(c.id);
      return {
        ...c,
        owned: c.ownerUserId === user.id,
        integrity: verifyStored(c),
        installation: i ? { status: i.status, lastHealthCheckAt: i.lastHealthCheckAt, installedAt: i.installedAt } : null,
      };
    }),
  );
}
