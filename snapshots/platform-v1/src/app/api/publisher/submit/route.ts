import { fail, json, readBody, requireUser } from "@/lib/http";
import { publishCapability } from "@/lib/publish";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const body = await readBody(req);
  const r = await publishCapability(user.id, {
    manifest: body.manifest,
    signature: typeof body.signature === "string" ? body.signature : "",
    publicKey: typeof body.publicKey === "string" ? body.publicKey : "",
  });
  if (!r.ok) return Response.json({ error: r.errors[0], errors: r.errors, warnings: r.warnings ?? [] }, { status: r.status });
  return json({ id: r.id, created: r.created, diff: r.diff, warnings: r.warnings }, r.created ? 201 : 200);
}
