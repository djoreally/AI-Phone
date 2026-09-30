import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { capabilities } from "@/db/schema";
import { ApiError, handle, readJson, requireUser } from "@/lib/api";
import { capabilityFromManifest, validateManifest, verifyManifest } from "@/lib/mcp";

export const dynamic = "force-dynamic";

/** Validate a manifest without persisting (dry run) or import it as a capability. */
export function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await readJson<{ manifest?: unknown; signature?: string | null; dryRun?: boolean }>(req);
    let manifestInput = body.manifest;
    if (typeof manifestInput === "string") {
      try { manifestInput = JSON.parse(manifestInput); } catch { throw new ApiError(400, "manifest.json is not valid JSON"); }
    }
    const validation = validateManifest(manifestInput);
    if (!validation.ok) return NextResponse.json({ ok: false, stage: "schema", issues: validation.issues }, { status: 422 });
    const verification = verifyManifest(validation.manifest, body.signature);
    if (verification.publisherSignature === "invalid") return NextResponse.json({ ok: false, stage: "signature", issues: [...validation.issues, ...verification.issues], verification }, { status: 422 });
    if (body.dryRun) return NextResponse.json({ ok: true, stage: "verified", issues: [...validation.issues, ...verification.issues], verification, preview: capabilityFromManifest(validation.manifest) });

    const values = capabilityFromManifest(validation.manifest);
    const verified = verification.publisherSignature === "valid" && verification.cimdResolved;
    const [existing] = await db.select().from(capabilities).where(and(eq(capabilities.userId, user.id), eq(capabilities.slug, values.slug)));
    let row;
    if (existing) {
      [row] = await db.update(capabilities).set({ ...values, verified, manifestVerification: verification }).where(eq(capabilities.id, existing.id)).returning();
    } else {
      [row] = await db.insert(capabilities).values({ ...values, userId: user.id, verified, status: "available", manifestVerification: verification }).returning();
    }
    return NextResponse.json({ ok: true, stage: existing ? "updated" : "imported", capability: row, verification, issues: [...validation.issues, ...verification.issues] }, { status: existing ? 200 : 201 });
  });
}
