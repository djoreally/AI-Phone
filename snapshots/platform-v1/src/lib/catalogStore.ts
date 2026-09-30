import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { capabilities } from "@/db/schema";
import { CATALOG_ROWS } from "@/lib/catalog";
import { MCP_VERSION, curatedManifest, enrichCuratedTools, marketplaceKey, signManifest } from "@/lib/mcp";

/** Seeds curated capabilities and gives every one a marketplace-countersigned manifest. */
export async function ensureCatalog() {
  const existing = await db.select({ slug: capabilities.slug }).from(capabilities);
  const have = new Set(existing.map((e) => e.slug));
  const missing = CATALOG_ROWS.filter((r) => !have.has(r.slug));
  if (missing.length) await db.insert(capabilities).values(missing).onConflictDoNothing();

  const pending = await db
    .select()
    .from(capabilities)
    .where(and(isNull(capabilities.manifest), isNull(capabilities.ownerUserId)));
  if (pending.length === 0) return;
  const key = marketplaceKey();
  for (const c of pending) {
    const tools = enrichCuratedTools(c.tools);
    const manifest = curatedManifest({ ...c, tools });
    await db
      .update(capabilities)
      .set({
        tools,
        manifest: manifest as unknown as Record<string, unknown>,
        signature: signManifest(manifest, key.privateKey),
        publisherKey: key.publicKey,
        publisherFingerprint: key.fingerprint,
        verification: "curated",
        mcpVersion: MCP_VERSION,
      })
      .where(eq(capabilities.id, c.id));
  }
}

/**
 * Rebuilds every curated package from the trusted source in code, discarding anything changed in the database.
 * Only explicit restore actions call this; normal requests never auto-heal, so tampering stays visible.
 */
export async function repairCatalog() {
  await ensureCatalog();
  const key = marketplaceKey();
  for (const r of CATALOG_ROWS) {
    const tools = enrichCuratedTools(r.tools);
    const manifest = curatedManifest({ ...r, tools });
    await db
      .update(capabilities)
      .set({
        ...r,
        tools,
        manifest: manifest as unknown as Record<string, unknown>,
        signature: signManifest(manifest, key.privateKey),
        publisherKey: key.publicKey,
        publisherFingerprint: key.fingerprint,
        verification: "curated",
        mcpVersion: MCP_VERSION,
        ownerUserId: null,
      })
      .where(eq(capabilities.slug, r.slug));
  }
}
