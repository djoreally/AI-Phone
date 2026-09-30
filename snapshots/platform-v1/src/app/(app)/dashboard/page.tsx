"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, ErrorState, Icon, LevelBadge, OUTCOME_TONE, PageHeader, Skeleton, cn, inputCls, useToast } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { EXECUTOR_LABEL, READINESS_META, timeAgo } from "@/lib/shared";

type Dash = {
  devices: {
    total: number; ready: number; needsApproval: number; provisioning: number; unsupported: number;
    list: { id: number; name: string; model: string; readiness: string; result: string; step: number; battery: number }[];
  };
  capabilities: { installed: number; needsAuth: number; byLevel: { level: number; count: number }[] };
  pendingPlans: number;
  actions24h: number;
  blockedWeek: number;
  actionsWeek: number;
  days: { label: string; count: number }[];
  recent: { id: number; title: string; executor: string; level: number; outcome: string; detail: string; createdAt: string }[];
};

const SUGGESTIONS = [
  "Call John and tell him I'm twenty minutes away. Open his work order and navigate to the job.",
  "Draft an invoice for Acme and send it.",
  "Fill in the vendor portal form but don't submit it.",
];

function Stat({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <Card className="p-5">
      <p className="font-mono text-[11px] uppercase tracking-wider text-ink/50">{label}</p>
      <p className={cn("mt-2 font-display text-4xl font-bold", tone)}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink/55">{sub}</p>}
    </Card>
  );
}

export default function DashboardPage() {
  const { data, loading, error, reload } = useApi<Dash>("/api/dashboard");
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function compose(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api("/api/plans", { method: "POST", body: { utterance: text } });
      toast("Plan proposed. Review it before anything runs.");
      router.push("/plans");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not plan that", "err");
      setBusy(false);
    }
  }

  const max = data ? Math.max(1, ...data.days.map((d) => d.count)) : 1;

  return (
    <div>
      <PageHeader eyebrow="Mission control" title="Your robots at a glance" sub="Devices, capabilities, and the receipts proving what your AI actually did." />

      <Card className="mb-8 overflow-hidden border-ink bg-ink p-0 text-paper">
        <form onSubmit={compose} className="p-5 sm:p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Ask the phone</p>
          <h2 className="mt-1 font-display text-2xl font-bold">What should your robot do?</h2>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Call John, open his work order, navigate to the job…"
              className={cn(inputCls, "border-paper/10 bg-paper/10 text-paper placeholder:text-paper/40 focus:bg-paper/15")}
              aria-label="Command"
            />
            <Button type="submit" variant="accent" loading={busy} className="shrink-0">
              <Icon name="sparkle" className="h-4 w-4" /> Propose plan
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => setText(s)} className="rounded-full border border-paper/15 px-3 py-1 text-left text-xs text-paper/65 transition hover:border-accent hover:text-paper">
                {s.length > 52 ? s.slice(0, 50) + "…" : s}
              </button>
            ))}
          </div>
        </form>
      </Card>

      {error && <ErrorState message={error} onRetry={reload} />}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Devices ready" value={`${data.devices.ready}/${data.devices.total}`} sub={`${data.devices.needsApproval} need approval · ${data.devices.provisioning} provisioning`} />
            <Stat label="Capabilities" value={data.capabilities.installed} sub={data.capabilities.needsAuth ? `${data.capabilities.needsAuth} awaiting connection` : "All connected"} />
            <Stat label="Plans to review" value={data.pendingPlans} tone={data.pendingPlans ? "text-accent" : undefined} sub={data.pendingPlans ? "Waiting for your confirmation" : "Nothing pending"} />
            <Stat label="Blocked this week" value={data.blockedWeek} sub={`${data.actionsWeek} receipts in 7 days`} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-5">
            <Card className="p-5 lg:col-span-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-bold">Recent receipts</h3>
                <Link href="/receipts" className="text-sm font-medium text-accent hover:underline">View all →</Link>
              </div>
              {data.recent.length === 0 ? (
                <p className="py-10 text-center text-sm text-ink/55">No actions yet. Confirm a plan and receipts appear here.</p>
              ) : (
                <ul className="mt-4 divide-y divide-ink/10">
                  {data.recent.map((r) => (
                    <li key={r.id} className="flex items-start gap-3 py-3">
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", r.outcome === "success" ? "bg-emerald-500" : r.outcome === "blocked" ? "bg-red-500" : r.outcome === "failed" ? "bg-orange-500" : "bg-stone-400")} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.title}</p>
                        <p className="truncate text-xs text-ink/55">{r.detail}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge tone={OUTCOME_TONE[r.outcome]}>{r.outcome}</Badge>
                        <span className="text-[11px] text-ink/45">{EXECUTOR_LABEL[r.executor] ?? r.executor} · {timeAgo(r.createdAt)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <div className="space-y-6 lg:col-span-2">
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl font-bold">Fleet readiness</h3>
                  <Link href="/devices" className="text-sm font-medium text-accent hover:underline">Manage →</Link>
                </div>
                {data.devices.list.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink/55">No devices yet.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {data.devices.list.map((d) => (
                      <li key={d.id} className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-ink/5"><Icon name="phone" className="h-4 w-4" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{d.name}</p>
                          <p className="truncate font-mono text-[11px] text-ink/50">{d.result}</p>
                        </div>
                        <Badge tone={READINESS_META[d.readiness].tone}>{READINESS_META[d.readiness].label}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="p-5">
                <h3 className="font-display text-xl font-bold">Activity, 7 days</h3>
                <div className="mt-4 flex h-28 items-end gap-2">
                  {data.days.map((d, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                      <span className="text-[10px] text-ink/50">{d.count || ""}</span>
                      <div className="w-full rounded-t bg-accent/80 transition-all" style={{ height: `${Math.max(4, (d.count / max) * 80)}px`, opacity: d.count ? 1 : 0.25 }} />
                      <span className="font-mono text-[10px] text-ink/45">{d.label}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {data.capabilities.byLevel.map((l) => (
                    <span key={l.level} className="flex items-center gap-1.5 text-xs text-ink/65">
                      <LevelBadge level={l.level} /> {l.count} installed
                    </span>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
