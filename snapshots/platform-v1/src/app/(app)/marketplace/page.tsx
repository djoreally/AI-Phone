"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Icon, LevelBadge, Modal, PageHeader, Skeleton, cn, inputCls, useToast } from "@/components/ui";
import ToolConsole from "@/components/ToolConsole";
import { api, useApi } from "@/lib/client";
import { DECISION_TONE } from "@/components/ui";
import { EXECUTOR_LABEL, LEVEL_META, timeAgo, type CapabilityDTO } from "@/lib/shared";

type Inst = NonNullable<CapabilityDTO["installation"]>;

function List({ title, items, tone }: { title: string; items: string[]; tone: "can" | "cannot" | "data" }) {
  const marker = tone === "can" ? "text-emerald-600" : tone === "cannot" ? "text-red-600" : "text-ink/40";
  const glyph = tone === "can" ? "✓" : tone === "cannot" ? "✕" : "•";
  return (
    <div>
      <h4 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink/55">{title}</h4>
      <ul className="space-y-1.5 text-sm">
        {items.length === 0 && <li className="text-ink/45">None</li>}
        {items.map((i) => (
          <li key={i} className="flex gap-2"><span className={cn("font-bold", marker)}>{glyph}</span>{i}</li>
        ))}
      </ul>
    </div>
  );
}

export default function MarketplacePage() {
  const { data, setData, loading, error, reload } = useApi<CapabilityDTO[]>("/api/capabilities");
  const toast = useToast();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [lvl, setLvl] = useState(0);
  const [only, setOnly] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [showManifest, setShowManifest] = useState(false);

  const caps = useMemo(() => data ?? [], [data]);
  const cats = useMemo(() => ["All", ...Array.from(new Set(caps.map((c) => c.category)))], [caps]);
  const shown = caps.filter(
    (c) =>
      (cat === "All" || c.category === cat) &&
      (!lvl || c.level === lvl) &&
      (!only || c.installation) &&
      (`${c.name} ${c.publisher} ${c.description}`.toLowerCase().includes(q.toLowerCase())),
  );
  const open = caps.find((c) => c.id === openId) ?? null;

  function setInst(id: number, inst: Inst | null) {
    setData((list) => (list ?? []).map((c) => (c.id === id ? { ...c, installation: inst } : c)));
  }

  async function install(c: CapabilityDTO) {
    const prev = c.installation;
    setPending(c.id);
    setInst(c.id, { status: c.oauthScopes.length ? "needs_auth" : "connected", lastHealthCheckAt: null, installedAt: new Date().toISOString() });
    try {
      const inst = await api<Inst>(`/api/capabilities/${c.id}`, { method: "POST" });
      setInst(c.id, inst);
      toast(inst.status === "needs_auth" ? `${c.name} installed. Connect your account to activate it.` : `${c.name} installed and ready.`);
    } catch (e) {
      setInst(c.id, prev);
      toast(e instanceof Error ? e.message : "Install failed", "err");
    }
    setPending(null);
  }

  async function patch(c: CapabilityDTO, action: "connect" | "test") {
    const prev = c.installation;
    setPending(c.id);
    if (action === "connect" && prev) setInst(c.id, { ...prev, status: "connected" });
    try {
      const inst = await api<Inst>(`/api/capabilities/${c.id}`, { method: "PATCH", body: { action } });
      setInst(c.id, inst);
      toast(action === "connect" ? `${c.name} connected` : `${c.name}: health check passed`);
    } catch (e) {
      setInst(c.id, prev);
      toast(e instanceof Error ? e.message : "Action failed", "err");
    }
    setPending(null);
  }

  async function revoke(c: CapabilityDTO) {
    const prev = c.installation;
    setPending(c.id);
    setInst(c.id, null);
    try {
      await api(`/api/capabilities/${c.id}`, { method: "DELETE" });
      toast(`${c.name} revoked. Tokens invalidated.`);
    } catch (e) {
      setInst(c.id, prev);
      toast(e instanceof Error ? e.message : "Revoke failed", "err");
    }
    setPending(null);
  }

  function renderActions(c: CapabilityDTO) {
    const busy = pending === c.id;
    if (!c.integrity.ok)
      return <Badge tone={DECISION_TONE.deny}>Quarantined</Badge>;
    if (!c.installation)
      return <Button variant="accent" size="sm" loading={busy} onClick={() => install(c)}>Install</Button>;
    if (c.installation.status !== "connected")
      return (
        <div className="flex gap-2">
          <Button variant="accent" size="sm" loading={busy} onClick={() => patch(c, "connect")}>Connect</Button>
          <Button variant="ghost" size="sm" onClick={() => revoke(c)}>Remove</Button>
        </div>
      );
    return (
      <div className="flex gap-2">
        <Button variant="outline" size="sm" loading={busy} onClick={() => patch(c, "test")}>Run test</Button>
        {!c.builtin && <Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50" onClick={() => revoke(c)}>Revoke</Button>}
      </div>
    );
  }

  return (
    <div>
      <PageHeader eyebrow="MCP is the tool catalog" title="Capability marketplace" sub="A curated catalog. Each capability is signed, schema-described, permission-scoped, and revocable. Nothing gets unrestricted access to the phone." />

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <input className={cn(inputCls, "pl-9")} placeholder="Search capabilities, publishers…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search capabilities" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} className="accent-[var(--color-accent)]" /> Installed only
        </label>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={cn("rounded-full px-3.5 py-1.5 text-xs font-medium transition", cat === c ? "bg-ink text-paper" : "bg-white/70 ring-1 ring-ink/10 hover:bg-white")}>{c}</button>
        ))}
        <span className="mx-1 w-px bg-ink/15" />
        {[0, 1, 2, 3, 4].map((l) => (
          <button key={l} onClick={() => setLvl(l)} className={cn("rounded-full px-3 py-1.5 font-mono text-xs transition", lvl === l ? "bg-accent text-white" : "bg-white/70 ring-1 ring-ink/10 hover:bg-white")}>{l === 0 ? "Any level" : `L${l}`}</button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-52" />)}</div>}
      {!loading && !error && shown.length === 0 && (
        <EmptyState icon="store" title="No capabilities found" body="Adjust your search or filters." action={<Button variant="outline" onClick={() => { setQ(""); setCat("All"); setLvl(0); setOnly(false); }}>Reset filters</Button>} />
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => (
          <Card key={c.id} className="pop flex flex-col p-5 transition hover:border-ink/30 hover:shadow-md">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display text-lg font-bold leading-tight">{c.name}</h3>
                <p className="mt-0.5 text-xs text-ink/55">{c.publisher} · v{c.version}</p>
              </div>
              <LevelBadge level={c.level} />
            </div>
            <p className="mt-3 flex-1 text-sm text-ink/70">{c.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge>{EXECUTOR_LABEL[c.executor] ?? c.executor}</Badge>
              {c.verification === "curated" ? (
                <Badge tone="bg-emerald-50 text-emerald-800 ring-emerald-600/20">Marketplace reviewed</Badge>
              ) : (
                <Badge tone="bg-violet-50 text-violet-800 ring-violet-600/20">Custom · {c.owned ? "yours" : "signed"}</Badge>
              )}
              <Badge tone={c.integrity.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-600/20" : DECISION_TONE.deny}>{c.integrity.ok ? "✓ Signature valid" : "✕ Integrity failure"}</Badge>
              {c.installation && (
                <Badge tone={c.installation.status === "connected" ? DECISION_TONE.allow : DECISION_TONE.confirm}>
                  {c.installation.status === "connected" ? "Connected" : "Needs connection"}
                </Badge>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-3">
              <button onClick={() => setOpenId(c.id)} className="text-sm font-medium text-accent hover:underline">View policy</button>
              {renderActions(c)}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={!!open} onClose={() => { setOpenId(null); setShowManifest(false); }} title={open ? `${open.name} capability` : ""} wide>
        {open && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <LevelBadge level={open.level} long />
              {open.verification === "curated" ? (
                <Badge tone="bg-emerald-50 text-emerald-800 ring-emerald-600/20">Marketplace reviewed · {open.publisher}</Badge>
              ) : (
                <Badge tone="bg-violet-50 text-violet-800 ring-violet-600/20">Publisher-signed, not reviewed · {open.publisher}</Badge>
              )}
              <span className="font-mono text-xs text-ink/50">{open.slug} · v{open.version}</span>
            </div>
            <p className="text-sm text-ink/70">{open.description}</p>
            <div className="grid gap-6 sm:grid-cols-3">
              <List title="Can" items={open.canDo} tone="can" />
              <List title="Cannot" items={open.cannotDo} tone="cannot" />
              <List title="Data access" items={open.dataAccess} tone="data" />
            </div>
            <div>
              <h4 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink/55">Tools & confirmation</h4>
              <div className="overflow-hidden rounded-xl border border-ink/10 bg-white/70">
                {open.tools.map((t) => (
                  <div key={t.name} className="flex flex-wrap items-center gap-3 border-b border-ink/10 px-4 py-2.5 last:border-0">
                    <code className="font-mono text-xs font-semibold">{t.name}</code>
                    <span className="min-w-40 flex-1 text-xs text-ink/60">{t.description}{t.requiredEvidence?.length ? ` · evidence: ${t.requiredEvidence.join(", ")}` : ""}</span>
                    <LevelBadge level={t.level} />
                    <Badge tone={t.confirmation === "none" ? DECISION_TONE.allow : t.confirmation === "required" ? DECISION_TONE.confirm : DECISION_TONE.deny}>
                      {t.confirmation === "none" ? "No confirmation" : t.confirmation === "required" ? "Confirm" : "Confirm + step-up"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-6 text-sm sm:grid-cols-2">
              <div>
                <h4 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink/55">Permissions & OAuth scopes</h4>
                <div className="flex flex-wrap gap-1.5">
                  {[...open.permissions, ...open.oauthScopes].map((p) => <code key={p} className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-xs">{p}</code>)}
                </div>
              </div>
              <div>
                <h4 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink/55">Network destinations</h4>
                <div className="flex flex-wrap gap-1.5">
                  {open.networkDestinations.length === 0 ? <span className="text-ink/45">None. On-device only.</span> : open.networkDestinations.map((p) => <code key={p} className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-xs">{p}</code>)}
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-ink/5 px-4 py-3 text-sm"><span className="font-semibold">Data retention: </span>{open.retention}</div>

            <div>
              <h4 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink/55">Package integrity · MCP {open.mcpVersion}</h4>
              <div className="overflow-hidden rounded-xl bg-ink font-mono text-[12px] text-paper/85">
                <ul className="divide-y divide-paper/10">
                  {[
                    ["Ed25519 signature", open.integrity.signature === "valid" ? "valid" : open.integrity.signature, open.integrity.signature === "valid"],
                    ["Publisher key fingerprint matches", open.integrity.fingerprintMatch ? "yes" : "NO", open.integrity.fingerprintMatch],
                    ["Enforced tool table matches manifest", open.integrity.toolsMatch ? "yes" : "NO — tampered", open.integrity.toolsMatch],
                  ].map(([l, v, ok]) => (
                    <li key={String(l)} className="flex items-center gap-3 px-4 py-2">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", ok ? "bg-emerald-500" : "bg-red-500")} />
                      <span className="flex-1">{l}</span>
                      <span>{String(v)}</span>
                    </li>
                  ))}
                </ul>
                <p className="break-all border-t border-paper/10 px-4 py-2 text-paper/60">
                  {open.publisherFingerprint} · {open.verification === "curated" ? "countersigned by marketplace review key" : "self-signed by publisher, key pinned on first publication"}
                </p>
              </div>
              <button onClick={() => setShowManifest((v) => !v)} className="mt-2 text-sm font-medium text-accent hover:underline">{showManifest ? "Hide manifest.json" : "View manifest.json"}</button>
              {showManifest && open.manifest && <pre className="slidein mt-2 max-h-72 overflow-auto rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed text-paper/85">{JSON.stringify(open.manifest, null, 2)}</pre>}
            </div>

            {open.installation?.status === "connected" && open.integrity.ok && (
              <div>
                <h4 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink/55">Tool console · every call goes through the policy broker</h4>
                <ToolConsole key={open.id} cap={open} />
              </div>
            )}
            {open.installation && (
              <p className="text-xs text-ink/55">
                Installed {timeAgo(open.installation.installedAt)}
                {open.installation.lastHealthCheckAt && ` · last health check ${timeAgo(open.installation.lastHealthCheckAt)}`}
              </p>
            )}
            <div className="flex justify-end border-t border-ink/10 pt-4">{renderActions(open)}</div>
          </div>
        )}
      </Modal>
      <p className="sr-only">{LEVEL_META[1].label}</p>
    </div>
  );
}
