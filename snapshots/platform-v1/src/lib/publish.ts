import { eq } from "drizzle-orm";
import { db } from "@/db";
import { capabilities, installations } from "@/db/schema";
import { recordReceipt } from "@/lib/receipts";
import {
  MCP_VERSION, compareSemver, diffManifests, fingerprintOf, toolsFromManifest, validateManifest, verifySignature, type Manifest,
} from "@/lib/mcp";

type Diff = ReturnType<typeof diffManifests>;

export type PublishResult =
  | { ok: true; id: number; created: boolean; diff: Diff | null; warnings: string[]; manifest: Manifest }
  | { ok: false; status: number; errors: string[]; warnings?: string[] };

function rowFromManifest(m: Manifest, signature: string, publicKey: string, ownerUserId: number) {
  const tools = toolsFromManifest(m);
  const light = tools.filter((t) => t.level <= 2);
  return {
    slug: m.capabilityId,
    name: m.name,
    publisher: m.publisher.organization,
    version: m.version,
    description: m.description,
    category: m.category ?? "Custom",
    executor: "mcp",
    level: Math.max(...tools.map((t) => t.level)),
    verified: false,
    signed: true,
    builtin: false,
    tools,
    canDo: light.length ? light.map((t) => t.description) : ["Nothing without confirmation"],
    cannotDo: tools
      .filter((t) => t.level >= 3)
      .map((t) => (t.level === 4 ? `Run ${t.name} without confirmation and step-up authentication` : `Run ${t.name} without your confirmation`)),
    dataAccess: m.dataAccess ?? m.permissions.map((p) => p.reason),
    permissions: m.permissions.map((p) => p.name),
    oauthScopes: m.oauthScopes ?? [],
    networkDestinations: m.networkDestinations ?? [],
    retention: m.dataRetention ?? "Not declared by publisher",
    manifest: m as unknown as Record<string, unknown>,
    signature,
    publisherKey: publicKey,
    publisherFingerprint: fingerprintOf(publicKey),
    verification: "signed",
    mcpVersion: MCP_VERSION,
    ownerUserId,
  };
}

/** Validates, verifies and stores a publisher-signed package. Used by the Publisher studio and by seeding. */
export async function publishCapability(
  userId: number,
  input: { manifest: unknown; signature: string; publicKey: string },
  opts: { silent?: boolean } = {},
): Promise<PublishResult> {
  const { errors, warnings, manifest } = validateManifest(input.manifest);
  if (!manifest) return { ok: false, status: 422, errors, warnings };
  if (!input.signature || !input.publicKey) return { ok: false, status: 422, errors: ["A publisher signature and public key are required"], warnings };
  if (manifest.publisher.publicKeyFingerprint !== fingerprintOf(input.publicKey))
    return { ok: false, status: 422, errors: ["publisher.publicKeyFingerprint does not match the supplied public key"], warnings };
  if (!verifySignature(manifest, input.signature, input.publicKey))
    return { ok: false, status: 422, errors: ["Signature verification failed. The manifest was changed after signing, or the key is wrong."], warnings };

  const [existing] = await db.select().from(capabilities).where(eq(capabilities.slug, manifest.capabilityId));
  const row = rowFromManifest(manifest, input.signature, input.publicKey, userId);

  if (!existing) {
    const [created] = await db.insert(capabilities).values(row).returning({ id: capabilities.id });
    if (!opts.silent)
      await recordReceipt({
        userId, title: `Published ${manifest.name} v${manifest.version}`, executor: "mcp", capabilitySlug: manifest.capabilityId,
        capabilityVersion: manifest.version, tool: "publish", level: 1, decision: "allow", outcome: "success", authMethod: "publisher_signature",
        detail: `Ed25519 signature verified against ${row.publisherFingerprint.slice(0, 23)}…. ${row.tools.length} tools registered with the policy broker. Visible only to you until reviewed.`,
        evidence: ["manifest_schema_ok", "ed25519_signature_valid", "publisher_key_pinned"],
      });
    return { ok: true, id: created.id, created: true, diff: null, warnings, manifest };
  }

  if (existing.ownerUserId !== userId) return { ok: false, status: 409, errors: ["That capabilityId is already registered by another publisher"] };
  if (existing.publisherFingerprint !== row.publisherFingerprint)
    return { ok: false, status: 409, errors: ["Publisher key changed. Package updates must be signed with the key pinned at first publication."] };
  if (compareSemver(manifest.version, existing.version) <= 0)
    return { ok: false, status: 409, errors: [`Version ${manifest.version} must be greater than the published ${existing.version}`] };

  const diff = diffManifests(existing.manifest as unknown as Manifest, manifest);
  const { slug: _slug, ...update } = row;
  void _slug;
  await db.update(capabilities).set(update).where(eq(capabilities.id, existing.id));
  if (diff.escalated) {
    // New tools, raised risk or new permissions invalidate the previous consent.
    await db.update(installations).set({ status: "needs_auth" }).where(eq(installations.capabilityId, existing.id));
  }
  if (!opts.silent)
    await recordReceipt({
      userId, title: `Updated ${manifest.name} to v${manifest.version}`, executor: "mcp", capabilitySlug: manifest.capabilityId,
      capabilityVersion: manifest.version, tool: "publish_update", level: 1, decision: "allow", outcome: "success", authMethod: "publisher_signature",
      detail: diff.escalated
        ? `Update adds ${[...diff.addedTools.map((t) => `tool ${t}`), ...diff.raisedRisk.map((t) => `higher risk on ${t}`), ...diff.addedPermissions, ...diff.addedScopes].join(", ")}. Re-consent required before it can run.`
        : "No new tools, permissions or risk. Existing consent still applies.",
      evidence: ["manifest_diff", "ed25519_signature_valid"],
    });
  return { ok: true, id: existing.id, created: false, diff, warnings, manifest };
}
