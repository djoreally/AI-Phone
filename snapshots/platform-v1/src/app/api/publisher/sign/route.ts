import { fail, json, readBody, requireUser } from "@/lib/http";
import { fingerprintOf, generateKeypair, publicFromPrivate, signManifest, validateManifest } from "@/lib/mcp";

export const dynamic = "force-dynamic";

// Developer convenience only. Production publishers sign offline; this server never stores the private key.
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const body = await readBody(req);
  if (!body.manifest || typeof body.manifest !== "object" || Array.isArray(body.manifest)) return fail("manifest must be a JSON object");

  let privateKey = typeof body.privateKey === "string" ? body.privateKey.trim() : "";
  let publicKey: string;
  let generated = false;
  try {
    if (privateKey) publicKey = publicFromPrivate(privateKey);
    else {
      const k = generateKeypair();
      privateKey = k.privateKey;
      publicKey = k.publicKey;
      generated = true;
    }
  } catch {
    return fail("That private key is not a valid base64 PKCS#8 Ed25519 key");
  }

  const manifest = JSON.parse(JSON.stringify(body.manifest)) as Record<string, unknown>;
  const pub = manifest.publisher && typeof manifest.publisher === "object" ? (manifest.publisher as Record<string, unknown>) : null;
  if (pub) pub.publicKeyFingerprint = fingerprintOf(publicKey);
  const { errors, warnings } = validateManifest(manifest);
  if (errors.length) return Response.json({ error: "Manifest is invalid, so it was not signed", errors, warnings }, { status: 422 });

  return json({
    manifest,
    signature: signManifest(manifest, privateKey),
    publicKey,
    privateKey: generated ? privateKey : undefined,
    fingerprint: fingerprintOf(publicKey),
    warnings,
  });
}
