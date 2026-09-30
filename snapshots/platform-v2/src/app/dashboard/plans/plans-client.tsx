"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Device, Plan, PlanStep } from "@/db/schema";
import { api, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Modal, PageHeader, Select, Textarea, cx, decisionTone, levelTone, timeAgo, useToast } from "@/components/ui";
import { EXECUTOR_LABEL } from "@/lib/engine";

const EXAMPLES = [
  "Call John and tell him I'm twenty minutes away. Open his work order WO-1842. Navigate to 125 Main Street. When I arrive, remind me to take four inspection photographs. Then prepare the estimate.",
  "Check the weather, then text Maria that I'm on my way and start navigation to 88 Harbor Rd.",
  "Log in to the vendor portal and download last month's invoice, then draft an invoice in QuickBooks for the Henderson job.",
  "Issue a refund to the Henderson account and unlock the garage.",
];

const statusTone = (s: string) => (s === "proposed" ? "amber" : s === "confirmed" ? "sky" : s === "completed" ? "lime" : s === "cancelled" ? "neutral" : "rose") as "amber" | "sky" | "lime" | "neutral" | "rose";

export function PlansClient({ initial, devices }: { initial: Plan[]; devices: Pick<Device, "id" | "name" | "status">[] }) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<Plan | null>(null);
  const [composer, setComposer] = useState(false);
  const [request, setRequest] = useState("");
  const [deviceId, setDeviceId] = useState<number | "">(devices.find((d) => d.status === "ready")?.id ?? devices[0]?.id ?? "");
  const [planning, setPlanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [deleting, setDeleting] = useState<Plan | null>(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const id = Number(params.get("open"));
    if (id) {
      const p = items.find((x) => x.id === id);
      if (p) setOpen(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createPlan(e: React.FormEvent) {
    e.preventDefault();
    setPlanning(true);
    try {
      const created = await api<Plan>("/api/plans", { method: "POST", json: { request, deviceId: deviceId || null } });
      setItems((s) => [created, ...s]);
      setComposer(false);
      setRequest("");
      setOpen(created);
      toast.push("Plan proposed — review what needs your approval", "info");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setPlanning(false);
    }
  }

  function patchLocal(updated: Plan) {
    setItems((s) => s.map((p) => (p.id === updated.id ? updated : p)));
    setOpen((o) => (o?.id === updated.id ? updated : o));
  }

  async function execute(p: Plan) {
    setExecuting(true);
    const prev = items;
    patchLocal({ ...p, status: "running" });
    try {
      // simulate visible progress
      await new Promise((r) => setTimeout(r, 900));
      const done = await api<Plan>(`/api/plans/${p.id}/execute`, { method: "POST" });
      patchLocal(done);
      toast.push(`Plan ${done.status}. ${done.steps.filter((s) => s.status === "done").length} receipts written.`, "success");
      router.refresh();
    } catch (err) {
      setItems(prev);
      setOpen(p);
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setExecuting(false);
    }
  }

  async function cancel(p: Plan) {
    const prev = items;
    patchLocal({ ...p, status: "cancelled" });
    try {
      const updated = await api<Plan>(`/api/plans/${p.id}`, { method: "PATCH", json: { action: "cancel" } });
      patchLocal(updated);
      toast.push("Plan cancelled. Nothing was executed.", "info");
    } catch (err) {
      setItems(prev);
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  async function removeStep(p: Plan, step: PlanStep) {
    if (p.steps.length <= 1) return toast.push("A plan needs at least one step", "error");
    const steps = p.steps.filter((s) => s.id !== step.id);
    const prev = items;
    patchLocal({ ...p, steps });
    try {
      const updated = await api<Plan>(`/api/plans/${p.id}`, { method: "PATCH", json: { action: "remove_step", steps } });
      patchLocal(updated);
    } catch (err) {
      setItems(prev);
      setOpen(p);
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  async function remove() {
    if (!deleting) return;
    const prev = items;
    const t = deleting;
    setItems((s) => s.filter((p) => p.id !== t.id));
    setDeleting(null);
    setOpen(null);
    try {
      await api(`/api/plans/${t.id}`, { method: "DELETE" });
      toast.push("Plan deleted", "success");
    } catch (err) {
      setItems(prev);
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  const visible = filter === "all" ? items : items.filter((p) => p.status === filter);
  const deviceName = (id: number | null) => devices.find((d) => d.id === id)?.name ?? "Unassigned";

  return (
    <div>
      <PageHeader eyebrow="AI runtime" title="Plans" description="Tell the robot the outcome you want. The planner drafts typed capability requests; the policy broker marks what needs you." actions={<Button onClick={() => setComposer(true)}>+ New request</Button>} />

      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "proposed", "completed", "cancelled", "failed"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cx("rounded-full border px-3 py-1 text-xs capitalize", filter === f ? "border-lime-400/50 bg-lime-400/10 text-lime-200" : "border-zinc-800 text-zinc-400 hover:text-white")}>
            {f} <span className="text-zinc-500">{f === "all" ? items.length : items.filter((p) => p.status === f).length}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="⟶" title={items.length === 0 ? "No plans yet" : "No plans with this status"} description={items.length === 0 ? "Describe a multi-step outcome. You'll see exactly what the robot understood before anything runs." : "Try another filter."} action={items.length === 0 ? <Button onClick={() => setComposer(true)}>Make a request</Button> : undefined} />
      ) : (
        <div className="space-y-3">
          {visible.map((p) => (
            <button key={p.id} onClick={() => setOpen(p)} className="block w-full text-left">
              <Card className="p-5 transition-colors hover:border-zinc-700">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm text-zinc-100">“{p.request}”</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                      <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                      <span>{p.steps.length} steps</span>
                      <span>·</span>
                      <span>{deviceName(p.deviceId)}</span>
                      <span>·</span>
                      <span>{timeAgo(p.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {p.steps.slice(0, 6).map((s) => (
                      <span key={s.id} title={s.title} className={cx("h-2 w-6 rounded-full", s.status === "done" ? "bg-lime-400" : s.status === "denied" ? "bg-rose-400" : s.status === "skipped" ? "bg-zinc-700" : s.decision === "allow" ? "bg-zinc-600" : "bg-amber-400/70")} />
                    ))}
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <Modal open={composer} onClose={() => setComposer(false)} title="What should the phone do?">
        <form onSubmit={createPlan} className="space-y-4">
          <Field label="Request"><Textarea required autoFocus rows={4} value={request} onChange={(e) => setRequest(e.target.value)} placeholder="Call John and tell him I'm twenty minutes away…" /></Field>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex, i) => (
              <button type="button" key={i} onClick={() => setRequest(ex)} className="rounded-full border border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-400 hover:border-lime-400/40 hover:text-lime-200">Example {i + 1}</button>
            ))}
          </div>
          <Field label="Target device">
            <Select value={deviceId} onChange={(e) => setDeviceId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Unassigned</option>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name}{d.status !== "ready" ? ` (${d.status.replace("_", " ")})` : ""}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setComposer(false)}>Cancel</Button>
            <Button type="submit" loading={planning}>{planning ? "Planning…" : "Propose plan"}</Button>
          </div>
        </form>
      </Modal>

      {/* Plan detail */}
      <Modal open={!!open} onClose={() => setOpen(null)} title="Proposed plan" wide>
        {open && (
          <div className="space-y-5">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">You said</p>
              <p className="mt-1 text-sm text-zinc-100">“{open.request}”</p>
              <p className="mt-3 text-xs uppercase tracking-wide text-zinc-500">Here is what I understood</p>
              <p className="mt-1 text-sm text-zinc-300">{open.understanding}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <Badge tone={statusTone(open.status)}>{open.status}</Badge>
                <span>Device: {deviceName(open.deviceId)}</span>
                <span>·</span>
                <span>{timeAgo(open.createdAt)}</span>
              </div>
            </div>

            <ol className="space-y-2">
              {open.steps.map((s, i) => (
                <li key={s.id} className={cx("flex items-start gap-3 rounded-xl border p-3", s.status === "done" ? "border-lime-400/20 bg-lime-400/5" : s.status === "denied" || s.decision === "deny" ? "border-rose-500/20 bg-rose-500/5" : s.decision === "allow" ? "border-zinc-800" : "border-amber-400/20 bg-amber-400/5")}>
                  <span className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", s.status === "done" ? "bg-lime-400 text-zinc-950" : s.status === "denied" ? "bg-rose-500 text-white" : "bg-zinc-800 text-zinc-300")}>
                    {s.status === "done" ? "✓" : s.status === "denied" ? "✕" : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-100">{s.title}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge tone={decisionTone(s.decision)}>{s.decision === "allow" ? "allowed by policy" : s.decision === "confirm" ? "requires confirmation" : s.decision === "step_up" ? "requires step-up auth" : "denied by policy"}</Badge>
                      <Badge>{EXECUTOR_LABEL[s.executor]}</Badge>
                      <Badge tone={levelTone(s.level)}>L{s.level}</Badge>
                      <Badge className="mono normal-case tracking-normal">{s.capability}</Badge>
                      {s.status !== "pending" && <Badge tone="neutral">{s.status}</Badge>}
                    </div>
                  </div>
                  {open.status === "proposed" && (
                    <button onClick={() => removeStep(open, s)} className="text-xs text-zinc-500 hover:text-rose-300" title="Remove step">Remove</button>
                  )}
                </li>
              ))}
            </ol>

            {open.status === "proposed" || open.status === "confirmed" ? (
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Requires confirmation</p>
                {open.steps.filter((s) => s.decision === "confirm" || s.decision === "step_up").length === 0 ? (
                  <p className="mt-1 text-sm text-zinc-300">Everything here is allowed by policy. Confirm to run.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-sm text-zinc-200">
                    {open.steps.filter((s) => s.decision === "confirm" || s.decision === "step_up").map((s) => <li key={s.id}>• {s.title}{s.decision === "step_up" && <span className="text-violet-300"> (step-up auth)</span>}</li>)}
                  </ul>
                )}
                {open.steps.some((s) => s.decision === "deny") && <p className="mt-2 text-xs text-rose-300">Denied steps will be skipped and recorded as blocked.</p>}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" className="text-rose-300" onClick={() => setDeleting(open)}>Delete</Button>
                  <Button variant="secondary" onClick={() => cancel(open)}>Cancel plan</Button>
                  <Button onClick={() => execute(open)} loading={executing}>{executing ? "Executing…" : "Confirm plan & run"}</Button>
                </div>
              </div>
            ) : open.status === "running" ? (
              <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 p-4 text-sm text-sky-200">Dispatching to executors… Android, voice, MCP, and Playwright workers are performing the work.</div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 p-4">
                <p className="text-sm text-zinc-400">{open.status === "completed" ? "Every action left a receipt with evidence." : open.status === "cancelled" ? "Cancelled before execution." : "Nothing could run under current policy."}</p>
                <div className="flex gap-2">
                  <Button variant="ghost" className="text-rose-300" onClick={() => setDeleting(open)}>Delete</Button>
                  {open.status === "completed" && <Button variant="secondary" onClick={() => router.push("/dashboard/receipts")}>View receipts →</Button>}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} title="Delete plan?" message="The plan record will be removed. Any receipts already written stay in the timeline." />
    </div>
  );
}
