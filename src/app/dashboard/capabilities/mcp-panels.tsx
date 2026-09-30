"use client";

import { useEffect, useState } from "react";
import type { Capability, CapabilityTool, Receipt } from "@/db/schema";
import { api, Badge, Button, Field, Input, Modal, Select, Textarea, cx, useToast } from "@/components/ui";

type Verification = { schemaValid: boolean; publisherSignature: string; cimdResolved: boolean; mcpVersion: string; fingerprint: string | null; issues: string[] };
type ImportResult = { ok: boolean; stage: string; issues?: string[]; verification?: Verification; preview?: Partial<Capability>; capability?: Capability };

export function ImportManifestModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (c: Capability) => void }) {
  const toast = useToast();
  const [manifest, setManifest] = useState("");
  const [signature, setSignature] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<"check" | "import" | null>(null);

  async function loadSample(tamper = false) {
    const s = await api<{ manifest: unknown; signature: string }>("/api/mcp/sample");
    const m = s.manifest as Record<string, unknown>;
    setManifest(JSON.stringify(tamper ? { ...m, version: "9.9.9" } : m, null, 2));
    setSignature(s.signature);
    setResult(null);
  }

  async function run(dryRun: boolean) {
    setBusy(dryRun ? "check" : "import");
    try {
      const res = await fetch("/api/capabilities/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manifest, signature: signature || null, dryRun }) });
      const data = (await res.json()) as ImportResult & { error?: string };
      if (data.error) throw new Error(data.error);
      setResult(data);
      if (!dryRun && data.ok && data.capability) {
        onImported(data.capability);
        toast.push(`${data.capability.name} ${data.stage} — ${data.capability.verified ? "verified publisher" : "UNVERIFIED"}`, data.capability.verified ? "success" : "info");
      }
      if (!data.ok) toast.push(`Rejected at ${data.stage} stage`, "error");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(null);
    }
  }

  const v = result?.verification;
  const stages = [
    { k: "Schema", ok: result ? result.stage !== "schema" : null },
    { k: "Publisher signature", ok: v ? v.publisherSignature === "valid" : result?.stage === "signature" ? false : null, warn: v?.publisherSignature === "unsigned" },
    { k: "CIMD resolved", ok: v ? v.cimdResolved : null },
    { k: "Tool risk gates", ok: result ? result.ok : null },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Import .aipc capability package" wide>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => loadSample(false)}>Load Fleet OS sample</Button>
            <Button size="sm" variant="ghost" onClick={() => loadSample(true)}>Load tampered sample</Button>
          </div>
          <Field label="manifest.json"><Textarea rows={16} value={manifest} onChange={(e) => { setManifest(e.target.value); setResult(null); }} className="mono text-xs" placeholder='{"mcpVersion":"2026-07-28", ...}' /></Field>
          <Field label="signature.sig (publisher Ed25519)"><Input value={signature} onChange={(e) => { setSignature(e.target.value); setResult(null); }} className="mono text-xs" placeholder="ed25519:…" /></Field>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Verification pipeline</p>
            <ul className="space-y-1.5">
              {stages.map((s) => (
                <li key={s.k} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{s.k}</span>
                  <Badge tone={s.ok === null ? "neutral" : s.warn ? "amber" : s.ok ? "lime" : "rose"}>{s.ok === null ? "pending" : s.warn ? "unsigned" : s.ok ? "pass" : "fail"}</Badge>
                </li>
              ))}
            </ul>
            {v?.fingerprint && <p className="mono mt-2 text-[11px] text-zinc-500">publisher key {v.fingerprint}</p>}
          </div>
          {result?.issues && result.issues.length > 0 && (
            <div className={cx("rounded-xl border p-3", result.ok ? "border-amber-400/30 bg-amber-400/5" : "border-rose-500/30 bg-rose-500/5")}>
              <p className={cx("mb-1 text-xs font-semibold uppercase tracking-wide", result.ok ? "text-amber-300" : "text-rose-300")}>{result.ok ? "Warnings" : "Rejected"}</p>
              <ul className="space-y-1 text-xs text-zinc-300">{result.issues.map((i, n) => <li key={n}>• {i}</li>)}</ul>
            </div>
          )}
          {result?.ok && result.preview && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
              <p className="font-semibold text-white">{result.preview.name} <span className="text-xs text-zinc-500">v{result.preview.version}</span></p>
              <p className="text-xs text-zinc-500">{result.preview.publisher} · max Level {result.preview.level}</p>
              <div className="mt-2 space-y-1">
                {(result.preview.tools ?? []).map((t) => <ToolRow key={t.name} t={t} />)}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="secondary" onClick={() => run(true)} loading={busy === "check"} disabled={!manifest}>Verify only</Button>
            <Button onClick={() => run(false)} loading={busy === "import"} disabled={!manifest || (result !== null && !result.ok)}>Import to catalog</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function ToolRow({ t }: { t: CapabilityTool }) {
  const tone = t.risk === "read" ? "lime" : t.risk === "prepare" ? "sky" : t.risk === "consequential" ? "amber" : "rose";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 px-2 py-1.5 text-xs">
      <span className="mono text-zinc-100">{t.name}</span>
      <Badge tone={tone}>{t.risk}</Badge>
      <Badge tone={t.confirmation === "none" ? "neutral" : t.confirmation === "required" ? "amber" : "violet"}>{t.confirmation === "none" ? "auto" : t.confirmation === "required" ? "confirm" : "step-up"}</Badge>
      {t.description && <span className="text-zinc-500">{t.description}</span>}
    </div>
  );
}

// ---------- Invocation console ----------
type InvokeResult = {
  ok: boolean; stage: string; decision?: string; errors?: string[];
  card?: { title: string; capability: string; riskLevel: string; summary: string; requestedAction: string };
  invocation?: { requestLine: string; headers: Record<string, string>; body: unknown };
  response?: unknown; receipt?: Receipt;
};

export function InvokeConsole({ cap, devices, open, onClose, onReceipt }: { cap: Capability | null; devices: { id: number; name: string }[]; open: boolean; onClose: () => void; onReceipt?: () => void }) {
  const toast = useToast();
  const [tool, setTool] = useState<string>("");
  const [args, setArgs] = useState<Record<string, string>>({});
  const [deviceId, setDeviceId] = useState<number | "">(devices[0]?.id ?? "");
  const [result, setResult] = useState<InvokeResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cap) { setTool(cap.tools[0]?.name ?? ""); setArgs({}); setResult(null); }
  }, [cap]);

  const t = cap?.tools.find((x) => x.name === tool);
  const props = ((t?.inputSchema?.properties ?? {}) as Record<string, { type?: string; pattern?: string }>);
  const required = ((t?.inputSchema?.required ?? []) as string[]);

  function coerce(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) {
      if (v === "") continue;
      const ty = props[k]?.type;
      if (ty === "number") out[k] = Number(v);
      else if (ty === "array") { try { out[k] = JSON.parse(v); } catch { out[k] = v.split(",").map((s) => s.trim()); } }
      else out[k] = v;
    }
    return out;
  }

  async function send(extra: Record<string, unknown> = {}) {
    if (!cap) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/capabilities/${cap.id}/invoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool, args: coerce(), deviceId: deviceId || null, ...extra }) });
      const data = (await res.json()) as InvokeResult & { error?: string };
      if (data.error) throw new Error(data.error);
      setResult(data);
      if (data.stage === "executed") { toast.push("Tool executed — signed receipt written", "success"); onReceipt?.(); }
      else if (data.stage === "policy") { toast.push("Blocked by policy broker — receipt written", "error"); onReceipt?.(); }
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open && !!cap} onClose={onClose} title={cap ? `Invoke · ${cap.name}` : ""} wide>
      {cap && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label="Tool">
              <Select value={tool} onChange={(e) => { setTool(e.target.value); setArgs({}); setResult(null); }}>
                {cap.tools.map((x) => <option key={x.name} value={x.name}>{x.name} — {x.risk}</option>)}
              </Select>
            </Field>
            {t && <ToolRow t={t} />}
            {Object.keys(props).length === 0 ? (
              <p className="text-xs text-zinc-500">This tool declares no inputSchema; it will be called without arguments.</p>
            ) : Object.entries(props).map(([k, p]) => (
              <Field key={k} label={`${k}${required.includes(k) ? " *" : ""}`} hint={p.pattern ? `pattern ${p.pattern}` : p.type}>
                <Input value={args[k] ?? ""} onChange={(e) => setArgs({ ...args, [k]: e.target.value })} className="mono" placeholder={p.type === "array" ? '[{"description":"Oil change","amount":89}]' : k === "workOrderId" ? "WO-1842" : ""} />
              </Field>
            ))}
            <Field label="Handset">
              <Select value={deviceId} onChange={(e) => setDeviceId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">No device</option>
                {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Button className="w-full" onClick={() => send()} loading={busy}>Submit typed capability request</Button>
          </div>

          <div className="space-y-3">
            {!result && <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">Request → Policy Broker → Allow / Confirm / Step-up / Deny → stateless JSON-RPC → signed receipt.</div>}

            {result?.stage === "schema" && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-300">Rejected by manifest inputSchema</p>
                <ul className="mt-1 space-y-0.5 text-xs text-zinc-300">{result.errors?.map((e, i) => <li key={i}>• {e}</li>)}</ul>
              </div>
            )}

            {(result?.stage === "awaiting_confirmation" || result?.stage === "awaiting_step_up") && result.card && (
              <div className={cx("rounded-2xl border p-5", result.stage === "awaiting_step_up" ? "border-violet-400/40 bg-violet-400/5" : "border-amber-400/40 bg-amber-400/5")}>
                <div className="flex items-center justify-between">
                  <p className={cx("text-[11px] font-bold tracking-wider", result.stage === "awaiting_step_up" ? "text-violet-300" : "text-amber-400")}>{result.card.title.toUpperCase()}</p>
                  <p className="mono text-[11px] text-zinc-400">{result.card.riskLevel}</p>
                </div>
                <p className="mt-3 text-lg font-bold text-white">{result.card.capability.toUpperCase()}</p>
                <p className="mt-1 text-sm text-zinc-300">{result.card.summary}</p>
                <div className="mt-3 rounded-lg bg-zinc-950 p-3">
                  <p className="text-[11px] font-semibold text-zinc-500">Requested Action:</p>
                  <p className="mono break-all text-xs text-zinc-200">{result.card.requestedAction}</p>
                </div>
                {result.stage === "awaiting_step_up" && <p className="mt-3 text-xs text-violet-200">BIOMETRIC_STRONG required. Simulate the hardware prompt below.</p>}
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" className="text-rose-300" onClick={() => (result.stage === "awaiting_step_up" ? send({ approved: false }) : setResult(null))} loading={busy}>{result.stage === "awaiting_step_up" ? "Auth failed" : "Reject"}</Button>
                  <Button onClick={() => send(result.stage === "awaiting_step_up" ? { approved: true, stepUpPassed: true } : { approved: true })} loading={busy}>{result.stage === "awaiting_step_up" ? "Fingerprint OK" : "Confirm Execution"}</Button>
                </div>
              </div>
            )}

            {result?.stage === "policy" && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-300">Denied by policy broker</p>
                <p className="mt-1 text-zinc-300">No JSON-RPC was sent. Receipt {result.receipt?.receiptRef} recorded the denial.</p>
              </div>
            )}

            {result?.stage === "executed" && result.invocation && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="lime">executed</Badge>
                  <Badge tone={result.decision === "allow" ? "lime" : result.decision === "confirm" ? "amber" : "violet"}>{result.decision}</Badge>
                  <span className="mono text-[11px] text-zinc-500">{result.receipt?.receiptRef}</span>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Stateless JSON-RPC request</p>
                <pre className="mono max-h-64 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-[11px] leading-4 text-zinc-300">{[result.invocation.requestLine, ...Object.entries(result.invocation.headers).map(([k, v]) => `${k}: ${v}`), "", JSON.stringify(result.invocation.body, null, 2)].join("\n")}</pre>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Response</p>
                <pre className="mono max-h-40 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-[11px] leading-4 text-lime-200">{JSON.stringify(result.response, null, 2)}</pre>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
