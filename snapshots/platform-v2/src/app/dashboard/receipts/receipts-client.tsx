"use client";

import { useState } from "react";
import type { Device, Receipt } from "@/db/schema";
import { api, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea, cx, decisionTone, levelTone, timeAgo, useToast } from "@/components/ui";
import { EXECUTOR_LABEL, LEVEL_LABEL } from "@/lib/engine";

type FormState = { action: string; capability: string; executor: string; level: number; decision: string; outcome: string; summary: string; evidence: string; deviceId: number | "" };
const empty: FormState = { action: "", capability: "manual", executor: "android", level: 1, decision: "allowed", outcome: "success", summary: "", evidence: "", deviceId: "" };

export function ReceiptsClient({ initial, devices }: { initial: Receipt[]; devices: Pick<Device, "id" | "name">[] }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [executor, setExecutor] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [detail, setDetail] = useState<Receipt | null>(null);
  const [editing, setEditing] = useState<Receipt | null | "new">(null);
  const [deleting, setDeleting] = useState<Receipt | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState<{ valid: boolean; reason: string; payload: unknown } | null>(null);
  const [verifying, setVerifying] = useState(false);

  async function runVerify(r: Receipt) {
    setVerifying(true);
    setVerify(null);
    try {
      const res = await api<{ valid: boolean; reason: string; payload: unknown }>(`/api/receipts/${r.id}/verify`);
      setVerify(res);
      toast.push(res.valid ? "Signature verified against device key" : `Verification failed: ${res.reason}`, res.valid ? "success" : "error");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setVerifying(false);
    }
  }

  const visible = items
    .filter((r) => executor === "all" || r.executor === executor)
    .filter((r) => outcome === "all" || r.outcome === outcome)
    .filter((r) => !query || `${r.action} ${r.capability} ${r.summary}`.toLowerCase().includes(query.toLowerCase()));

  function openNew() { setForm(empty); setEditing("new"); }
  function closeDetail() { setDetail(null); setVerify(null); }
  function openEdit(r: Receipt) {
    setForm({ action: r.action, capability: r.capability, executor: r.executor, level: r.level, decision: r.decision, outcome: r.outcome, summary: r.summary, evidence: r.evidence.join("\n"), deviceId: r.deviceId ?? "" });
    setDetail(null);
    setEditing(r);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing === "new") {
        const created = await api<Receipt>("/api/receipts", { method: "POST", json: { ...form, deviceId: form.deviceId || null } });
        setItems((s) => [created, ...s]);
        toast.push("Manual receipt recorded", "success");
      } else if (editing) {
        const updated = await api<Receipt>(`/api/receipts/${editing.id}`, { method: "PATCH", json: { summary: form.summary, evidence: form.evidence, outcome: form.outcome } });
        setItems((s) => s.map((r) => (r.id === updated.id ? updated : r)));
        toast.push("Receipt annotated", "success");
      }
      setEditing(null);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    const prev = items;
    const t = deleting;
    setItems((s) => s.filter((r) => r.id !== t.id));
    setDeleting(null);
    setDetail(null);
    try {
      await api(`/api/receipts/${t.id}`, { method: "DELETE" });
      toast.push("Receipt deleted", "success");
    } catch (err) {
      setItems(prev);
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  const deviceName = (id: number | null) => devices.find((d) => d.id === id)?.name ?? "—";
  const groups = groupByDay(visible);

  return (
    <div>
      <PageHeader eyebrow="Here is what I did" title="Receipts" description="Every meaningful action leaves a human-readable receipt with the decision, the executor, and the evidence." actions={<Button variant="secondary" onClick={openNew}>+ Manual receipt</Button>} />

      <div className="mb-5 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Input placeholder="Search actions, capabilities, summaries…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select value={executor} onChange={(e) => setExecutor(e.target.value)} className="sm:w-40">
          <option value="all">All executors</option>
          {Object.entries(EXECUTOR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="sm:w-36">
          <option value="all">All outcomes</option>
          <option value="success">Success</option>
          <option value="blocked">Blocked</option>
          <option value="failed">Failed</option>
        </Select>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="≣" title={items.length === 0 ? "No receipts yet" : "Nothing matches"} description={items.length === 0 ? "Run a plan and every step will show up here with evidence." : "Adjust your filters or search."} />
      ) : (
        <div className="space-y-6">
          {groups.map(([day, rows]) => (
            <div key={day}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{day}</p>
              <Card className="divide-y divide-zinc-800">
                {rows.map((r) => (
                  <button key={r.id} onClick={() => setDetail(r)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-zinc-800/40">
                    <span className={cx("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", r.outcome === "success" ? "bg-lime-400" : r.outcome === "blocked" ? "bg-rose-400" : "bg-amber-400")} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-100">{r.action}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                        <Badge tone={decisionTone(r.decision)}>{r.decision.replace("_", "-")}</Badge>
                        <Badge>{EXECUTOR_LABEL[r.executor] ?? r.executor}</Badge>
                        <Badge tone={levelTone(r.level)}>L{r.level}</Badge>
                        <span className="mono">{r.capability}</span>
                        <span>·</span>
                        <span>{r.evidence.length} evidence item{r.evidence.length === 1 ? "" : "s"}</span>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-zinc-500">{timeAgo(r.createdAt)}</span>
                  </button>
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!detail} onClose={closeDetail} title="Receipt" wide>
        {detail && (
          <div className="space-y-4">
            <p className="text-base text-white">{detail.action}</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={decisionTone(detail.decision)}>{detail.decision.replace("_", "-")}</Badge>
              <Badge tone={detail.outcome === "success" ? "lime" : detail.outcome === "blocked" ? "rose" : "amber"}>{detail.outcome}</Badge>
              <Badge>{EXECUTOR_LABEL[detail.executor] ?? detail.executor}</Badge>
              <Badge tone={levelTone(detail.level)}>L{detail.level} · {LEVEL_LABEL[detail.level]}</Badge>
            </div>
            <dl className="mono grid grid-cols-[110px_1fr] gap-y-1.5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs">
              <dt className="text-zinc-500">capability</dt><dd className="text-zinc-200">{detail.capability}</dd>
              <dt className="text-zinc-500">device</dt><dd className="text-zinc-200">{deviceName(detail.deviceId)}</dd>
              <dt className="text-zinc-500">plan</dt><dd className="text-zinc-200">{detail.planId ? `#${detail.planId}` : "standalone"}</dd>
              <dt className="text-zinc-500">duration</dt><dd className="text-zinc-200">{(detail.durationMs / 1000).toFixed(1)}s</dd>
              <dt className="text-zinc-500">timestamp</dt><dd className="text-zinc-200">{new Date(detail.createdAt).toLocaleString()}</dd>
              <dt className="text-zinc-500">receiptId</dt><dd className="text-zinc-200">{detail.receiptRef ?? `rcpt_${detail.id}`}</dd>
              <dt className="text-zinc-500">authMethod</dt><dd className="text-zinc-200">{detail.authMethod}</dd>
              <dt className="text-zinc-500">signature</dt><dd className="truncate text-zinc-200">{detail.signature ?? "unsigned"}</dd>
            </dl>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Integrity</p>
                <Button size="sm" variant="secondary" onClick={() => runVerify(detail)} loading={verifying}>Verify signature</Button>
              </div>
              {verify && (
                <div className="mt-2">
                  <Badge tone={verify.valid ? "lime" : "rose"}>{verify.reason}</Badge>
                  <pre className="mono mt-2 max-h-56 overflow-auto rounded-lg bg-zinc-950 p-2 text-[11px] leading-4 text-zinc-400">{JSON.stringify(verify.payload, null, 2)}</pre>
                </div>
              )}
              <p className="mt-2 text-[11px] text-zinc-600">Receipts are HMAC-signed with the device-scoped key. Editing evidence or outcome after the fact breaks the seal — by design.</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Summary</p>
              <p className="text-sm text-zinc-300">{detail.summary || "—"}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">Evidence</p>
              {detail.evidence.length === 0 ? <p className="text-xs text-zinc-600">No evidence attached</p> : (
                <ul className="mono space-y-1 text-xs text-zinc-300">
                  {detail.evidence.map((e, i) => <li key={i} className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1">{e}</li>)}
                </ul>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-800 pt-4">
              <Button variant="ghost" className="text-rose-300" onClick={() => setDeleting(detail)}>Delete</Button>
              <Button variant="secondary" onClick={() => openEdit(detail)}>Annotate</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Record a manual receipt" : "Annotate receipt"}>
        <form onSubmit={save} className="space-y-4">
          {editing === "new" && (
            <>
              <Field label="Action"><Input required value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} placeholder="Manually verified customer address" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Capability"><Input value={form.capability} onChange={(e) => setForm({ ...form, capability: e.target.value })} className="mono" /></Field>
                <Field label="Executor">
                  <Select value={form.executor} onChange={(e) => setForm({ ...form, executor: e.target.value })}>
                    {Object.entries(EXECUTOR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Level"><Select value={form.level} onChange={(e) => setForm({ ...form, level: Number(e.target.value) })}>{[1, 2, 3, 4].map((l) => <option key={l} value={l}>L{l}</option>)}</Select></Field>
                <Field label="Decision">
                  <Select value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value })}>
                    <option value="allowed">Allowed</option><option value="confirmed">Confirmed</option><option value="step_up">Step-up</option><option value="denied">Denied</option>
                  </Select>
                </Field>
                <Field label="Device">
                  <Select value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value ? Number(e.target.value) : "" })}>
                    <option value="">—</option>
                    {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                </Field>
              </div>
            </>
          )}
          <Field label="Outcome">
            <Select value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}>
              <option value="success">Success</option><option value="blocked">Blocked</option><option value="failed">Failed</option>
            </Select>
          </Field>
          <Field label="Summary"><Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
          <Field label="Evidence (one per line)"><Textarea value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} className="mono" placeholder="screenshot:step-01.png" /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" loading={busy}>{editing === "new" ? "Record" : "Save"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} title="Delete receipt?" message="Deleting evidence weakens your audit trail. This cannot be undone." />
    </div>
  );
}

function groupByDay(rows: Receipt[]): Array<[string, Receipt[]]> {
  const map = new Map<string, Receipt[]>();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  for (const r of rows) {
    const d = new Date(r.createdAt);
    const key = d.toDateString() === today ? "Today" : d.toDateString() === yesterday ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return Array.from(map.entries());
}
