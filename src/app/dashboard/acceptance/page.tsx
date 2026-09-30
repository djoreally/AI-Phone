import Link from "next/link";
import { and, desc, eq, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { devices, plans, provisioningRuns, receipts, voiceTokens } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { Badge, Card, PageHeader, cx } from "@/components/ui";
import { verifyReceipt } from "@/lib/phase1";

export const dynamic = "force-dynamic";

const MATRIX = [
  { level: 1, name: "Read", desc: "Non-mutating data retrieval.", examples: "Query contacts, read work order status, check weather", gate: "Auto-allowed", tone: "lime" },
  { level: 2, name: "Prepare", desc: "Local state generation without external side effects.", examples: "Draft SMS, construct invite, assemble invoice draft, prepare route", gate: "Auto-allowed (local state only)", tone: "sky" },
  { level: 3, name: "Act", desc: "Reversible or standard external side effects.", examples: "Place outbound call, send approved draft, launch navigation", gate: "Explicit user approval (confirmation card)", tone: "amber" },
  { level: 4, name: "Restricted", desc: "High-impact, financial, security-altering, or destructive.", examples: "Financial transactions, credential changes, data deletion", gate: "Biometric / PIN step-up + explicit gate", tone: "rose" },
] as const;

export default async function AcceptancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const uid = user.id;

  const [pixels, certified, tokens, callReceipts, completedPlans, allReceipts] = await Promise.all([
    db.select().from(devices).where(and(eq(devices.userId, uid), eq(devices.manufacturer, "Google"))),
    db.select().from(provisioningRuns).where(and(eq(provisioningRuns.userId, uid), eq(provisioningRuns.status, "certified"))).orderBy(desc(provisioningRuns.createdAt)),
    db.select().from(voiceTokens).where(and(eq(voiceTokens.userId, uid), eq(voiceTokens.revoked, false), gt(voiceTokens.expiresAt, new Date()))),
    db.select().from(receipts).where(and(eq(receipts.userId, uid), eq(receipts.executor, "voice"), eq(receipts.outcome, "success"))),
    db.select().from(plans).where(and(eq(plans.userId, uid), eq(plans.status, "completed"))),
    db.select().from(receipts).where(eq(receipts.userId, uid)),
  ]);

  const refPixel = pixels.filter((d) => d.androidVersion >= 14 && /pixel (8|9)/i.test(d.model));
  const certifiedRef = certified.filter((r) => refPixel.some((d) => d.id === r.deviceId));
  const readyDevice = refPixel.find((d) => d.status === "ready");
  const multiStep = completedPlans.filter((p) => p.steps.length >= 2 && p.steps.some((s) => s.level >= 3 && s.status === "done") && p.steps.some((s) => s.level <= 2 && s.status === "done"));
  const signed = allReceipts.filter((r) => verifyReceipt(r).valid);
  const tampered = allReceipts.filter((r) => r.signature && !verifyReceipt(r).valid);

  const checks = [
    { n: 1, title: "Factory-reset hardware prep", detail: "Pixel 8 or 9 running Android 14+ enrolled as reference hardware.", pass: refPixel.length > 0, evidence: refPixel.length ? refPixel.map((d) => `${d.name} (Android ${d.androidVersion})`).join(", ") : "No Pixel 8/9 on Android 14+ enrolled", href: "/dashboard/devices" },
    { n: 2, title: "Desktop provisioning deployment", detail: "Studio wizard completes diagnostics, DPC, APK, permissions, and key setup.", pass: certifiedRef.length > 0, evidence: certifiedRef.length ? `${certifiedRef.length} certified run${certifiedRef.length > 1 ? "s" : ""} · key ${certifiedRef[0].keyFingerprint}` : "No certified provisioning run for reference hardware", href: "/dashboard/studio" },
    { n: 3, title: "Standalone disconnect & reboot", detail: "Device boots into the AI Phone launcher as the default HOME experience.", pass: !!readyDevice, evidence: readyDevice ? `${readyDevice.name} is READY with all approvals granted` : "Reference device still has pending approvals", href: "/dashboard/devices" },
    { n: 4, title: "Telephony engine standby", detail: "SIP/WebRTC registers with an ephemeral token and enters listening standby.", pass: tokens.some((t) => t.scope === "inbound_listener"), evidence: tokens.length ? `${tokens.length} live token${tokens.length > 1 ? "s" : ""}${tokens.some((t) => t.scope === "inbound_listener") ? " incl. inbound listener" : " (no inbound listener yet)"}` : "No live device-scoped tokens", href: "/dashboard/studio" },
    { n: 5, title: "Voice-driven multi-step execution", detail: "A plan with an auto-prepared Level 1–2 step and a confirmed Level 3 step completed.", pass: multiStep.length > 0, evidence: multiStep.length ? `“${multiStep[0].request.slice(0, 70)}…”` : "No completed plan mixing auto-allowed and confirmed steps", href: "/dashboard/plans" },
    { n: 6, title: "Action & receipt inspection", detail: "Wi-Fi call completed and every receipt carries a valid device-key signature.", pass: callReceipts.length > 0 && signed.length === allReceipts.length && allReceipts.length > 0, evidence: `${callReceipts.length} call receipt${callReceipts.length === 1 ? "" : "s"} · ${signed.length}/${allReceipts.length} signatures valid${tampered.length ? ` · ${tampered.length} TAMPERED` : ""}`, href: "/dashboard/receipts" },
  ];
  const passed = checks.filter((c) => c.pass).length;

  return (
    <div>
      <PageHeader eyebrow="Phase 1 · Prove the phone" title="Acceptance test" description="Auto-evaluated against live workspace data. Phase 1 is complete when all six protocol steps pass on reference Pixel hardware." />

      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Milestone status</p>
            <p className="mt-1 text-2xl font-semibold text-white">{passed}/6 protocol steps passing</p>
          </div>
          <Badge tone={passed === 6 ? "lime" : passed >= 4 ? "amber" : "rose"} className="text-sm">{passed === 6 ? "PHASE 1 COMPLETE" : "IN PROGRESS"}</Badge>
        </div>
        <div className="mt-4 flex gap-1">
          {checks.map((c) => <span key={c.n} className={cx("h-2 flex-1 rounded-full", c.pass ? "bg-lime-400" : "bg-zinc-800")} />)}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ol className="space-y-3">
            {checks.map((c) => (
              <li key={c.n} className={cx("rounded-2xl border p-4", c.pass ? "border-lime-400/20 bg-lime-400/5" : "border-zinc-800 bg-zinc-900/60")}>
                <div className="flex items-start gap-3">
                  <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", c.pass ? "bg-lime-400 text-zinc-950" : "bg-zinc-800 text-zinc-400")}>{c.pass ? "✓" : c.n}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">{c.n}. {c.title}</p>
                    <p className="text-sm text-zinc-400">{c.detail}</p>
                    <p className={cx("mono mt-2 text-xs", c.pass ? "text-lime-300" : "text-amber-300")}>{c.evidence}</p>
                  </div>
                  <Link href={c.href} className="shrink-0 text-xs text-zinc-400 hover:text-lime-300">{c.pass ? "Inspect" : "Fix"} →</Link>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Risk classification matrix</h2>
            <div className="mt-3 space-y-2">
              {MATRIX.map((m) => (
                <div key={m.level} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={m.tone}>Level {m.level}</Badge>
                    <p className="text-sm font-medium text-white">{m.name}</p>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">{m.desc}</p>
                  <p className="mt-1 text-xs text-zinc-500">e.g. {m.examples}</p>
                  <p className="mt-1 text-xs"><span className="text-zinc-500">Gate:</span> <span className="text-zinc-200">{m.gate}</span></p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Deterministic isolation</h2>
            <p className="mt-2 text-sm text-zinc-400">Raw model output never touches an Android API or calling gateway. Every action passes through the typed Policy Broker, which evaluates risk, requests confirmation, executes via strict adapters, and writes a signed receipt.</p>
            <pre className="mono mt-3 text-[11px] leading-5 text-zinc-500">{`Launcher UI → Runtime → Typed request
  → Policy Broker (deterministic gate)
    → Android adapter | Telephony | Cloud Playwright
      → Signed receipt`}</pre>
          </Card>
        </div>
      </div>
    </div>
  );
}
