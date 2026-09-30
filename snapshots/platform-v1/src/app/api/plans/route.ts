import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { fail, json, readBody, requireUser, str } from "@/lib/http";
import { createPlan } from "@/lib/planner";
import { loadPlans } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  return json(await loadPlans(user.id));
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return fail("Unauthorized", 401);
  const body = await readBody(req);
  const utterance = str(body.utterance, 800);
  if (utterance.length < 4) return fail("Tell the assistant what you'd like done");
  let deviceId: number | null = null;
  if (body.deviceId) {
    const n = Number(body.deviceId);
    const [d] = await db.select({ id: devices.id }).from(devices).where(and(eq(devices.id, n), eq(devices.userId, user.id)));
    if (!d) return fail("Device not found", 404);
    deviceId = d.id;
  }
  // Small delay so the "planning" state is perceptible and realistic.
  await new Promise((r) => setTimeout(r, 450));
  const id = await createPlan(user.id, deviceId, utterance);
  if (!id) {
    return fail(
      "I couldn't map that to any capability yet. Try mentioning a call, work order, navigation, reminder, camera, estimate, invoice, email, calendar, or a website form.",
      422,
    );
  }
  const [plan] = await loadPlans(user.id, id);
  return json(plan, 201);
}
