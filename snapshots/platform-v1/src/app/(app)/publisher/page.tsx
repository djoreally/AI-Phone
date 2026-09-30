"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, DECISION_TONE, EmptyState, ErrorState, Field, Icon, PageHeader, Skeleton, cn, inputCls, useToast } from "@/components/ui";
import { ApiError, api, useApi } from "@/lib/client";
import { SAMPLE_MANIFEST } from "@/lib/sampleManifest";
import type { CapabilityDTO } from "@/lib/shared";

type Check = { ok: boolean; errors: string[]; warnings: string[]; signature: "valid" | "invalid" | "missing"; fingerprintMatch: boolean; tools: number };
type Diff = { addedTools: string[]; removedTools: string[]; raisedRisk: string[]; addedPermissions: string[]; addedScopes: string[]; escalated: boolean };

export default function PublisherPage() {
  const { data, setData, loading, error, reload } = useApi<CapabilityDTO[]>("/api/capabilities");
  const toast = useToast();
  const [text, setText] = useState(() => JSON.stringify(SAMPLE_MANIFEST, null, 2));
  const [signature, setSignature] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const mine = (data ?? []).filter((c) => c.owned);

  function parse(): unknown | null {
    try {
      return JSON.parse(text);
    } catch (e) {
      setProblems([`manifest.json is not valid JSON: ${e instanceof Error ? e.message : "parse error"}`]);
      setCheck(null);
      return null;
    }
  }

  async function validate() {
    const manifest = parse();
    if (!manifest) return;
    setBusy("validate");
    setProblems([]);
    setDiff(null);
    try {
      setCheck(await api<Check>("/api/publisher/validate", { method: "POST", body: { manifest, signature, publicKey } }));
    } catch (e) {
      setProblems([e instanceof Error ? e.message : "Validation failed"]);
    }
    setBusy(null);
  }

  async function sign() {
    const manifest = parse();
    if (!manifest) return;
    setBusy("sign");
    setProblems([]);
    setDiff(null);
    try {
      const r = await api<{ manifest: unknown; signature: string; publicKey: string; privateKey?: string; warnings: string[] }>("/api/publisher/sign", {
        method: "POST",
        body: { manifest, privateKey: privateKey || undefined },
      });
      setText(JSON.stringify(r.manifest, null, 2));
      setSignature(r.signature);
      setPublicKey(r.publicKey);
      if (r.privateKey) setPrivateKey(r.privateKey);
      setCheck(null);
      toast(r.privateKey ? "New Ed25519 key generated and manifest signed. Save the private key: it is not stored." : "Manifest re-signed with your key");
    } catch (e) {
      setProblems(e instanceof ApiError && Array.isArray(e.data.errors) ? (e.data.errors as string[]) : [e instanceof Error ? e.message : "Signing failed"]);
    }
    setBusy(null);
  }

  async function submit() {
    const manifest = parse();
    if (!manifest) return;
    setBusy("submit");
    setProblems([]);
    setDiff(null);
    try {
      const r = await api<{ created: boolean; diff: Diff | null }>("/api/publisher/submit", { method: "POST", body: { manifest, signature, publicKey } });
      setDiff(r.diff);
      setCheck(null);
      toast(r.created ? "Package published to your workspace. Install it from the marketplace." : r.diff?.escalated ? "Updated. Installations need re-consent." : "Package updated");
      await reload();
    } catch (e) {
      setProblems(e instanceof ApiError && Array.isArray(e.data.errors) ? (e.data.errors as string[]) : [e instanceof Error ? e.message : "Submit failed"]);
    }
    setBusy(null);
  }

  async function remove(c: CapabilityDTO) {
    const prev = data;
    setConfirmId(null);
    setData((l) => (l ?? []).filter((x) => x.id !== c.id));
    try {
      await api(`/api/publisher/${c.id}`, { method: "DELETE" });
      toast(`${c.name} withdrawn`);
    } catch (e) {
      setData(prev);
      toast(e instanceof Error ? e.message : "Withdraw failed", "err");
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Phase 3 · MCP capability manifests" title="Publisher studio" sub="Validate a capability manifest, sign it with an Ed25519 publisher key, and submit the package. The policy broker — not the capability — keeps final authority over every tool." />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold">manifest.json</h2>
            <Button variant="ghost" size="sm" onClick={() => { setText(JSON.stringify(SAMPLE_MANIFEST, null, 2)); setSignature(""); setPublicKey(""); setPrivateKey(""); setCheck(null); setProblems([]); setDiff(null); }}>Load sample</Button>
          </div>
          <textarea className={cn(inputCls, "min-h-[26rem] font-mono text-xs leading-relaxed")} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Capability manifest JSON" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" loading={busy === "validate"} onClick={validate}>Validate</Button>
            <Button variant="primary" size="sm" loading={busy === "sign"} onClick={sign}>{privateKey ? "Re-sign with my key" : "Generate key & sign"}</Button>
            <Button variant="accent" size="sm" loading={busy === "submit"} disabled={!signature || !publicKey} onClick={submit}>Submit package</Button>
          </div>

          {problems.length > 0 && (
            <div role="alert" className="slidein mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">{problems.length} problem{problems.length > 1 ? "s" : ""}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          {check && (
            <div className="slidein mt-4 space-y-2">
              <div className={cn("rounded-lg border p-3 text-sm", check.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800")}>
                <p className="font-semibold">{check.ok ? `Schema valid · ${check.tools} tool${check.tools === 1 ? "" : "s"}` : `${check.errors.length} schema error${check.errors.length === 1 ? "" : "s"}`}</p>
                {check.errors.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">{check.errors.map((x) => <li key={x}>{x}</li>)}</ul>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={check.signature === "valid" ? "bg-emerald-100 text-emerald-800 ring-emerald-600/20" : check.signature === "invalid" ? DECISION_TONE.deny : "bg-stone-200 text-stone-700 ring-stone-500/20"}>
                  Signature: {check.signature}
                </Badge>
                {check.signature !== "missing" && <Badge tone={check.fingerprintMatch ? "bg-emerald-100 text-emerald-800 ring-emerald-600/20" : DECISION_TONE.deny}>Fingerprint {check.fingerprintMatch ? "matches" : "does not match"}</Badge>}
              </div>
              {check.warnings.map((w) => <p key={w} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">⚠ {w}</p>)}
            </div>
          )}
          {diff && (
            <div className={cn("slidein mt-4 rounded-lg border p-3 text-sm", diff.escalated ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>
              <p className="font-semibold">{diff.escalated ? "Update escalates privileges. Existing installations need re-consent." : "Update accepted. No new privileges."}</p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {diff.addedTools.map((t) => <li key={t}>New tool: {t}</li>)}
                {diff.raisedRisk.map((t) => <li key={t}>Higher risk level: {t}</li>)}
                {diff.addedPermissions.map((t) => <li key={t}>New permission: {t}</li>)}
                {diff.addedScopes.map((t) => <li key={t}>New OAuth scope: {t}</li>)}
                {diff.removedTools.map((t) => <li key={t}>Removed tool: {t}</li>)}
              </ul>
            </div>
          )}
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="font-display text-xl font-bold">Signing keys</h2>
            <p className="mt-1 text-xs text-ink/55">Ed25519 over the canonical (key-sorted) manifest JSON. Updates must be signed by the key pinned at first publication.</p>
            <div className="mt-4 space-y-3">
              <Field label="Signature (base64)"><textarea className={cn(inputCls, "min-h-16 font-mono text-[11px]")} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Generated by Sign" /></Field>
              <Field label="Publisher public key (SPKI, base64)"><textarea className={cn(inputCls, "min-h-16 font-mono text-[11px]")} value={publicKey} onChange={(e) => setPublicKey(e.target.value)} /></Field>
              <Field label="Private key (PKCS#8, base64)" hint="Shown once and never stored by this server. Real publishers sign offline; this is a development convenience.">
                <textarea className={cn(inputCls, "min-h-16 font-mono text-[11px]")} value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder="Leave empty to generate a new keypair" />
              </Field>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-xl font-bold">Enforced at validation</h2>
            <ul className="mt-3 space-y-2 text-xs text-ink/70">
              {[
                "Level 3+ tools must set confirmationRequired and declare requiredEvidence",
                "Tool names implying side effects (send, dispatch, post…) cannot be declared below Level 3",
                "Money, deletion and access tools (refund, unlock, buy…) cannot be declared below Level 4",
                "Only allow-listed Android permissions; no accessibility, device-admin, SMS or overlay",
                "Sandboxed MCP Apps: allow-scripts and allow-forms only",
                "Public HTTPS CIMD host; no localhost, IPs, or wildcard network destinations",
                "Regex patterns capped and screened for ReDoS",
              ].map((x) => <li key={x} className="flex gap-2"><span className="font-bold text-emerald-600">✓</span>{x}</li>)}
            </ul>
          </Card>
        </div>
      </div>

      <h2 className="mb-3 mt-10 font-display text-2xl font-bold">My packages</h2>
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && <Skeleton className="h-24" />}
      {!loading && !error && mine.length === 0 && (
        <EmptyState icon="bolt" title="No packages yet" body="Sign the sample manifest above and submit it. It will appear in the marketplace for you only." />
      )}
      <div className="space-y-3">
        {mine.map((c) => (
          <Card key={c.id} className="pop flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{c.name}</h3>
                <span className="font-mono text-xs text-ink/50">v{c.version}</span>
                <Badge tone={c.integrity.ok ? "bg-emerald-100 text-emerald-800 ring-emerald-600/20" : DECISION_TONE.deny}>{c.integrity.ok ? "✓ Signature valid" : "✕ Integrity failure"}</Badge>
                {c.installation && <Badge tone={c.installation.status === "connected" ? DECISION_TONE.allow : DECISION_TONE.confirm}>{c.installation.status === "connected" ? "Installed" : "Needs re-consent"}</Badge>}
              </div>
              <p className="mt-0.5 truncate font-mono text-xs text-ink/50">{c.slug} · {c.tools.length} tools · max L{c.level}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/marketplace" className="text-sm font-medium text-accent hover:underline">Open in marketplace</Link>
              {confirmId === c.id ? (
                <>
                  <Button size="sm" variant="danger" onClick={() => remove(c)}>Withdraw</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>No</Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => setConfirmId(c.id)} aria-label={`Withdraw ${c.name}`}><Icon name="trash" className="h-4 w-4" /></Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
