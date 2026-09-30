import { fail, json, readBody, requireUser } from "@/lib/http";
import { fingerprintOf, validateManifest, verifySignature } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const body = await readBody(req);
  const { errors, warnings, manifest } = validateManifest(body.manifest);
  const signature = typeof body.signature === "string" ? body.signature : "";
  const publicKey = typeof body.publicKey === "string" ? body.publicKey : "";
  let sig: "valid" | "invalid" | "missing" = "missing";
  let fingerprintMatch = false;
  if (signature && publicKey) {
    sig = verifySignature(body.manifest, signature, publicKey) ? "valid" : "invalid";
    fingerprintMatch = !!manifest && manifest.publisher.publicKeyFingerprint === fingerprintOf(publicKey);
  }
  return json({ ok: errors.length === 0, errors, warnings, signature: sig, fingerprintMatch, tools: manifest?.tools.length ?? 0 });
}
