"use client";

import { useState } from "react";
import type { Capability } from "@/db/schema";
import { api, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Select, Textarea, Toggle, cx, levelTone, timeAgo, useToast } from "@/components/ui";
import { EXECUTOR_LABEL, LEVEL_LABEL } from "@/lib/engine";
import { ImportManifestModal, InvokeConsole, ToolRow } from "./mcp-panels";

type FormState = { name: string; publisher: string; version: string; category: string; executor: string; level: number; description: string; can: string; cannot: string; dataAccess: string; permissions: string; networkDestinations: string; verified: boolean };
const empty: FormState = { name: "", publisher: "", version: "1.0.0", category: "Productivity", executor: "mcp", level: 2, description: "", can: "", cannot: "", dataAccess: "", permissions: "", networkDestinations: "", verified: false };

export function CapabilitiesClient({ initial, devices = [] }: { initial: Capability[]; devices?: { id: number; name: string }[] }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState<"all" | "installed" | "available" | "revoked">("all");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Capability | null>(null);
  const [editing, setEditing] = useState<Capability | null | "new">(null);
  const [deleting, setDeleting] = useState<Capability | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [invoking, setInvoking] = useState<Capability | null>(null);

  const visible = items
    .filter((c) => tab === "all" || c.status === tab)
    .filter((c) => !query || `${c.name} ${c.publisher} ${c.category} ${c.description}`.toLowerCase().includes(query.toLowerCase()));

  function openNew() { setForm(empty); setEditing("new"); }
  function openEdit(c: Capability) {
    setForm({ name: c.name, publisher: c.publisher, version: c.version, category: c.category, executor: c.executor, level: c.level, description: c.description, can: c.can.join("\n"), cannot: c.cannot.join("\n"), dataAccess: c.dataAccess.join("\n"), permissions: c.permissions.join("\n"), networkDestinations: c.networkDestinations.join("\n"), verified: c.verified });
    setDetail(null);
    setEditing(c);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing === "new") {
        const created = await api<Capability>("/api/capabilities", { method: "POST", json: form });
        setItems((s) => [...s, created].sort((a, b) => a.name.localeCompare(b.name)));
        toast.push(`${created.name} published to your catalog`, "success");
      } else if (editing) {
        const updated = await api<Capability>(`/api/capabilities/${editing.id}`, { method: "PATCH", json: form });
        setItems((s) => s.map((c) => (c.id === updated.id ? updated : c)));
        toast.push("Capability updated", "success");
      }
      setEditing(null);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function action(c: Capability, act: "install" | "revoke" | "health") {
    const prev = items;
    const optimistic: Partial<Capability> = act === "install" ? { status: "installed", healthy: true, installedAt: new Date() } : act === "revoke" ? { status: "revoked" } : { healthy: true };
    setItems((s) => s.map((x) => (x.id === c.id ? { ...x, ...optimistic } : x)));
    if (detail?.id === c.id) setDetail({ ...c, ...optimistic });
    try {
      const updated = await api<Capability>(`/api/capabilities/${c.id}`, { method: "PATCH", json: { action: act } });
      setItems((s) => s.map((x) => (x.id === updated.id ? updated : x)));
      if (detail?.id === c.id) setDetail(updated);
      toast.push(act === "install" ? `${c.name} connected — policy broker has final authority` : act === "revoke" ? `${c.name} revoked. Tokens invalidated.` : "Health check passed", "success");
    } catch (err) {
      setItems(prev);
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  async function remove() {
    if (!deleting) return;
    const prev = items;
    const t = deleting;
    setItems((s) => s.filter((c) => c.id !== t.id));
    setDeleting(null);
    setDetail(null);
    try {
      await api(`/api/capabilities/${t.id}`, { method: "DELETE" });
      toast.push("Capability removed from catalog", "success");
    } catch (err) {
      setItems(prev);
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  const counts = { all: items.length, installed: items.filter((c) => c.status === "installed").length, available: items.filter((c) => c.status === "available").length, revoked: items.filter((c) => c.status === "revoked").length };

  return (
    <div>
      <PageHeader eyebrow="Capability marketplace" title="Marketplace" description="Capabilities, not unrestricted code. Each one declares what it can do, what it cannot, and what data it touches." actions={<><Button variant="secondary" onClick={() => setImporting(true)}>⬆ Import .aipc manifest</Button><Button onClick={openNew}>+ Publish capability</Button></>} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["all", "installed", "available", "revoked"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cx("rounded-full border px-3 py-1 text-xs capitalize", tab === t ? "border-lime-400/50 bg-lime-400/10 text-lime-200" : "border-zinc-800 text-zinc-400 hover:text-white")}>
              {t} <span className="text-zinc-500">{counts[t]}</span>
            </button>
          ))}
        </div>
        <Input placeholder="Search capabilities…" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:w-64" />
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="✦" title="No capabilities here" description={items.length === 0 ? "Publish your first capability or connect a verified MCP server." : "Nothing matches your filter or search."} action={items.length === 0 ? <Button onClick={openNew}>Publish capability</Button> : undefined} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => (
            <Card key={c.id} className={cx("flex flex-col p-5", c.status === "revoked" && "opacity-70")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-white">{c.name}</h3>
                  <p className="text-xs text-zinc-500">{c.publisher} · v{c.version}{c.verified && <span className="ml-1 text-lime-300">✓ verified</span>}</p>
                </div>
                <Badge tone={levelTone(c.level)}>L{c.level}</Badge>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-zinc-400">{c.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge>{EXECUTOR_LABEL[c.executor]}</Badge>
                <Badge tone="neutral">{c.category}</Badge>
                {c.status === "installed" && <Badge tone={c.healthy ? "emerald" : "rose"}>{c.healthy ? "healthy" : "unhealthy"}</Badge>}
                {c.status === "revoked" && <Badge tone="rose">revoked</Badge>}
              </div>
              <div className="mt-auto flex gap-2 border-t border-zinc-800 pt-4">
                {c.status === "installed" ? (
                  <Button size="sm" variant="ghost" onClick={() => action(c, "revoke")}>Revoke</Button>
                ) : (
                  <Button size="sm" onClick={() => action(c, "install")}>{c.status === "revoked" ? "Reconnect" : "Connect"}</Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => setDetail(c)}>View policy</Button>
                {c.status === "installed" && c.executor === "mcp" && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setInvoking(c)}>Invoke ▸</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.name.toUpperCase()} CAPABILITY` : ""} wide>
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={levelTone(detail.level)}>Level {detail.level} — {LEVEL_LABEL[detail.level]}</Badge>
              <Badge>{EXECUTOR_LABEL[detail.executor]}</Badge>
              <Badge tone={detail.status === "installed" ? "emerald" : detail.status === "revoked" ? "rose" : "neutral"}>{detail.status}</Badge>
              {detail.verified ? <Badge tone="lime">Verified publisher</Badge> : <Badge tone="amber">Unverified publisher</Badge>}
              {detail.installedAt && <span className="text-xs text-zinc-500">connected {timeAgo(detail.installedAt)}</span>}
            </div>
            <p className="text-sm text-zinc-300">{detail.description}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <ListBlock title="Can" items={detail.can} tone="text-lime-300" />
              <ListBlock title="Cannot" items={detail.cannot} tone="text-rose-300" />
              <ListBlock title="Data access" items={detail.dataAccess} tone="text-sky-300" />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Tools</p>
              <div className="space-y-2">
                {detail.tools.map((t) => <ToolRow key={t.name} t={t} />)}
              </div>
            </div>
            {detail.manifestVerification && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Manifest verification · MCP {detail.manifestVerification.mcpVersion}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="lime">schema ok</Badge>
                  <Badge tone={detail.manifestVerification.publisherSignature === "valid" ? "lime" : detail.manifestVerification.publisherSignature === "unsigned" ? "amber" : "rose"}>signature {detail.manifestVerification.publisherSignature}</Badge>
                  <Badge tone={detail.manifestVerification.cimdResolved ? "lime" : "rose"}>CIMD {detail.manifestVerification.cimdResolved ? "resolved" : "missing"}</Badge>
                  {detail.manifestVerification.fingerprint && <span className="mono text-[11px] text-zinc-500">{detail.manifestVerification.fingerprint}</span>}
                </div>
                {detail.cimdUri && <p className="mono mt-2 text-[11px] text-zinc-500">{detail.cimdUri}</p>}
                {detail.endpoint && <p className="mono text-[11px] text-zinc-500">{detail.endpoint}</p>}
                {detail.manifestVerification.issues.length > 0 && <ul className="mt-2 space-y-0.5 text-[11px] text-amber-200">{detail.manifestVerification.issues.map((i, n) => <li key={n}>• {i}</li>)}</ul>}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <ListBlock title="Permissions" items={detail.permissions} mono />
              <ListBlock title="Network destinations" items={detail.networkDestinations} mono />
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-zinc-800 pt-4">
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => openEdit(detail)}>Edit</Button>
                <Button variant="ghost" className="text-rose-300" onClick={() => setDeleting(detail)}>Delete</Button>
              </div>
              <div className="flex gap-2">
                {detail.status === "installed" && detail.executor === "mcp" && <Button variant="secondary" onClick={() => { setInvoking(detail); setDetail(null); }}>Invoke tool</Button>}
                {detail.status === "installed" && !detail.healthy && <Button variant="secondary" onClick={() => action(detail, "health")}>Run health check</Button>}
                {detail.status === "installed" ? <Button variant="danger" onClick={() => action(detail, "revoke")}>Revoke access</Button> : <Button onClick={() => action(detail, "install")}>Connect</Button>}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Publish a capability" : "Edit capability"} wide>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="QuickBooks" /></Field>
            <Field label="Publisher"><Input required value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} placeholder="Intuit" /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Version"><Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} /></Field>
            <Field label="Category"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
            <Field label="Executor">
              <Select value={form.executor} onChange={(e) => setForm({ ...form, executor: e.target.value })}>
                {Object.entries(EXECUTOR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Safety level">
              <Select value={form.level} onChange={(e) => setForm({ ...form, level: Number(e.target.value) })}>
                {[1, 2, 3, 4].map((l) => <option key={l} value={l}>L{l} — {LEVEL_LABEL[l]}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Can (one per line)"><Textarea value={form.can} onChange={(e) => setForm({ ...form, can: e.target.value })} /></Field>
            <Field label="Cannot (one per line)"><Textarea value={form.cannot} onChange={(e) => setForm({ ...form, cannot: e.target.value })} /></Field>
            <Field label="Data access (one per line)"><Textarea value={form.dataAccess} onChange={(e) => setForm({ ...form, dataAccess: e.target.value })} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Permissions (one per line)"><Textarea value={form.permissions} onChange={(e) => setForm({ ...form, permissions: e.target.value })} className="mono" /></Field>
            <Field label="Network destinations (one per line)"><Textarea value={form.networkDestinations} onChange={(e) => setForm({ ...form, networkDestinations: e.target.value })} className="mono" /></Field>
          </div>
          <Toggle checked={form.verified} onChange={(v) => setForm({ ...form, verified: v })} label="Publisher identity verified (signed package / verified endpoint)" />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" loading={busy}>{editing === "new" ? "Publish" : "Save changes"}</Button>
          </div>
        </form>
      </Modal>

      <ImportManifestModal open={importing} onClose={() => setImporting(false)} onImported={(c) => setItems((s) => (s.some((x) => x.id === c.id) ? s.map((x) => (x.id === c.id ? c : x)) : [...s, c].sort((a, b) => a.name.localeCompare(b.name))))} />
      <InvokeConsole cap={invoking} devices={devices} open={!!invoking} onClose={() => setInvoking(null)} />

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} title="Delete capability?" message={`${deleting?.name ?? "This capability"} will be removed from your catalog and can no longer be requested by the planner.`} />
    </div>
  );
}

function ListBlock({ title, items, tone, mono }: { title: string; items: string[]; tone?: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <p className={cx("mb-2 text-xs font-semibold uppercase tracking-wide", tone ?? "text-zinc-400")}>{title}</p>
      {items.length === 0 ? <p className="text-xs text-zinc-600">None declared</p> : (
        <ul className={cx("space-y-1 text-sm text-zinc-300", mono && "mono text-xs")}>
          {items.map((i) => <li key={i}>• {i}</li>)}
        </ul>
      )}
    </div>
  );
}
