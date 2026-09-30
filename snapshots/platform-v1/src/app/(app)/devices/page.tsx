"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Icon, Modal, PageHeader, Skeleton, cn, inputCls, useToast } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import { DiagnosticsPanel, TelephonyPanel } from "@/components/DevicePanels";
import { APPROVAL_LABEL, PROVISIONING_STAGES, PROVISIONING_STEPS, READINESS_META, evaluateDevice, timeAgo, type CheckStatus, type DeviceDTO } from "@/lib/shared";

const STATUS_STYLE: Record<CheckStatus, { dot: string; label: string }> = {
  supported: { dot: "bg-emerald-500", label: "Supported" },
  limited: { dot: "bg-sky-500", label: "Limited" },
  awaiting: { dot: "bg-amber-500", label: "Awaiting approval" },
  unsupported: { dot: "bg-red-500", label: "Unsupported" },
};

const PRESETS: Record<string, Partial<FormState>> = {
  pixel: { manufacturer: "Google", model: "Pixel 9", androidVersion: "16", ramGb: "12" },
  galaxy: { manufacturer: "Samsung", model: "Galaxy S24", androidVersion: "14", ramGb: "8" },
};

type FormState = {
  name: string; manufacturer: string; model: string; androidVersion: string; ramGb: string; securityPatch: string;
  ownership: string; voiceProvider: string; phoneNumber: string; notes: string; approvedNumbers: string;
};

const blank = (): FormState => ({
  name: "", manufacturer: "Google", model: "Pixel 9", androidVersion: "16", ramGb: "12",
  securityPatch: new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10),
  ownership: "personal", voiceProvider: "telnyx", phoneNumber: "", notes: "", approvedNumbers: "",
});

function DeviceForm({ initial, onSubmit, onCancel, editing }: { initial: FormState; onSubmit: (f: FormState) => Promise<void>; onCancel: () => void; editing: boolean }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(f);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Failed");
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {!editing && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setF((s) => ({ ...s, ...PRESETS.pixel }))}>Pixel preset</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setF((s) => ({ ...s, ...PRESETS.galaxy }))}>Galaxy preset</Button>
        </div>
      )}
      <Field label="Device name"><input className={inputCls} value={f.name} onChange={set("name")} placeholder="Field Pixel 9" required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Manufacturer"><input className={inputCls} value={f.manufacturer} onChange={set("manufacturer")} /></Field>
        <Field label="Model"><input className={inputCls} value={f.model} onChange={set("model")} required /></Field>
        <Field label="Android version"><input type="number" className={inputCls} value={f.androidVersion} onChange={set("androidVersion")} min={5} max={20} required /></Field>
        <Field label="RAM (GB)"><input type="number" className={inputCls} value={f.ramGb} onChange={set("ramGb")} min={1} max={64} required /></Field>
        <Field label="Security patch"><input type="date" className={inputCls} value={f.securityPatch} onChange={set("securityPatch")} required /></Field>
        <Field label="Ownership">
          <select className={inputCls} value={f.ownership} onChange={set("ownership")}>
            <option value="personal">Personal</option>
            <option value="managed">Company-managed</option>
          </select>
        </Field>
        <Field label="Voice provider">
          <select className={inputCls} value={f.voiceProvider} onChange={set("voiceProvider")}>
            <option value="telnyx">Telnyx</option>
            <option value="twilio">Twilio</option>
            <option value="sip">Managed SIP</option>
            <option value="none">None</option>
          </select>
        </Field>
        <Field label="Assigned number"><input className={inputCls} value={f.phoneNumber} onChange={set("phoneNumber")} placeholder="+1 (555) 000-0000" /></Field>
      </div>
      <Field label="Approved call numbers" hint="One per line. Voice tokens and the policy broker only allow calls and texts to these numbers.">
        <textarea className={cn(inputCls, "min-h-20 font-mono text-xs")} value={f.approvedNumbers} onChange={set("approvedNumbers")} placeholder={"+1 (214) 555-0100\n+1 (215) 555-0199"} />
      </Field>
      <Field label="Notes"><textarea className={cn(inputCls, "min-h-20")} value={f.notes} onChange={set("notes")} /></Field>
      {err && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="accent" loading={busy}>{editing ? "Save changes" : "Add device"}</Button>
      </div>
    </form>
  );
}

export default function DevicesPage() {
  const { data, setData, loading, error, reload } = useApi<DeviceDTO[]>("/api/devices");
  const toast = useToast();
  const [formFor, setFormFor] = useState<"new" | DeviceDTO | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [filter, setFilter] = useState("all");

  const devices = useMemo(() => data ?? [], [data]);
  const selected = devices.find((d) => d.id === selectedId) ?? null;
  const evaluated = useMemo(() => devices.map((d) => ({ d, c: evaluateDevice(d) })), [devices]);
  const shown = evaluated.filter((x) => filter === "all" || x.c.readiness === filter);

  async function mutate(id: number, optimistic: Partial<DeviceDTO>, body: unknown, okMsg?: string) {
    const prev = data;
    setData((list) => (list ?? []).map((d) => (d.id === id ? { ...d, ...optimistic } : d)));
    try {
      const row = await api<DeviceDTO>(`/api/devices/${id}`, { method: "PATCH", body });
      setData((list) => (list ?? []).map((d) => (d.id === id ? row : d)));
      if (okMsg) toast(okMsg);
    } catch (e) {
      setData(prev);
      toast(e instanceof Error ? e.message : "Update failed", "err");
    }
  }

  async function create(f: FormState) {
    const temp: DeviceDTO = {
      id: -Date.now(), name: f.name, manufacturer: f.manufacturer, model: f.model, androidVersion: Number(f.androidVersion),
      ramGb: Number(f.ramGb), securityPatch: f.securityPatch, ownership: f.ownership, voiceProvider: f.voiceProvider,
      phoneNumber: f.phoneNumber, battery: 100, provisioningStep: 1, approvals: [], lifecycle: "active", notes: f.notes,
      serial: "", keyFingerprint: "", diagnostics: null, sipStatus: "unregistered", rebootedAt: null,
      approvedNumbers: f.approvedNumbers.split(/[\n,;]+/).map((n) => n.trim()).filter(Boolean),
      lastSeenAt: new Date().toISOString(), createdAt: new Date().toISOString(),
    };
    setData((list) => [temp, ...(list ?? [])]);
    setFormFor(null);
    try {
      const row = await api<DeviceDTO>("/api/devices", { method: "POST", body: f });
      setData((list) => (list ?? []).map((d) => (d.id === temp.id ? row : d)));
      toast(`${row.name} added. Open it to start provisioning.`);
    } catch (e) {
      setData((list) => (list ?? []).filter((d) => d.id !== temp.id));
      toast(e instanceof Error ? e.message : "Could not add device", "err");
    }
  }

  async function edit(id: number, f: FormState) {
    const row = await api<DeviceDTO>(`/api/devices/${id}`, { method: "PATCH", body: f });
    setData((list) => (list ?? []).map((d) => (d.id === id ? row : d)));
    setFormFor(null);
    toast("Device updated");
  }

  async function remove(d: DeviceDTO) {
    const prev = data;
    setSelectedId(null);
    setConfirmDelete(false);
    setData((list) => (list ?? []).filter((x) => x.id !== d.id));
    try {
      await api(`/api/devices/${d.id}`, { method: "DELETE" });
      toast(`${d.name} removed`);
    } catch (e) {
      setData(prev);
      toast(e instanceof Error ? e.message : "Delete failed", "err");
    }
  }

  const formInitial = (d: DeviceDTO): FormState => ({
    name: d.name, manufacturer: d.manufacturer, model: d.model, androidVersion: String(d.androidVersion), ramGb: String(d.ramGb),
    securityPatch: d.securityPatch, ownership: d.ownership, voiceProvider: d.voiceProvider, phoneNumber: d.phoneNumber, notes: d.notes,
    approvedNumbers: d.approvedNumbers.join("\n"),
  });

  const selectedCompat = selected ? evaluateDevice(selected) : null;

  return (
    <div>
      <PageHeader eyebrow="AI Phone Studio" title="Devices" sub="Inspect each phone, produce an honest compatibility report, and walk it through the 12-step provisioning wizard.">
        <Button variant="accent" onClick={() => setFormFor("new")}><Icon name="plus" className="h-4 w-4" /> Add device</Button>
      </PageHeader>

      <div className="mb-5 flex flex-wrap gap-2">
        {[["all", "All"], ["ready", "Ready"], ["needs_approval", "Needs approval"], ["provisioning", "Provisioning"], ["unsupported", "Unsupported"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full px-3.5 py-1.5 text-xs font-medium transition", filter === k ? "bg-ink text-paper" : "bg-white/70 text-ink/65 ring-1 ring-ink/10 hover:bg-white")}>
            {l}
            {k !== "all" && <span className="ml-1.5 opacity-60">{evaluated.filter((x) => x.c.readiness === k).length}</span>}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}</div>}

      {!loading && !error && devices.length === 0 && (
        <EmptyState icon="phone" title="No phones yet" body="Connect a supported Android phone to begin provisioning. Android 12+, 6 GB RAM, Google Play-certified." action={<Button variant="accent" onClick={() => setFormFor("new")}>Add your first device</Button>} />
      )}
      {!loading && devices.length > 0 && shown.length === 0 && (
        <EmptyState icon="search" title="No devices match this filter" body="Try another readiness state." action={<Button variant="outline" onClick={() => setFilter("all")}>Clear filter</Button>} />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {shown.map(({ d, c }) => (
          <button key={d.id} onClick={() => { setSelectedId(d.id); setConfirmDelete(false); }} disabled={d.id < 0} className={cn("pop text-left transition hover:-translate-y-0.5", d.id < 0 && "opacity-60")}>
            <Card className="h-full p-5 hover:border-ink/30 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-paper"><Icon name="phone" /></div>
                  <div>
                    <h3 className="font-display text-lg font-bold leading-tight">{d.name}</h3>
                    <p className="text-xs text-ink/55">{d.manufacturer} {d.model} · Android {d.androidVersion} · {d.ramGb} GB</p>
                  </div>
                </div>
                <Badge tone={READINESS_META[c.readiness].tone}>{READINESS_META[c.readiness].label}</Badge>
              </div>
              <p className="mt-4 font-mono text-[11px] uppercase tracking-wider text-ink/55">{c.result}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(d.provisioningStep / 12) * 100}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-ink/50">
                <span>Provisioning {d.provisioningStep}/12</span>
                <span>{d.ownership === "managed" ? "Managed" : "Personal"} · {d.voiceProvider === "none" ? "No voice" : d.voiceProvider}</span>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-3 text-xs text-ink/55">
                <span className="font-mono">{d.phoneNumber || "No number assigned"}</span>
                <span className="flex items-center gap-1"><Icon name="battery" className="h-3.5 w-3.5" />{d.battery}% · {timeAgo(d.lastSeenAt)}</span>
              </div>
            </Card>
          </button>
        ))}
      </div>

      {/* Detail */}
      <Modal open={!!selected} onClose={() => setSelectedId(null)} title={selected?.name ?? ""} wide>
        {selected && selectedCompat && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={READINESS_META[selectedCompat.readiness].tone}>{READINESS_META[selectedCompat.readiness].label}</Badge>
              <span className="text-sm text-ink/60">{selected.manufacturer} {selected.model} · Android {selected.androidVersion} · {selected.ramGb} GB · patch {selected.securityPatch}</span>
            </div>
            {selected.notes && <p className="rounded-lg bg-ink/5 px-3 py-2 text-sm text-ink/70">{selected.notes}</p>}

            <section>
              <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink/55">Compatibility report</h3>
              <div className="overflow-hidden rounded-xl bg-ink font-mono text-[13px] text-paper">
                <ul className="divide-y divide-paper/10">
                  {selectedCompat.checks.map((c) => (
                    <li key={c.label} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_STYLE[c.status].dot)} />
                      <span className="w-44 shrink-0">{c.label}</span>
                      <span className="flex-1 text-paper/60">{c.note ?? STATUS_STYLE[c.status].label}</span>
                      {c.approvalKey && (
                        <Button size="sm" variant="accent" disabled={selected.id < 0} onClick={() => mutate(selected.id, { approvals: [...selected.approvals, c.approvalKey!] }, { action: "approve", key: c.approvalKey }, `${APPROVAL_LABEL[c.approvalKey!]} approved`)}>
                          Approve
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="border-t border-paper/15 bg-paper/5 px-4 py-3 font-bold tracking-wider text-accent">Result: {selectedCompat.result}</div>
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-mono text-[11px] uppercase tracking-wider text-ink/55">Provisioning wizard · {selected.provisioningStep}/12</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" disabled={selected.provisioningStep <= 0} onClick={() => mutate(selected.id, { provisioningStep: selected.provisioningStep - 1 }, { action: "back" })}>Back</Button>
                  <Button size="sm" variant="primary" disabled={selected.provisioningStep >= 12 || selectedCompat.readiness === "unsupported"} onClick={() => mutate(selected.id, { provisioningStep: selected.provisioningStep + 1 }, { action: "advance" }, selected.provisioningStep === 11 ? "Certification complete" : undefined)}>
                    Complete next step
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                {PROVISIONING_STAGES.map((stage) => (
                  <div key={stage.name}>
                    <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-ink/45">{stage.name}</p>
                    <ol className="grid gap-1.5 sm:grid-cols-2">
                      {stage.steps.map((i) => {
                        const s = PROVISIONING_STEPS[i];
                        const done = i < selected.provisioningStep;
                        const current = i === selected.provisioningStep;
                        return (
                          <li key={s} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm", done ? "bg-emerald-50 text-emerald-900" : current ? "bg-accent/10 font-medium text-ink ring-1 ring-accent/40" : "bg-white/60 text-ink/45")}>
                            <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold", done ? "bg-emerald-600 text-white" : current ? "bg-accent text-white" : "bg-ink/10")}>
                              {done ? <Icon name="check" className="h-3 w-3" /> : i + 1}
                            </span>
                            {s}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ))}
              </div>
              {selectedCompat.readiness === "unsupported" && <p className="mt-2 text-xs text-red-700">This phone is below the Android 12 / 6 GB floor, so provisioning is disabled.</p>}
            </section>

            <DiagnosticsPanel device={selected} />
            <TelephonyPanel device={selected} onChanged={reload} />

            <section className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setFormFor(selected)}><Icon name="edit" className="h-3.5 w-3.5" /> Edit</Button>
                {selected.provisioningStep >= 12 && selected.lifecycle === "active" && (
                  <Button variant="outline" size="sm" onClick={() => mutate(selected.id, { rebootedAt: new Date().toISOString(), sipStatus: "unregistered" }, { action: "reboot" }, "Rebooted into the launcher. Re-register telephony.")}>Simulate reboot</Button>
                )}
                {selected.lifecycle === "active" ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => mutate(selected.id, { lifecycle: "lost" }, { action: "lifecycle", lifecycle: "lost" }, "Lost-device mode on. Tokens suspended.")}>Mark lost</Button>
                    <Button variant="outline" size="sm" onClick={() => mutate(selected.id, { lifecycle: "revoked" }, { action: "lifecycle", lifecycle: "revoked" }, "Device revoked")}>Revoke</Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => mutate(selected.id, { lifecycle: "active" }, { action: "lifecycle", lifecycle: "active" }, "Device restored")}>Restore device</Button>
                )}
              </div>
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-700">Delete this device?</span>
                  <Button size="sm" variant="danger" onClick={() => remove(selected)}>Yes, delete</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>No</Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50" onClick={() => setConfirmDelete(true)}><Icon name="trash" className="h-3.5 w-3.5" /> Delete</Button>
              )}
            </section>
          </div>
        )}
      </Modal>

      {/* Create / edit */}
      <Modal open={formFor !== null} onClose={() => setFormFor(null)} title={formFor === "new" ? "Add a device" : "Edit device"}>
        {formFor && (
          <DeviceForm
            editing={formFor !== "new"}
            initial={formFor === "new" ? blank() : formInitial(formFor)}
            onCancel={() => setFormFor(null)}
            onSubmit={(f) => (formFor === "new" ? create(f) : edit(formFor.id, f))}
          />
        )}
      </Modal>
    </div>
  );
}
