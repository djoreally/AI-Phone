import { randomUUID } from "crypto";
import { db } from "@/db";
import { receipts } from "@/db/schema";
import { deviceKey, hmacHex, safeEqualHex, sortKeys } from "@/lib/crypto";

type Row = typeof receipts.$inferSelect;

const RISK: Record<number, string> = {
  1: "level_1_read",
  2: "level_2_prepare",
  3: "level_3_act",
  4: "level_4_restricted",
};

const EXECUTOR_CLASS: Record<string, string> = {
  android: "AndroidToolAdapter",
  voice: "NativeWebRTCCallHandler",
  playwright: "CloudBrowserBridge",
  mcp: "McpCapabilityAdapter",
  api: "ApiCapabilityAdapter",
};

const STATUS: Record<string, string> = {
  success: "COMPLETED",
  blocked: "BLOCKED_BY_POLICY",
  cancelled: "CANCELLED_BY_USER",
  failed: "FAILED",
};

// Canonical receipt.json — built deterministically from stored columns so it can be re-verified at any time.
export function receiptPayload(r: Omit<Row, "id" | "userId" | "planId" | "deviceId" | "signature">) {
  return {
    receiptId: r.uid,
    timestamp: r.createdAt.toISOString(),
    deviceId: r.deviceRef || "studio",
    planId: r.planRef || null,
    title: r.title,
    capability: { id: r.capabilitySlug, version: r.capabilityVersion, riskLevel: RISK[r.level] ?? "level_1_read" },
    intent: { userQuery: r.userQuery, parsedAction: r.tool, target: r.target },
    policyEvaluation: {
      decision: r.decision,
      gatePassed: r.outcome !== "blocked" && r.outcome !== "cancelled",
      userConfirmationObtained: r.authMethod === "ui_confirmation_card" || r.authMethod === "step_up_auth",
      confirmationTimestamp: r.confirmedAt ? r.confirmedAt.toISOString() : null,
      authMethod: r.authMethod,
    },
    executionDetails: {
      status: STATUS[r.outcome] ?? "FAILED",
      durationMs: r.durationMs,
      executor: EXECUTOR_CLASS[r.executor] ?? r.executor,
      providerSessionId: r.providerSessionId || null,
    },
    evidence: { items: r.evidence, detail: r.detail },
    // Only present for capability calls; omitted otherwise so older receipts still verify.
    ...(r.invocation ? { mcpInvocation: sortKeys(r.invocation) } : {}),
  };
}

export function signReceipt(r: Parameters<typeof receiptPayload>[0]): string {
  return hmacHex(deviceKey(r.deviceRef), JSON.stringify(receiptPayload(r)));
}

export function verifyReceipt(r: Row): "valid" | "invalid" | "unsigned" {
  if (!r.signature) return "unsigned";
  return safeEqualHex(signReceipt(r), r.signature) ? "valid" : "invalid";
}

export type ReceiptInput = {
  userId: number;
  planId?: number | null;
  deviceId?: number | null;
  title: string;
  executor: string;
  capabilitySlug?: string;
  capabilityVersion?: string;
  tool?: string;
  level?: number;
  decision?: string;
  outcome: "success" | "blocked" | "cancelled" | "failed";
  detail?: string;
  evidence?: string[];
  userQuery?: string;
  target?: string;
  authMethod?: string;
  confirmedAt?: Date | null;
  durationMs?: number;
  providerSessionId?: string;
  invocation?: Record<string, unknown> | null;
  createdAt?: Date;
};

export async function recordReceipt(i: ReceiptInput) {
  const base = {
    uid: `rcpt_${randomUUID()}`,
    deviceRef: i.deviceId ? `dev_${i.deviceId}` : "",
    planRef: i.planId ? `plan_${i.planId}` : "",
    title: i.title,
    executor: i.executor,
    capabilitySlug: i.capabilitySlug ?? "",
    capabilityVersion: i.capabilityVersion ?? "",
    tool: i.tool ?? "",
    level: i.level ?? 1,
    decision: i.decision ?? "allow",
    outcome: i.outcome,
    detail: i.detail ?? "",
    evidence: i.evidence ?? [],
    userQuery: i.userQuery ?? "",
    target: i.target ?? "",
    authMethod: i.authMethod ?? "auto_policy",
    confirmedAt: i.confirmedAt ?? null,
    durationMs: i.durationMs ?? 0,
    providerSessionId: i.providerSessionId ?? "",
    invocation: i.invocation ?? null,
    createdAt: i.createdAt ?? new Date(),
  };
  const signature = signReceipt(base);
  await db.insert(receipts).values({
    ...base,
    userId: i.userId,
    planId: i.planId ?? null,
    deviceId: i.deviceId ?? null,
    signature,
  });
}
