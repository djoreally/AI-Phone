import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { capabilities } from "@/db/schema";
import { fail, json, parseId, requireUser } from "@/lib/http";
import { recordReceipt } from "@/lib/receipts";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const id = parseId((await ctx.params).id);
  if (!id) return fail("Invalid id", 404);
  const [cap] = await db.select().from(capabilities).where(and(eq(capabilities.id, id), eq(capabilities.ownerUserId, user.id)));
  if (!cap) return fail("Package not found", 404);
  await db.delete(capabilities).where(eq(capabilities.id, id));
  await recordReceipt({
    userId: user.id, title: `Withdrew ${cap.name} v${cap.version}`, executor: "mcp", capabilitySlug: cap.slug, capabilityVersion: cap.version,
    tool: "withdraw", level: 1, decision: "allow", outcome: "success", detail: "Package removed. Installations and tokens were revoked.", evidence: ["token_revocation"],
  });
  return json({ ok: true });
}
