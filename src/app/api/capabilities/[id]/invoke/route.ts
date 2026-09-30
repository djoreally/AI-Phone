import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { capabilities, devices, policies, receipts } from "@/db/schema";
import { ApiError, handle, idFrom, num, readJson, requireUser, str } from "@/lib/api";
import { decide } from "@/lib/engine";
import { buildInvocation, validateArgs } from "@/lib/mcp";
import { authMethodFor, newReceiptRef, receiptPayload, signPayload } from "@/lib/phase1";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const LEVEL_OF = { read: 1, prepare: 2, consequential: 3, restricted: 4 } as const;

export function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const user = await requireUser();
    const id = idFrom((await ctx.params).id);
    const body = await readJson<{ tool?: string; args?: Record<string, unknown>; deviceId?: number | null; approved?: boolean; stepUpPassed?: boolean }>(req);
    const [cap] = await db.select().from(capabilities).where(and(eq(capabilities.id, id), eq(capabilities.userId, user.id)));
    if (!cap) throw new ApiError(404, "Capability not found");
    if (cap.status !== "installed") throw new ApiError(403, `Capability is ${cap.status}; connect it before invoking tools`);
    const tool = cap.tools.find((t) => t.name === str(body.tool));
    if (!tool) throw new ApiError(400, "Tool is not declared in the capability manifest");
    const args = body.args && typeof body.args === "object" ? body.args : {};
    const schemaErrors = validateArgs(tool.inputSchema, args);
    if (schemaErrors.length) return NextResponse.json({ ok: false, stage: "schema", errors: schemaErrors }, { status: 422 });

    const deviceId = body.deviceId ? num(body.deviceId) : null;
    if (deviceId) {
      const [d] = await db.select().from(devices).where(and(eq(devices.id, deviceId), eq(devices.userId, user.id)));
      if (!d) throw new ApiError(404, "Device not found");
      if (d.status === "revoked" || d.status === "blocked") throw new ApiError(403, `Device is ${d.status}`);
    }

    const level = LEVEL_OF[tool.risk];
    const policyList = await db.select().from(policies).where(eq(policies.userId, user.id));
    const title = tool.description ?? tool.name;
    let decision = decide(policyList, { capability: cap.slug, executor: "mcp", level, title });
    // Manifest gates can only tighten, never loosen.
    if (tool.confirmation === "required" && decision === "allow") decision = "confirm";
    if (tool.confirmation === "step_up" && decision !== "deny") decision = "step_up";

    const requestId = `req_${randomBytes(6).toString("hex")}`;
    const started = Date.now();

    const writeReceipt = async (outcome: string, summary: string, evidence: string[], decisionLabel: string) => {
      const [ins] = await db.insert(receipts).values({
        userId: user.id, deviceId, planId: null, receiptRef: newReceiptRef(), action: `${cap.name}: ${title}`, capability: cap.slug, executor: "mcp", level,
        decision: decisionLabel, authMethod: authMethodFor(decisionLabel), outcome, summary, evidence, durationMs: Date.now() - started + 120,
      }).returning();
      const [row] = await db.update(receipts).set({ signature: signPayload(receiptPayload(ins), ins.deviceId) }).where(eq(receipts.id, ins.id)).returning();
      return row;
    };

    if (decision === "deny") {
      const receipt = await writeReceipt("blocked", "Policy broker denied the request before any JSON-RPC was sent.", ["policy_decision:deny", `request_id:${requestId}`], "denied");
      return NextResponse.json({ ok: false, stage: "policy", decision, receipt }, { status: 403 });
    }
    if (decision === "confirm" && !body.approved) {
      return NextResponse.json({ ok: false, stage: "awaiting_confirmation", decision, card: { title: `POLICY APPROVAL REQUIRED`, capability: cap.name, riskLevel: `LEVEL_${level}_${tool.risk.toUpperCase()}`, summary: title, requestedAction: `${tool.name}(${JSON.stringify(args)})` } }, { status: 202 });
    }
    if (decision === "step_up" && !body.stepUpPassed) {
      if (body.approved === false) {
        const receipt = await writeReceipt("blocked", "Biometric step-up authentication failed or was cancelled.", ["auth:BIOMETRIC_STRONG", "result:DENIED_BIOMETRIC_FAILED"], "step_up");
        return NextResponse.json({ ok: false, stage: "policy", decision, receipt }, { status: 403 });
      }
      return NextResponse.json({ ok: false, stage: "awaiting_step_up", decision, card: { title: "Biometric Verification Required", capability: cap.name, riskLevel: `LEVEL_${level}_${tool.risk.toUpperCase()}`, summary: title, requestedAction: `${tool.name}(${JSON.stringify(args)})` } }, { status: 202 });
    }

    const decisionLabel = decision === "allow" ? "allowed" : decision === "confirm" ? "confirmed" : "step_up";
    const proof = decision === "allow" ? null : {
      confirmationType: decision === "confirm" ? "UI_CARD_CONFIRMED" : "BIOMETRIC_STRONG_CONFIRMED",
      confirmedAt: Date.now(),
      hardwareSignature: signPayload({ requestId, tool: tool.name, args, decision }, deviceId),
    };
    const endpoint = cap.endpoint ?? `https://${cap.networkDestinations[0] ?? "mcp.example.com"}/mcp/v3/invoke`;
    const invocation = buildInvocation({ endpoint, tool: tool.name, args, proof, requestId });
    // Simulated stateless response from the capability container.
    const response = { jsonrpc: "2.0", id: requestId, result: { content: [{ type: "text", text: `${tool.name} completed` }], structuredContent: { tool: tool.name, arguments: args, executedAt: new Date().toISOString() }, isError: false } };
    const evidence = [...tool.evidence.map((e) => `${e}:${randomBytes(3).toString("hex")}`), `request_id:${requestId}`, `endpoint:${new URL(endpoint).host}`];
    const receipt = await writeReceipt("success", `Stateless JSON-RPC tools/call → ${new URL(endpoint).host}. ${proof ? `Policy proof attached (${proof.confirmationType}).` : "Auto-allowed under policy."}`, evidence, decisionLabel);
    return NextResponse.json({ ok: true, stage: "executed", decision, invocation, response, receipt });
  });
}
