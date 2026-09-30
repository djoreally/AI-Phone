"use client";

import { useState } from "react";
import type { Capability, Policy } from "@/db/schema";
import { api, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea, Toggle, cx, decisionTone, useToast } from "@/components/ui";
import { EXECUTOR_LABEL, LEVEL_LABEL } from "@/lib/engine";

type FormState = { name: string; description: string; scope: string; actionPattern: string; minLevel: number; decision: string; priority: number; enabled: boolean };
const empty: FormState = { name: "", description: "", scope: "*", actionPattern: "*", minLevel: 1, decision: "confirm", priority: 100, enabled: true };

const DECISIONS = [
  { v: "allow", l: "Allow", d: "Run without asking" },
  { v: "confirm", l: "Confirm", d: "Show a confirmation card first" },
  { v: "step_up", l: "Step-up", d: "Require additional authentication" },
  { v: "deny", l: "Deny", d: "Block and leave a receipt" },
];

export function PoliciesClient({ initial, capabilities }: { initial: Policy[]; capabilities: Pick<Capability, "slug" | "name">[] }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<Policy | null | "new">(null);
  const [deleting, setDeleting] = useState<Policy | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  function openNew() { setForm(empty); setEditing("new"); }
  function openEdit(p: Policy) {
    setForm({ name: p.name, description: p.description, scope: p.scope, actionPattern: p.actionPattern, minLevel: p.minLevel, decision: p.decision, priority: p.priority, enabled: p.enabled });
    setEditing(p);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing === "new") {
        const created = await api<Policy>("/api/policies", { method: "POST", json: form });
        setItems((s) => [...s, created].sort((a, b) => a.priority - b.priority));
        toast.push("Policy added to the broker", "success");
      } else if (editing) {
        const updated = await api<Policy>(`/api/policies/${editing.id}`, { method: "PATCH", json: form });
        setItems((s) => s.map((p) => (p.id === updated.id ? updated : p)).sort((a, b) => a.priority - b.priority));
        toast.push("Policy updated", "success");
      }
      setEditing(null);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(p: Policy) {
    const prev = items;
    setItems((s) => s.map((x) => (x.id === p.id ? { ...x, enabled: !p.enabled } : x)));
    try {
      const updated = await api<Policy>(`/api/policies/${p.id}`, { method: "PATCH", json: { enabled: !p.enabled } });
      setItems((s) => s.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setItems(prev);
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  async function remove() {
    if (!deleting) return;
    const prev = items;
    const t = deleting;
    setItems((s) => s.filter((p) => p.id !== t.id));
    setDeleting(null);
    try {
      await api(`/api/policies/${t.id}`, { method: "DELETE" });
      toast.push("Policy removed", "success");
    } catch (err) {
      setItems(prev);
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  const scopeLabel = (s: string) => (s === "*" ? "Everything" : EXECUTOR_LABEL[s] ? `${EXECUTOR_LABEL[s]} executor` : capabilities.find((c) => c.slug === s)?.name ?? s);

  return (
    <div>
      <PageHeader eyebrow="Policy is the conscience" title="Policy broker" description="Rules are evaluated by priority (lowest first). The first match decides: allow, confirm, step-up, or deny. Level 4 can never silently run." actions={<Button onClick={openNew}>+ Add rule</Button>} />

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((l) => (
          <div key={l} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Level {l}</p>
            <p className="text-sm font-semibold text-white">{LEVEL_LABEL[l]}</p>
            <p className="mt-1 text-xs text-zinc-500">Default: {l <= 2 ? "allow" : l === 3 ? "confirm" : "step-up"}</p>
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState icon="⛨" title="No policies yet" description="Without rules the broker falls back to level defaults. Add rules to tighten or loosen behavior for specific capabilities." action={<Button onClick={openNew}>Add first rule</Button>} />
      ) : (
        <Card className="divide-y divide-zinc-800">
          {items.map((p) => (
            <div key={p.id} className={cx("flex flex-col gap-3 p-4 sm:flex-row sm:items-center", !p.enabled && "opacity-60")}>
              <div className="mono w-10 shrink-0 text-xs text-zinc-500">#{p.priority}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-white">{p.name}</p>
                  <Badge tone={decisionTone(p.decision)}>{p.decision.replace("_", "-")}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-zinc-400">{p.description}</p>
                <p className="mono mt-1 text-[11px] text-zinc-500">scope={scopeLabel(p.scope)} · action=&quot;{p.actionPattern}&quot; · level≥{p.minLevel}</p>
              </div>
              <div className="flex items-center gap-2">
                <Toggle checked={p.enabled} onChange={() => toggle(p)} />
                <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>Edit</Button>
                <Button size="sm" variant="ghost" className="text-rose-300" onClick={() => setDeleting(p)}>Delete</Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add policy rule" : "Edit policy rule"}>
        <form onSubmit={save} className="space-y-4">
          <Field label="Rule name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Confirm all outbound calls" /></Field>
          <Field label="Why this rule exists"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Scope">
              <Select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                <option value="*">Everything</option>
                <optgroup label="Executors">
                  {Object.entries(EXECUTOR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </optgroup>
                <optgroup label="Capabilities">
                  {capabilities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </optgroup>
              </Select>
            </Field>
            <Field label="Action pattern" hint="Use * as wildcard suffix"><Input value={form.actionPattern} onChange={(e) => setForm({ ...form, actionPattern: e.target.value })} className="mono" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Min level">
              <Select value={form.minLevel} onChange={(e) => setForm({ ...form, minLevel: Number(e.target.value) })}>
                {[1, 2, 3, 4].map((l) => <option key={l} value={l}>L{l}+</option>)}
              </Select>
            </Field>
            <Field label="Decision">
              <Select value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value })}>
                {DECISIONS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
              </Select>
            </Field>
            <Field label="Priority"><Input type="number" min={1} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></Field>
          </div>
          <p className="text-xs text-zinc-500">{DECISIONS.find((d) => d.v === form.decision)?.d}</p>
          <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label="Enabled" />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" loading={busy}>{editing === "new" ? "Add rule" : "Save"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} title="Delete policy?" message={`"${deleting?.name}" will no longer influence broker decisions.`} />
    </div>
  );
}
