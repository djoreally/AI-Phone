import { createSession } from "@/lib/auth";
import { json } from "@/lib/http";
import { ensureDemoUser } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  const id = await ensureDemoUser();
  await createSession(id);
  return json({ ok: true });
}
