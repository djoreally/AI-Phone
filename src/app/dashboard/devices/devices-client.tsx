"use client";

import { useState } from "react";
import Link from "next/link";
import type { Device } from "@/db/schema";
import { api, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Select, Toggle, cx, timeAgo, useToast } from "@/components/ui";
import { labelProvider, summarizeCompatibility } from "@/lib/engine";

type FormState = {
  name: string; manufacturer: string; model: string; androidVersion: number; ramGb: number; securityPatch: string;
  playCertified: boolean; enrollmentMode: string; voiceProvider: string; assignedNumber: string;
};
const empty: FormState = { name: "", manufacturer: "Google", model: "", androidVersion: 15, ramGb: 8, securityPatch: "2026-01-05", playCertified: true, enrollmentMode: "personal", voiceProvider: "twilio", assignedNumber: "" };

const statusTone = (s: string) => (s === "ready" ? "lime" : s === "needs_approval" ? "amber" : s === "blocked" ? "rose" : s === "revoked" ? "neutral" : "sky") as "lime" | "amber" | "rose" | "neutral" | "sky";
const checkTone = (s: string) => (s === "supported" ? "text-lime-300" : s === "limited" ? "text-sky-300" : s === "awaiting" ? "text-amber-300" : "text-rose-300");

export function DevicesClient({ initial }: { initial: Device[] }) {
  const toast = useToast();
  const [items, setItems] = useState<Device[]>(initial);
  const [editing, setEditing] = useState<Device | null | "new">(null);
  const [report, setReport] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState<Device | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");

  function openNew() {
    setForm(empty);
    setEditing("new");
  }
  function openEdit(d: Device) {
    setForm({ name: d.name, manufacturer: d.manufacturer, model: d.model, androidVersion: d.androidVersion, ramGb: d.ramGb, securityPatch: d.securityPatch, playCertified: d.playCertified, enrollmentMode: d.enrollmentMode, voiceProvider: d.voiceProvider, assignedNumber: d.assignedNumber ?? "" });
    setEditing(d);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing === "new") {
        const created = await api<Device>("/api/devices", { method: "POST", json: form });
        setItems((s) => [created, ...s]);
        toast.push(`${created.name} enrolled — ${summarizeCompatibility(created)}`, "success");
        setEditing(null);
        setReport(created);
      } else if (editing) {
        const prev = items;
        setItems((s) => s.map((d) => (d.id === editing.id ? { ...d, ...form, assignedNumber: form.assignedNumber || null } : d)));
        setEditing(null);
        try {
          const updated = await api<Device>(`/api/devices/${editing.id}`, { method: "PATCH", json: form });
          setItems((s) => s.map((d) => (d.id === updated.id ? updated : d)));
          toast.push("Device updated and re-certified", "success");
        } catch (err) {
          setItems(prev);
          throw err;
        }
      }
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function action(d: Device, act: "approve" | "revoke" | "recertify") {
    const prev = items;
    const optimistic: Partial<Device> = act === "approve" ? { status: "ready" } : act === "revoke" ? { status: "revoked" } : { lastSeenAt: new Date() };
    setItems((s) => s.map((x) => (x.id === d.id ? { ...x, ...optimistic } : x)));
    try {
      const updated = await api<Device>(`/api/devices/${d.id}`, { method: "PATCH", json: { action: act } });
      setItems((s) => s.map((x) => (x.id === updated.id ? updated : x)));
      if (report?.id === updated.id) setReport(updated);
      toast.push(act === "approve" ? "Approvals recorded — device is ready" : act === "revoke" ? "Device access revoked" : "Certification refreshed", "success");
    } catch (err) {
      setItems(prev);
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  async function remove() {
    if (!deleting) return;
    const prev = items;
    const target = deleting;
    setItems((s) => s.filter((d) => d.id !== target.id));
    setDeleting(null);
    try {
      await api(`/api/devices/${target.id}`, { method: "DELETE" });
      toast.push("Device removed", "success");
    } catch (err) {
      setItems(prev);
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  const visible = filter === "all" ? items : items.filter((d) => d.status === filter);
  const counts = { all: items.length, ready: items.filter((d) => d.status === "ready").length, needs_approval: items.filter((d) => d.status === "needs_approval").length, blocked: items.filter((d) => d.status === "blocked").length, revoked: items.filter((d) => d.status === "revoked").length };

  return (
    <div>
      <PageHeader eyebrow="Provisioning studio" title="Devices" description="Enroll a phone, inspect its compatibility report, approve required roles, and certify it as a robot." actions={<Button onClick={openNew}>+ Enroll device</Button>} />

      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "ready", "needs_approval", "blocked", "revoked"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cx("rounded-full border px-3 py-1 text-xs capitalize transition-colors", filter === f ? "border-lime-400/50 bg-lime-400/10 text-lime-200" : "border-zinc-800 text-zinc-400 hover:text-white")}>
            {f.replace("_", " ")} <span className="text-zinc-500">{counts[f]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="▭" title={items.length === 0 ? "No devices enrolled" : "No devices match this filter"} description={items.length === 0 ? "Connect a phone or scan an enrollment QR. Studio will inspect it and produce a compatibility report." : "Try another status filter."} action={items.length === 0 ? <Button onClick={openNew}>Enroll your first device</Button> : undefined} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map((d) => (
            <Card key={d.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-white">{d.name}</h3>
                  <p className="text-sm text-zinc-400">{d.manufacturer} {d.model} · Android {d.androidVersion} · {d.ramGb} GB</p>
                </div>
                <Badge tone={statusTone(d.status)}>{d.status.replace("_", " ")}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="sky">{labelProvider(d.voiceProvider)}</Badge>
                <Badge>{d.enrollmentMode}</Badge>
                {d.assignedNumber && <Badge className="mono normal-case tracking-normal">{d.assignedNumber}</Badge>}
              </div>
              <p className="mono mt-3 text-xs text-zinc-500">Result: <span className={d.status === "blocked" ? "text-rose-300" : d.status === "needs_approval" ? "text-amber-300" : "text-lime-300"}>{summarizeCompatibility(d)}</span></p>
              <p className="mt-1 text-xs text-zinc-500">Last seen {timeAgo(d.lastSeenAt)} · patch {d.securityPatch}</p>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
                <Button size="sm" variant="secondary" onClick={() => setReport(d)}>Report</Button>
                {d.status !== "revoked" && <Link href={`/dashboard/studio?device=${d.id}`} className="inline-flex h-8 items-center rounded-lg border border-lime-400/30 bg-lime-400/10 px-3 text-xs font-medium text-lime-200 hover:bg-lime-400/20">Provision</Link>}
                {d.status === "needs_approval" && <Button size="sm" variant="success" onClick={() => action(d, "approve")}>Approve roles</Button>}
                {d.status === "revoked" && <Button size="sm" variant="success" onClick={() => action(d, "recertify")}>Re-certify</Button>}
                <Button size="sm" variant="ghost" onClick={() => openEdit(d)}>Edit</Button>
                {d.status !== "revoked" && <Button size="sm" variant="ghost" onClick={() => action(d, "revoke")}>Revoke</Button>}
                <Button size="sm" variant="ghost" className="ml-auto text-rose-300" onClick={() => setDeleting(d)}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Enroll a device" : "Edit device"}>
        <form onSubmit={save} className="space-y-4">
          <Field label="Device name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tyreese's Pixel 9" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Manufacturer">
              <Select value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}>
                {["Google", "Samsung", "OnePlus", "Motorola", "Xiaomi", "Nothing", "Other"].map((m) => <option key={m}>{m}</option>)}
              </Select>
            </Field>
            <Field label="Model"><Input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Pixel 9" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Android"><Input type="number" min={8} max={20} value={form.androidVersion} onChange={(e) => setForm({ ...form, androidVersion: Number(e.target.value) })} /></Field>
            <Field label="RAM (GB)"><Input type="number" min={1} max={32} value={form.ramGb} onChange={(e) => setForm({ ...form, ramGb: Number(e.target.value) })} /></Field>
            <Field label="Patch"><Input type="date" value={form.securityPatch} onChange={(e) => setForm({ ...form, securityPatch: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Enrollment">
              <Select value={form.enrollmentMode} onChange={(e) => setForm({ ...form, enrollmentMode: e.target.value })}>
                <option value="personal">Personal phone</option>
                <option value="managed">Company-owned (Android Enterprise)</option>
              </Select>
            </Field>
            <Field label="Voice provider">
              <Select value={form.voiceProvider} onChange={(e) => setForm({ ...form, voiceProvider: e.target.value })}>
                <option value="twilio">Twilio Voice</option>
                <option value="telnyx">Telnyx Voice</option>
                <option value="sip">Managed SIP / PBX</option>
                <option value="sim">SIM / eSIM</option>
              </Select>
            </Field>
          </div>
          <Field label="Assigned number" hint="Short-lived device-scoped tokens are issued; no master credentials are stored on the handset."><Input value={form.assignedNumber} onChange={(e) => setForm({ ...form, assignedNumber: e.target.value })} placeholder="+1 (415) 555-0100" /></Field>
          <Toggle checked={form.playCertified} onChange={(v) => setForm({ ...form, playCertified: v })} label="Google Play-certified build" />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" loading={busy}>{editing === "new" ? "Run compatibility check" : "Save & re-certify"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!report} onClose={() => setReport(null)} title="Compatibility report">
        {report && (
          <div>
            <div className="mono rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm leading-7">
              <p className="text-zinc-400">Device: <span className="text-zinc-100">{report.manufacturer} {report.model}</span></p>
              <p className="text-zinc-400">Android: <span className="text-zinc-100">{report.androidVersion}</span></p>
              {report.compatibility.map((c) => (
                <p key={c.label} className="text-zinc-400">
                  {c.label}: <span className={checkTone(c.status)}>{c.status === "supported" ? "Supported" : c.status === "limited" ? "Limited" : c.status === "awaiting" ? "Awaiting approval" : "Unsupported"}</span>
                  {c.note && <span className="text-zinc-600"> — {c.note}</span>}
                </p>
              ))}
              <p className="mt-3 border-t border-zinc-800 pt-3 text-zinc-400">Result: <span className={report.status === "blocked" ? "font-semibold text-rose-300" : report.status === "needs_approval" ? "font-semibold text-amber-300" : "font-semibold text-lime-300"}>{summarizeCompatibility(report)}</span></p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              {report.status === "needs_approval" && <Button variant="success" onClick={() => action(report, "approve")}>Approve required roles</Button>}
              <Button variant="secondary" onClick={() => action(report, "recertify")}>Re-run check</Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={remove} title="Remove device?" message={`${deleting?.name ?? "This device"} will be removed from your fleet. Its receipts remain in the timeline.`} />
    </div>
  );
}
