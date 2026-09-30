"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, DECISION_TONE, EmptyState, ErrorState, Field, Icon, LevelBadge, Modal, PageHeader, Skeleton, cn, inputCls, useToast } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { LEVEL_META, type CapabilityDTO, type PolicyDTO } from "@/lib/shared";

type Form = { name: string; description: string; matchType: string; matchValue: string; decision: string };

function PolicyForm({ initial, caps, editing, onSubmit, onCancel }: { initial: Form; caps: CapabilityDTO[]; editing: boolean; onSubmit: (f: Form) => void; onCancel: () => void }) {
  const [f, setF] = useState(initial);
  const tools = useMemo(() => caps.flatMap((c) => c.tools.map((t) => `${c.slug}:${t.name}`)), [caps]);

  function changeType(t: string) {
    setF((s) => ({ ...s, matchType: t, matchValue: t === "level" ? "3" : t === "capability" ? (caps[0]?.slug ?? "") : (tools[0] ?? "") }));
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(f);
      }}
      className="space-y-4"
    >
      <Field label="Policy name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Confirm every outbound call" required /></Field>
      <Field label="Description"><input className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Why this rule exists" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Applies to">
          <select className={inputCls} value={f.matchType} onChange={(e) => changeType(e.target.value)}>
            <option value="level">Safety level</option>
            <option value="capability">Capability</option>
            <option value="tool">Single tool</option>
          </select>
        </Field>
        <Field label="Target">
          <select className={inputCls} value={f.matchValue} onChange={(e) => setF({ ...f, matchValue: e.target.value })}>
            {f.matchType === "level" && [1, 2, 3, 4].map((l) => <option key={l} value={String(l)}>Level {l} — {LEVEL_META[l].label}</option>)}
            {f.matchType === "capability" && caps.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            {f.matchType === "tool" && tools.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Decision" hint="Level 3 can never be looser than Confirm, and Level 4 always needs step-up. Policies can only tighten those floors.">
        <div className="grid grid-cols-3 gap-2">
          {["allow", "confirm", "deny"].map((d) => (
            <button key={d} type="button" onClick={() => setF({ ...f, decision: d })} className={cn("rounded-lg px-3 py-2.5 text-sm font-medium capitalize ring-1 ring-inset transition", f.decision === d ? DECISION_TONE[d] + " ring-2" : "bg-white text-ink/60 ring-ink/15 hover:bg-white/60")}>
              {d}
            </button>
          ))}
        </div>
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="accent">{editing ? "Save policy" : "Create policy"}</Button>
      </div>
    </form>
  );
}

function targetLabel(p: PolicyDTO) {
  if (p.matchType === "level") return `Level ${p.matchValue} · ${LEVEL_META[Number(p.matchValue)]?.label ?? ""}`;
  return p.matchValue;
}

export default function PoliciesPage() {
  const { data, setData, loading, error, reload } = useApi<PolicyDTO[]>("/api/policies");
  const { data: caps } = useApi<CapabilityDTO[]>("/api/capabilities");
  const toast = useToast();
  const [formFor, setFormFor] = useState<"new" | PolicyDTO | null>(null);
  const policies = data ?? [];

  async function toggle(p: PolicyDTO) {
    const prev = data;
    setData((l) => (l ?? []).map((x) => (x.id === p.id ? { ...x, enabled: !x.enabled } : x)));
    try {
      await api(`/api/policies/${p.id}`, { method: "PATCH", body: { enabled: !p.enabled } });
    } catch (e) {
      setData(prev);
      toast(e instanceof Error ? e.message : "Update failed", "err");
    }
  }

  async function remove(p: PolicyDTO) {
    const prev = data;
    setData((l) => (l ?? []).filter((x) => x.id !== p.id));
    try {
      await api(`/api/policies/${p.id}`, { method: "DELETE" });
      toast("Policy deleted");
    } catch (e) {
      setData(prev);
      toast(e instanceof Error ? e.message : "Delete failed", "err");
    }
  }

  async function save(f: Form) {
    const target = formFor;
    setFormFor(null);
    if (target === "new") {
      const temp: PolicyDTO = { id: -Date.now(), ...f, enabled: true, createdAt: new Date().toISOString() };
      setData((l) => [...(l ?? []), temp]);
      try {
        const row = await api<PolicyDTO>("/api/policies", { method: "POST", body: f });
        setData((l) => (l ?? []).map((x) => (x.id === temp.id ? row : x)));
        toast("Policy created");
      } catch (e) {
        setData((l) => (l ?? []).filter((x) => x.id !== temp.id));
        toast(e instanceof Error ? e.message : "Create failed", "err");
      }
    } else if (target) {
      const prev = data;
      setData((l) => (l ?? []).map((x) => (x.id === target.id ? { ...x, ...f } : x)));
      try {
        const row = await api<PolicyDTO>(`/api/policies/${target.id}`, { method: "PATCH", body: f });
        setData((l) => (l ?? []).map((x) => (x.id === row.id ? row : x)));
        toast("Policy saved");
      } catch (e) {
        setData(prev);
        toast(e instanceof Error ? e.message : "Save failed", "err");
      }
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Policy is the conscience" title="Policy broker" sub="The broker — not the capability — has final authority. The strictest matching rule wins: deny beats confirm beats allow.">
        <Button variant="accent" onClick={() => setFormFor("new")}><Icon name="plus" className="h-4 w-4" /> New policy</Button>
      </PageHeader>

      <Card className="mb-6 p-5">
        <h3 className="font-display text-lg font-bold">Built-in floors</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((l) => (
            <div key={l} className="rounded-xl bg-ink/5 p-3">
              <LevelBadge level={l} long />
              <p className="mt-2 text-xs text-ink/60">{LEVEL_META[l].blurb}</p>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-ink/70">
                Default: {l <= 2 ? "allow" : l === 3 ? "confirm" : "confirm + step-up"}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
      {!loading && !error && policies.length === 0 && (
        <EmptyState icon="shield" title="No custom policies" body="Defaults still apply. Add rules to tighten specific capabilities or tools." action={<Button variant="accent" onClick={() => setFormFor("new")}>Create a policy</Button>} />
      )}

      <div className="space-y-3">
        {policies.map((p) => (
          <Card key={p.id} className={cn("pop flex flex-col gap-3 p-4 sm:flex-row sm:items-center", !p.enabled && "opacity-55", p.id < 0 && "opacity-60")}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{p.name}</h3>
                <Badge tone={DECISION_TONE[p.decision]} className="uppercase">{p.decision}</Badge>
              </div>
              {p.description && <p className="mt-0.5 text-sm text-ink/60">{p.description}</p>}
              <p className="mt-1.5 font-mono text-xs text-ink/50">
                <span className="uppercase">{p.matchType}</span> → {targetLabel(p)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                role="switch"
                aria-checked={p.enabled}
                aria-label={`Toggle ${p.name}`}
                onClick={() => toggle(p)}
                disabled={p.id < 0}
                className={cn("relative h-6 w-11 rounded-full transition", p.enabled ? "bg-accent" : "bg-ink/20")}
              >
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", p.enabled ? "left-[22px]" : "left-0.5")} />
              </button>
              <Button variant="ghost" size="sm" disabled={p.id < 0} onClick={() => setFormFor(p)} aria-label="Edit policy"><Icon name="edit" className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" disabled={p.id < 0} className="text-red-700 hover:bg-red-50" onClick={() => remove(p)} aria-label="Delete policy"><Icon name="trash" className="h-4 w-4" /></Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={formFor !== null} onClose={() => setFormFor(null)} title={formFor === "new" ? "New policy" : "Edit policy"}>
        {formFor && (
          <PolicyForm
            caps={caps ?? []}
            editing={formFor !== "new"}
            initial={formFor === "new" ? { name: "", description: "", matchType: "level", matchValue: "3", decision: "confirm" } : { name: formFor.name, description: formFor.description, matchType: formFor.matchType, matchValue: formFor.matchValue, decision: formFor.decision }}
            onCancel={() => setFormFor(null)}
            onSubmit={save}
          />
        )}
      </Modal>
    </div>
  );
}
