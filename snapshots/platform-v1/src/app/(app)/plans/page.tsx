"use client";

import { useState } from "react";
import { Badge, Button, Card, DECISION_TONE, EmptyState, ErrorState, Field, Icon, LevelBadge, Modal, PageHeader, Skeleton, cn, inputCls, useToast } from "@/components/ui";
import { ApiError, api, useApi } from "@/lib/client";
import { EXECUTOR_LABEL, PLAN_STATE, timeAgo, type DeviceDTO, type PlanDTO } from "@/lib/shared";

const EXAMPLES = [
  "Call John and tell him I'm twenty minutes away. Open his work order. Navigate to the job at 125 Main Street. When I arrive, remind me to take four inspection photographs. Then prepare the estimate.",
  "Draft an invoice for Acme, send it, and refund order 441.",
  "Open the vendor portal website, fill in the onboarding form, then submit it.",
  "Send an email to Dana and schedule a meeting on my calendar.",
];

const STATUS_TONE: Record<string, string> = {
  proposed: "bg-amber-100 text-amber-900 ring-amber-600/30",
  completed: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  partial: "bg-orange-100 text-orange-800 ring-orange-600/20",
  cancelled: "bg-stone-200 text-stone-700 ring-stone-500/20",
};
const STATUS_LABEL: Record<string, string> = { proposed: "Awaiting confirmation", completed: "Completed", partial: "Completed with blocks", cancelled: "Cancelled" };

export default function PlansPage() {
  const { data, setData, loading, error, reload } = useApi<PlanDTO[]>("/api/plans");
  const { data: devices } = useApi<DeviceDTO[]>("/api/devices");
  const toast = useToast();
  const [text, setText] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [planning, setPlanning] = useState(false);
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [stepUpFor, setStepUpFor] = useState<PlanDTO | null>(null);
  const [password, setPassword] = useState("");
  const [stepUpErr, setStepUpErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [summary, setSummary] = useState("");

  const plans = data ?? [];
  const shown = plans.filter((p) => filter === "all" || p.status === filter);
  const editing = plans.find((p) => p.id === editId) ?? null;

  const replace = (p: PlanDTO) => setData((l) => (l ?? []).map((x) => (x.id === p.id ? p : x)));

  async function compose(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 4) return;
    setPlanning(true);
    try {
      const plan = await api<PlanDTO>("/api/plans", { method: "POST", body: { utterance: text, deviceId: deviceId || undefined } });
      setData((l) => [plan, ...(l ?? [])]);
      setText("");
      toast("Plan proposed. Review the steps, then confirm.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not plan that", "err");
    }
    setPlanning(false);
  }

  async function confirm(p: PlanDTO, pw?: string) {
    const prev = data;
    setBusyId(p.id);
    // Optimistic: show the outcome the broker already decided on.
    replace({
      ...p,
      status: p.steps.some((s) => s.decision === "deny") ? "partial" : "completed",
      steps: p.steps.map((s) => ({ ...s, status: s.decision === "deny" ? "blocked" : "done", result: s.decision === "deny" ? s.reason : "Running…" })),
    });
    try {
      const updated = await api<PlanDTO>(`/api/plans/${p.id}`, { method: "PATCH", body: { action: "confirm", password: pw } });
      replace(updated);
      setStepUpFor(null);
      setPassword("");
      toast(updated.status === "completed" ? "Plan executed. Receipts recorded." : "Plan executed. Some steps were blocked by policy.");
    } catch (err) {
      setData(prev);
      if (err instanceof ApiError && err.data.needsStepUp) {
        setStepUpErr(pw ? "Incorrect password. Try again." : null);
        setStepUpFor(p);
      } else toast(err instanceof Error ? err.message : "Execution failed", "err");
    }
    setBusyId(null);
  }

  function onConfirmClick(p: PlanDTO) {
    if (p.steps.some((s) => s.stepUp && s.decision !== "deny")) {
      setStepUpErr(null);
      setPassword("");
      setStepUpFor(p);
    } else confirm(p);
  }

  async function cancel(p: PlanDTO) {
    const prev = data;
    replace({ ...p, status: "cancelled" });
    try {
      await api(`/api/plans/${p.id}`, { method: "PATCH", body: { action: "cancel" } });
      toast("Plan cancelled");
    } catch (err) {
      setData(prev);
      toast(err instanceof Error ? err.message : "Cancel failed", "err");
    }
  }

  async function remove(p: PlanDTO) {
    const prev = data;
    setData((l) => (l ?? []).filter((x) => x.id !== p.id));
    try {
      await api(`/api/plans/${p.id}`, { method: "DELETE" });
      toast("Plan deleted");
    } catch (err) {
      setData(prev);
      toast(err instanceof Error ? err.message : "Delete failed", "err");
    }
  }

  async function removeStep(p: PlanDTO, stepId: number) {
    const prev = data;
    replace({ ...p, steps: p.steps.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, position: i + 1 })) });
    try {
      replace(await api<PlanDTO>(`/api/plans/${p.id}`, { method: "PATCH", body: { action: "edit", removeStepId: stepId } }));
    } catch (err) {
      setData(prev);
      toast(err instanceof Error ? err.message : "Could not remove step", "err");
    }
  }

  async function saveSummary(p: PlanDTO) {
    const prev = data;
    replace({ ...p, summary });
    setEditId(null);
    try {
      replace(await api<PlanDTO>(`/api/plans/${p.id}`, { method: "PATCH", body: { action: "edit", summary } }));
      toast("Plan updated");
    } catch (err) {
      setData(prev);
      toast(err instanceof Error ? err.message : "Update failed", "err");
    }
  }

  const confirmNeeded = (p: PlanDTO) => p.steps.filter((s) => s.decision === "confirm");

  return (
    <div>
      <PageHeader eyebrow="Here is what I understood" title="Assistant" sub="Say what you want. The planner proposes typed capability requests, the policy broker classifies each one, and nothing runs until you confirm." />

      <Card className="mb-8 p-5">
        <form onSubmit={compose} className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={cn(inputCls, "min-h-28 resize-y text-base")}
            placeholder="Call John and tell him I'm twenty minutes away. Open his work order. Navigate to the job…"
            aria-label="What should the phone do?"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <select className={cn(inputCls, "sm:w-64")} value={deviceId} onChange={(e) => setDeviceId(e.target.value)} aria-label="Device">
              <option value="">Any ready device</option>
              {(devices ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <Button type="submit" variant="accent" loading={planning} disabled={text.trim().length < 4}>
              <Icon name="sparkle" className="h-4 w-4" /> {planning ? "Planning…" : "Propose plan"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setText(ex)} className="rounded-full border border-ink/15 bg-white/60 px-3 py-1 text-xs text-ink/65 transition hover:border-accent hover:text-ink">
                {ex.length > 46 ? ex.slice(0, 44) + "…" : ex}
              </button>
            ))}
          </div>
        </form>
      </Card>

      <div className="mb-5 flex flex-wrap gap-2">
        {[["all", "All"], ["proposed", "Awaiting"], ["completed", "Completed"], ["partial", "Partial"], ["cancelled", "Cancelled"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full px-3.5 py-1.5 text-xs font-medium transition", filter === k ? "bg-ink text-paper" : "bg-white/70 ring-1 ring-ink/10 hover:bg-white")}>
            {l}<span className="ml-1.5 opacity-60">{k === "all" ? plans.length : plans.filter((p) => p.status === k).length}</span>
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56" />)}</div>}
      {!loading && !error && plans.length === 0 && (
        <EmptyState icon="sparkle" title="No plans yet" body="Describe an outcome above. You'll see the proposed steps, who performs them, and what needs your approval." />
      )}
      {!loading && plans.length > 0 && shown.length === 0 && <EmptyState icon="search" title="Nothing in this view" body="No plans with this status." action={<Button variant="outline" onClick={() => setFilter("all")}>Show all</Button>} />}

      <div className="space-y-5">
        {shown.map((p) => (
          <Card key={p.id} className="pop overflow-hidden">
            <div className="border-b border-ink/10 bg-paper-2/50 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-ink/50">
                    {p.status === "proposed" ? "Proposed plan" : "Plan"} · {timeAgo(p.createdAt)}{p.deviceName ? ` · ${p.deviceName}` : ""}
                  </p>
                  <h3 className="mt-1 font-display text-lg font-bold leading-snug">{p.summary}</h3>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status] ?? p.status}</Badge>
                  <span className="font-mono text-[10px] tracking-wider text-ink/40">{PLAN_STATE[p.status]}</span>
                </div>
              </div>
              <p className="mt-2 border-l-2 border-accent/60 pl-3 text-sm italic text-ink/65">“{p.utterance}”</p>
            </div>

            <ol className="divide-y divide-ink/10">
              {p.steps.map((s) => (
                <li key={s.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold", s.status === "done" ? "bg-emerald-600 text-white" : s.status === "blocked" ? "bg-red-600 text-white" : "bg-ink text-paper")}>
                    {s.status === "done" ? <Icon name="check" className="h-3.5 w-3.5" /> : s.status === "blocked" ? <Icon name="x" className="h-3.5 w-3.5" /> : s.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium", s.status === "blocked" && "text-ink/60 line-through decoration-red-400")}>{s.title}</p>
                    <p className="mt-0.5 text-xs text-ink/55">{s.status === "pending" ? s.reason : s.result || s.reason}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge>{EXECUTOR_LABEL[s.executor] ?? s.executor}</Badge>
                      <LevelBadge level={s.level} />
                      <Badge tone={DECISION_TONE[s.decision]} className="uppercase">{s.decision}{s.stepUp ? " + step-up" : ""}</Badge>
                      <code className="self-center font-mono text-[11px] text-ink/40">{s.tool}</code>
                      {s.target && <code className="self-center rounded bg-ink/5 px-1.5 font-mono text-[11px] text-ink/60">→ {s.target}</code>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            {p.status === "proposed" && (
              <div className="flex flex-col gap-3 border-t border-ink/10 bg-white/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-ink/60">
                  {confirmNeeded(p).length + p.steps.filter((s) => s.stepUp).length > 0 ? (
                    <><span className="font-semibold">Requires confirmation:</span> {confirmNeeded(p).map((s) => s.title.toLowerCase()).slice(0, 3).join(" · ")}{confirmNeeded(p).length > 3 ? " …" : ""}</>
                  ) : "All steps are read or prepare only."}
                  {p.steps.some((s) => s.decision === "deny") && <span className="ml-1 font-semibold text-red-700">Some steps will be blocked.</span>}
                </p>
                <div className="flex shrink-0 gap-2">
                  <Button variant="accent" size="sm" loading={busyId === p.id} onClick={() => onConfirmClick(p)}>Confirm plan</Button>
                  <Button variant="outline" size="sm" onClick={() => { setEditId(p.id); setSummary(p.summary); }}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => cancel(p)}>Cancel</Button>
                </div>
              </div>
            )}
            {p.status !== "proposed" && (
              <div className="flex justify-end border-t border-ink/10 px-5 py-2.5">
                <Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50" onClick={() => remove(p)}><Icon name="trash" className="h-3.5 w-3.5" /> Delete</Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Step-up */}
      <Modal open={!!stepUpFor} onClose={() => setStepUpFor(null)} title="Step-up authentication">
        {stepUpFor && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirm(stepUpFor, password);
            }}
            className="space-y-4"
          >
            <div className="flex gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-900">
              <Icon name="lock" className="mt-0.5 h-5 w-5 shrink-0" />
              <p>This plan includes restricted (Level 4) actions: <strong>{stepUpFor.steps.filter((s) => s.stepUp).map((s) => s.title).join("; ")}</strong>. Re-enter your password (step-up authentication) to approve.</p>
            </div>
            <Field label="Account password">
              <input type="password" autoFocus className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {stepUpErr && <p role="alert" className="text-sm text-red-700">{stepUpErr}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setStepUpFor(null)}>Cancel</Button>
              <Button type="submit" variant="danger" loading={busyId === stepUpFor.id}>Authorize & run</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Edit */}
      <Modal open={!!editing} onClose={() => setEditId(null)} title="Edit plan">
        {editing && (
          <div className="space-y-4">
            <Field label="Plan title"><input className={inputCls} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink/55">Steps</p>
              <ul className="space-y-2">
                {editing.steps.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-ink/10">
                    <span className="font-mono text-xs text-ink/40">{s.position}</span>
                    <span className="flex-1">{s.title}</span>
                    <Button variant="ghost" size="sm" disabled={editing.steps.length <= 1} className="text-red-700 hover:bg-red-50" onClick={() => removeStep(editing, s.id)} aria-label={`Remove step ${s.position}`}>
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditId(null)}>Close</Button>
              <Button variant="accent" disabled={!summary.trim()} onClick={() => saveSummary(editing)}>Save title</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
