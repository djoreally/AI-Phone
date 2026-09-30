"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, DECISION_TONE, EmptyState, ErrorState, Icon, LevelBadge, OUTCOME_TONE, PageHeader, Skeleton, cn, inputCls, useToast } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { EXECUTOR_LABEL, type ReceiptDTO } from "@/lib/shared";

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export default function ReceiptsPage() {
  const { data, setData, loading, error, reload } = useApi<ReceiptDTO[]>("/api/receipts");
  const toast = useToast();
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState("all");
  const [executor, setExecutor] = useState("all");
  const [openJson, setOpenJson] = useState<number | null>(null);

  const receipts = useMemo(() => data ?? [], [data]);
  const shown = receipts.filter(
    (r) =>
      (outcome === "all" || r.outcome === outcome) &&
      (executor === "all" || r.executor === executor) &&
      `${r.title} ${r.detail} ${r.tool} ${r.capabilitySlug} ${r.uid}`.toLowerCase().includes(q.toLowerCase()),
  );
  const groups = useMemo(() => {
    const m = new Map<string, ReceiptDTO[]>();
    for (const r of shown) {
      const k = dayLabel(r.createdAt);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return Array.from(m.entries());
  }, [shown]);

  function exportAll() {
    const blob = new Blob([JSON.stringify(shown.map((r) => ({ ...r.payload, signature: r.signature })), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "aiphone-receipts.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function remove(r: ReceiptDTO) {
    const prev = data;
    setData((l) => (l ?? []).filter((x) => x.id !== r.id));
    try {
      await api(`/api/receipts/${r.id}`, { method: "DELETE" });
      toast("Receipt deleted");
    } catch (e) {
      setData(prev);
      toast(e instanceof Error ? e.message : "Delete failed", "err");
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Here is what I did. Here is the evidence." title="Receipts" sub="A human-readable timeline of every meaningful action: what ran, who performed it, what the policy broker decided, and the evidence it left behind." />

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <input className={cn(inputCls, "pl-9")} placeholder="Search receipts…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search receipts" />
        </div>
        <div className="flex flex-wrap gap-2">
          {["all", "success", "blocked", "failed", "cancelled"].map((o) => (
            <button key={o} onClick={() => setOutcome(o)} className={cn("rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition", outcome === o ? "bg-ink text-paper" : "bg-white/70 ring-1 ring-ink/10 hover:bg-white")}>{o}</button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={exportAll} disabled={shown.length === 0}>Export JSON</Button>
        <select className={cn(inputCls, "lg:w-44")} value={executor} onChange={(e) => setExecutor(e.target.value)} aria-label="Executor">
          <option value="all">All executors</option>
          {Object.entries(EXECUTOR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && <div className="space-y-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}</div>}
      {!loading && !error && receipts.length === 0 && <EmptyState icon="receipt" title="No receipts yet" body="Confirm a plan in the Assistant and every step will appear here with its evidence." />}
      {!loading && receipts.length > 0 && shown.length === 0 && (
        <EmptyState icon="search" title="No matching receipts" body="Try a different search or filter." action={<Button variant="outline" onClick={() => { setQ(""); setOutcome("all"); setExecutor("all"); }}>Clear filters</Button>} />
      )}

      <div className="space-y-8">
        {groups.map(([label, items]) => (
          <section key={label}>
            <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-ink/50">{label}</h2>
            <div className="relative space-y-3 border-l-2 border-ink/10 pl-5">
              {items.map((r) => (
                <Card key={r.id} className="pop relative p-4">
                  <span className={cn("absolute -left-[27px] top-5 h-3 w-3 rounded-full ring-4 ring-paper", r.outcome === "success" ? "bg-emerald-500" : r.outcome === "blocked" ? "bg-red-500" : r.outcome === "failed" ? "bg-orange-500" : "bg-stone-400")} />
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">{r.title}</h3>
                      <p className="mt-0.5 text-sm text-ink/65">{r.detail}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-ink/45">{new Date(r.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                      <button onClick={() => remove(r)} className="rounded-md p-1.5 text-ink/35 hover:bg-red-50 hover:text-red-700" aria-label="Delete receipt"><Icon name="trash" className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge tone={OUTCOME_TONE[r.outcome]}>{r.outcome}</Badge>
                    <Badge>{EXECUTOR_LABEL[r.executor] ?? r.executor}</Badge>
                    <LevelBadge level={r.level} />
                    <Badge tone={DECISION_TONE[r.decision] ?? DECISION_TONE.allow} className="uppercase">{r.decision}</Badge>
                    {r.tool && <code className="font-mono text-[11px] text-ink/40">{r.capabilitySlug ? `${r.capabilitySlug.split(".").pop()}:` : ""}{r.tool}</code>}
                    {r.deviceName && <span className="text-[11px] text-ink/45">· {r.deviceName}</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-3">
                    <Badge tone={r.signatureStatus === "valid" ? "bg-emerald-100 text-emerald-800 ring-emerald-600/20" : r.signatureStatus === "invalid" ? "bg-red-100 text-red-800 ring-red-600/20" : "bg-stone-200 text-stone-700 ring-stone-500/20"}>
                      {r.signatureStatus === "valid" ? "✓ Signature verified" : r.signatureStatus === "invalid" ? "✕ Signature mismatch — tampered" : "Unsigned (legacy)"}
                    </Badge>
                    {Boolean(r.payload.mcpInvocation) && <Badge tone="bg-violet-50 text-violet-800 ring-violet-600/20">MCP tools/call · policy proof</Badge>}
                    <code className="font-mono text-[11px] text-ink/45">{r.uid ? r.uid.slice(0, 13) + "…" : "no id"}</code>
                    <button onClick={() => setOpenJson(openJson === r.id ? null : r.id)} className="ml-auto text-xs font-medium text-accent hover:underline">
                      {openJson === r.id ? "Hide receipt.json" : "View receipt.json"}
                    </button>
                  </div>
                  {openJson === r.id && (
                    <pre className="slidein mt-2 max-h-80 overflow-auto rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed text-paper/85">
{JSON.stringify({ ...r.payload, signature: r.signature ? `${r.signature.slice(0, 40)}…[HMAC-SHA256 with per-device key]` : null }, null, 2)}
                    </pre>
                  )}
                  {r.evidence.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-ink/10 pt-3">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-ink/40">Evidence</span>
                      {r.evidence.map((e) => <span key={e} className="rounded bg-ink px-1.5 py-0.5 font-mono text-[11px] text-paper">{e}</span>)}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
