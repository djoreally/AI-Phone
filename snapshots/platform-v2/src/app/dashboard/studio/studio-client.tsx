"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Device, ProvisioningRun, VoiceToken } from "@/db/schema";
import { api, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, cx, timeAgo, useToast } from "@/components/ui";
import { labelProvider } from "@/lib/engine";

const stepTone = (s: string) => (s === "passed" ? "lime" : s === "warning" ? "amber" : s === "failed" ? "rose" : s === "running" ? "sky" : "neutral") as "lime" | "amber" | "rose" | "sky" | "neutral";

export function StudioClient({ devices, runs: initialRuns, tokens: initialTokens }: { devices: Device[]; runs: ProvisioningRun[]; tokens: VoiceToken[] }) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const [runs, setRuns] = useState(initialRuns);
  const [tokens, setTokens] = useState(initialTokens);
  const [deviceId, setDeviceId] = useState<number | "">(Number(params.get("device")) || devices[0]?.id || "");
  const [transport, setTransport] = useState("usb_adb");
  const [active, setActive] = useState<ProvisioningRun | null>(initialRuns.find((r) => r.status === "running") ?? null);
  const [auto, setAuto] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [cert, setCert] = useState<ProvisioningRun | null>(null);
  const [tokenForm, setTokenForm] = useState({ deviceId: devices[0]?.id ?? ("" as number | ""), scope: "outbound", allowedNumber: "+1 (215) 555-0199" });
  const [minting, setMinting] = useState(false);
  const [showToken, setShowToken] = useState<VoiceToken | null>(null);
  const [now, setNow] = useState(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const device = (id: number | null | "") => devices.find((d) => d.id === id);

  async function start() {
    if (!deviceId) return toast.push("Enroll a device first", "error");
    try {
      const run = await api<ProvisioningRun>("/api/provisioning", { method: "POST", json: { deviceId, transport } });
      setRuns((s) => [run, ...s]);
      setActive(run);
      setAuto(true);
      toast.push(`Handshake initiated with ${device(deviceId)?.name}`, "info");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  async function advance(run: ProvisioningRun) {
    if (advancing) return;
    setAdvancing(true);
    // optimistic: mark current step running
    const optimistic = { ...run, steps: run.steps.map((s, i) => (i === run.currentStep ? { ...s, status: "running" as const } : s)) };
    setActive(optimistic);
    try {
      await new Promise((r) => setTimeout(r, 700));
      const updated = await api<ProvisioningRun>(`/api/provisioning/${run.id}`, { method: "POST" });
      setActive(updated);
      setRuns((s) => s.map((r) => (r.id === updated.id ? updated : r)));
      if (updated.status !== "running") {
        setAuto(false);
        toast.push(updated.status === "certified" ? "Device certified — readiness certificate issued" : "Provisioning failed — see pipeline log", updated.status === "certified" ? "success" : "error");
        router.refresh();
      }
    } catch (err) {
      setActive(run);
      setAuto(false);
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setAdvancing(false);
    }
  }

  useEffect(() => {
    if (auto && active && active.status === "running" && !advancing) {
      timer.current = setTimeout(() => advance(active), 500);
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, active, advancing]);

  async function removeRun(run: ProvisioningRun) {
    const prev = runs;
    setRuns((s) => s.filter((r) => r.id !== run.id));
    if (active?.id === run.id) setActive(null);
    try {
      await api(`/api/provisioning/${run.id}`, { method: "DELETE" });
    } catch (err) {
      setRuns(prev);
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  async function mint(e: React.FormEvent) {
    e.preventDefault();
    setMinting(true);
    try {
      const t = await api<VoiceToken>("/api/voice-tokens", { method: "POST", json: tokenForm });
      setTokens((s) => [t, ...s]);
      setShowToken(t);
      toast.push("15-minute device-scoped token issued", "success");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setMinting(false);
    }
  }

  async function revokeToken(t: VoiceToken) {
    const prev = tokens;
    setTokens((s) => s.map((x) => (x.id === t.id ? { ...x, revoked: true } : x)));
    try {
      await api(`/api/voice-tokens/${t.id}`, { method: "DELETE" });
      toast.push("Token revoked at the auth gateway", "success");
    } catch (err) {
      setTokens(prev);
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  const ttl = (t: VoiceToken) => Math.max(0, Math.floor((new Date(t.expiresAt).getTime() - now) / 1000));
  const decodeClaims = (t: string) => { try { return JSON.stringify(JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))), null, 2); } catch { return "—"; } };

  return (
    <div>
      <PageHeader eyebrow="Phase 1 · Desktop provisioning" title="AI Phone Studio" description="Turn a stock Pixel into an AI Phone Runtime: handshake, diagnostics, DPC, payload, key vaulting, self-test — then a signed readiness certificate." />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Wizard */}
        <div className="space-y-6 lg:col-span-3">
          <Card className="p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Provision target device</h2>
            {devices.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No devices enrolled. Add one under Devices first.</p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <Field label="Target">
                  <Select value={deviceId} onChange={(e) => setDeviceId(Number(e.target.value))}>
                    {devices.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.manufacturer} {d.model}</option>)}
                  </Select>
                </Field>
                <Field label="Transport">
                  <Select value={transport} onChange={(e) => setTransport(e.target.value)}>
                    <option value="usb_adb">USB debugging (ADB)</option>
                    <option value="qr_enrollment">QR enrollment (local network)</option>
                  </Select>
                </Field>
                <Button onClick={start} disabled={!!(active && active.status === "running")}>Provision</Button>
              </div>
            )}
          </Card>

          {active ? (
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Pipeline · {device(active.deviceId)?.name ?? "device"}</h2>
                  <p className="mono mt-1 text-[11px] text-zinc-500">run #{active.id} · {active.transport} · key {active.keyFingerprint}</p>
                </div>
                <Badge tone={active.status === "certified" ? "lime" : active.status === "failed" ? "rose" : "sky"}>{active.status}</Badge>
              </div>
              <ol className="mt-4 space-y-2">
                {active.steps.map((s, i) => (
                  <li key={s.key} className={cx("rounded-xl border p-3", s.status === "running" ? "border-sky-400/40 bg-sky-400/5" : s.status === "passed" ? "border-lime-400/20" : s.status === "warning" ? "border-amber-400/30 bg-amber-400/5" : s.status === "failed" ? "border-rose-500/30 bg-rose-500/5" : "border-zinc-800 opacity-70")}>
                    <div className="flex items-start gap-3">
                      <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", s.status === "passed" ? "bg-lime-400 text-zinc-950" : s.status === "warning" ? "bg-amber-400 text-zinc-950" : s.status === "failed" ? "bg-rose-500 text-white" : s.status === "running" ? "bg-sky-400 text-zinc-950 animate-pulse" : "bg-zinc-800 text-zinc-400")}>
                        {s.status === "passed" ? "✓" : s.status === "failed" ? "✕" : s.status === "warning" ? "!" : i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-white">{s.title}</p>
                          <Badge tone={stepTone(s.status)}>{s.status}</Badge>
                        </div>
                        <p className="text-xs text-zinc-500">{s.detail}</p>
                        {s.log.length > 0 && (
                          <pre className="mono mt-2 overflow-x-auto rounded-lg bg-zinc-950 p-2 text-[11px] leading-5 text-zinc-400">{s.log.map((l) => `$ ${l}`).join("\n")}</pre>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-zinc-800 pt-4">
                {active.status === "running" ? (
                  <>
                    <Button variant="ghost" onClick={() => setAuto((a) => !a)}>{auto ? "Pause" : "Auto-run"}</Button>
                    <Button onClick={() => advance(active)} loading={advancing}>Run next stage</Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" className="text-rose-300" onClick={() => removeRun(active)}>Discard run</Button>
                    <Button variant="secondary" onClick={() => setCert(active)}>View readiness certificate</Button>
                    <Button onClick={() => setActive(null)}>Provision another</Button>
                  </>
                )}
              </div>
            </Card>
          ) : (
            <EmptyState icon="⟲" title="No active provisioning run" description="Pick a target device and click Provision. The wizard mirrors the six-stage Studio pipeline and ends with a signed readiness certificate." />
          )}

          {runs.length > 0 && (
            <Card className="divide-y divide-zinc-800">
              <div className="p-4"><h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Run history</h2></div>
              {runs.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-100">{device(r.deviceId)?.name ?? `Device #${r.deviceId}`}</p>
                    <p className="text-xs text-zinc-500">{r.steps.filter((s) => s.status === "passed" || s.status === "warning").length}/{r.steps.length} stages · {timeAgo(r.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={r.status === "certified" ? "lime" : r.status === "failed" ? "rose" : "sky"}>{r.status}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => setActive(r)}>Open</Button>
                    <Button size="sm" variant="ghost" className="text-rose-300" onClick={() => removeRun(r)}>Delete</Button>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* Token vault */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Telephony auth gateway</h2>
            <p className="mt-1 text-xs text-zinc-500">Zero permanent secrets on the handset. Tokens are 15-minute, device-scoped JWTs restricted to one number or the inbound listener.</p>
            <form onSubmit={mint} className="mt-4 space-y-3">
              <Field label="Handset">
                <Select value={tokenForm.deviceId} onChange={(e) => setTokenForm({ ...tokenForm, deviceId: Number(e.target.value) })}>
                  {devices.map((d) => <option key={d.id} value={d.id}>{d.name} · {labelProvider(d.voiceProvider)}</option>)}
                </Select>
              </Field>
              <Field label="Scope">
                <Select value={tokenForm.scope} onChange={(e) => setTokenForm({ ...tokenForm, scope: e.target.value })}>
                  <option value="outbound">Outbound call (single approved number)</option>
                  <option value="inbound_listener">Inbound listener standby</option>
                </Select>
              </Field>
              {tokenForm.scope === "outbound" && (
                <Field label="Approved number"><Input value={tokenForm.allowedNumber} onChange={(e) => setTokenForm({ ...tokenForm, allowedNumber: e.target.value })} className="mono" /></Field>
              )}
              <Button type="submit" className="w-full" loading={minting} disabled={devices.length === 0}>Request short-lived token</Button>
            </form>
          </Card>

          <Card className="divide-y divide-zinc-800">
            <div className="p-4"><h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Issued tokens</h2></div>
            {tokens.length === 0 ? (
              <p className="p-4 text-sm text-zinc-500">No tokens issued yet.</p>
            ) : tokens.slice(0, 12).map((t) => {
              const s = ttl(t);
              const expired = s === 0;
              return (
                <div key={t.id} className={cx("p-4", (expired || t.revoked) && "opacity-60")}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="mono truncate text-xs text-zinc-200">{t.jti}</p>
                      <p className="text-xs text-zinc-500">{device(t.deviceId)?.name ?? "device"} · {labelProvider(t.provider)} · {t.scope === "outbound" ? `→ ${t.allowedNumber}` : "inbound standby"}</p>
                    </div>
                    <Badge tone={t.revoked ? "rose" : expired ? "neutral" : "lime"}>{t.revoked ? "revoked" : expired ? "expired" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}</Badge>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setShowToken(t)}>Inspect</Button>
                    {!t.revoked && !expired && <Button size="sm" variant="ghost" className="text-rose-300" onClick={() => revokeToken(t)}>Revoke</Button>}
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      </div>

      <Modal open={!!cert} onClose={() => setCert(null)} title="Readiness certificate" wide>
        {cert && <pre className="mono max-h-[60vh] overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs leading-5 text-lime-200">{cert.certificate}</pre>}
      </Modal>

      <Modal open={!!showToken} onClose={() => setShowToken(null)} title="Device-scoped token">
        {showToken && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Claims</p>
            <pre className="mono overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs leading-5 text-zinc-300">{decodeClaims(showToken.token)}</pre>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Compact JWT</p>
            <p className="mono break-all rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-[10px] leading-4 text-zinc-500">{showToken.token}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
