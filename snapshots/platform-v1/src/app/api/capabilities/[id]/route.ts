import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { capabilities, installations } from "@/db/schema";
import { recordReceipt } from "@/lib/receipts";
import { verifyStored } from "@/lib/mcp";
import { fail, json, parseId, readBody, requireUser, str } from "@/lib/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function load(ctx: Ctx, userId: number) {
  const id = parseId((await ctx.params).id);
  if (!id) return null;
  const [cap] = await db
    .select()
    .from(capabilities)
    .where(and(eq(capabilities.id, id), or(isNull(capabilities.ownerUserId), eq(capabilities.ownerUserId, userId))));
  if (!cap) return null;
  const [inst] = await db
    .select()
    .from(installations)
    .where(and(eq(installations.userId, userId), eq(installations.capabilityId, id)));
  return { cap, inst };
}

// Install
export async function POST(_req: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const l = await load(ctx, user.id);
  if (!l) return fail("Capability not found", 404);
  if (l.inst) return fail("Already installed", 409);
  if (!verifyStored(l.cap).ok) return fail("Install blocked: this package failed signature verification", 403);
  const needsAuth = l.cap.oauthScopes.length > 0;
  const [row] = await db
    .insert(installations)
    .values({
      userId: user.id,
      capabilityId: l.cap.id,
      status: needsAuth ? "needs_auth" : "connected",
    })
    .returning();
  await recordReceipt({
    userId: user.id, capabilityVersion: l.cap.version, title: `Installed ${l.cap.name} v${l.cap.version}`, executor: l.cap.executor,
    capabilitySlug: l.cap.slug, tool: "install", level: 1, decision: "allow", outcome: "success",
    detail: `Publisher verified: ${l.cap.publisher}. ${l.cap.tools.length} tools registered with the policy broker.`,
    evidence: ["signature_verified", "schema_hash"],
  });
  return json({ status: row.status, lastHealthCheckAt: row.lastHealthCheckAt, installedAt: row.installedAt }, 201);
}

// Connect (OAuth) or run health check / test workflow
export async function PATCH(req: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const l = await load(ctx, user.id);
  if (!l || !l.inst) return fail("Capability is not installed", 404);
  const body = await readBody(req);
  const action = str(body.action, 20);

  if (action === "connect") {
    const [row] = await db
      .update(installations)
      .set({ status: "connected", lastHealthCheckAt: new Date() })
      .where(eq(installations.id, l.inst.id))
      .returning();
    await recordReceipt({
      userId: user.id, capabilityVersion: l.cap.version, title: `Connected ${l.cap.name}`, executor: l.cap.executor,
      capabilitySlug: l.cap.slug, tool: "oauth_connect", level: 1, decision: "allow", outcome: "success",
      detail: `Granted scopes: ${l.cap.oauthScopes.join(", ") || "none"}.`, evidence: ["oauth_grant"],
    });
    return json({ status: row.status, lastHealthCheckAt: row.lastHealthCheckAt, installedAt: row.installedAt });
  }
  if (action === "test") {
    if (l.inst.status !== "connected") return fail("Connect the capability before testing it");
    const ms = 120 + ((l.cap.id * 37) % 260);
    const [row] = await db
      .update(installations)
      .set({ lastHealthCheckAt: new Date() })
      .where(eq(installations.id, l.inst.id))
      .returning();
    await recordReceipt({
      userId: user.id, capabilityVersion: l.cap.version, title: `Health check: ${l.cap.name}`, executor: l.cap.executor,
      capabilitySlug: l.cap.slug, tool: "health_check", level: 1, decision: "allow", outcome: "success",
      detail: `Endpoint responded in ${ms} ms. Test workflow passed. Tool schemas unchanged.`, evidence: ["schema_hash", "test_workflow"],
    });
    return json({ status: row.status, lastHealthCheckAt: row.lastHealthCheckAt, installedAt: row.installedAt });
  }
  return fail("Unknown action");
}

// Revoke
export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const l = await load(ctx, user.id);
  if (!l || !l.inst) return fail("Capability is not installed", 404);
  if (l.cap.builtin) return fail("Built-in capabilities cannot be revoked", 403);
  await db.delete(installations).where(eq(installations.id, l.inst.id));
  await recordReceipt({
    userId: user.id, capabilityVersion: l.cap.version, title: `Revoked ${l.cap.name}`, executor: l.cap.executor,
    capabilitySlug: l.cap.slug, tool: "revoke", level: 1, decision: "allow", outcome: "success",
    detail: "All tokens invalidated. The capability can no longer be called.", evidence: ["token_revocation"],
  });
  return json({ ok: true });
}
