"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, cn, useToast } from "@/components/ui";
import { api } from "@/lib/client";
import { timeAgo, type DeviceDTO, type TokenDTO } from "@/lib/shared";

const SELF_TONE = { pass: "bg-emerald-500", warn: "bg-amber-500", fail: "bg-red-500" } as const;
const TOKEN_TONE: Record<string, string> = {
  issued: "bg-sky-100 text-sky-800 ring-sky-600/20",
  used: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  expired: "bg-stone-200 text-stone-700 ring-stone-500/20",
  revoked: "bg-red-100 text-red-800 ring-red-600/20",
};

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/70 p-3 ring-1 ring-ink/10">
      <p className="font-mono text-[10px] uppercase tracking-wider text-ink/50">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold">{value}</p>
      {sub && <p className="text-[11px] text-ink/50">{sub}</p>}
    </div>
  );
}

export function DiagnosticsPanel({ device }: { device: DeviceDTO }) {
  const d = device.diagnostics;
  return (
    <section>
      <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink/55">Diagnostics & key vault</h3>
      {!d ? (
        <p className="rounded-lg bg-ink/5 px-3 py-2.5 text-sm text-ink/60">Health diagnostics run at provisioning step 3.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Tile label="Play Integrity" value={d.playIntegrity.replace("MEETS_", "").replace("_INTEGRITY", "")} />
            <Tile label="SELinux" value={d.selinux} />
            <Tile label="Storage free" value={`${d.storageFreeGb} GB`} sub={`of ${d.storageTotalGb} GB`} />
            <Tile label="Battery health" value={`${d.batteryHealthPct}%`} />
            <Tile label="RAM free" value={`${d.ramFreeGb} GB`} sub={`of ${device.ramGb} GB`} />
          </div>
          <div className="rounded-xl bg-ink px-4 py-3 font-mono text-[11px] leading-relaxed text-paper/80">
            <p><span className="text-accent">serial</span> {device.serial || "—"}</p>
            <p className="break-all"><span className="text-accent">report_sig</span> {d.reportSignature ? d.reportSignature.slice(0, 48) + "…" : "unsigned (step 4)"}</p>
            <p className="break-all"><span className="text-accent">rsa4096_fp</span> {device.keyFingerprint ? device.keyFingerprint.slice(0, 52) + "…" : "not generated (step 10)"}</p>
          </div>
          {d.selfTest && (
            <ul className="divide-y divide-ink/10 overflow-hidden rounded-xl bg-white/70 ring-1 ring-ink/10">
              {d.selfTest.map((t) => (
                <li key={t.name} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", SELF_TONE[t.status])} />
                  <span className="w-52 shrink-0 font-medium">{t.name}</span>
                  <span className="text-xs text-ink/60">{t.note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function TelephonyPanel({ device, onChanged }: { device: DeviceDTO; onChanged: () => void }) {
  const toast = useToast();
  const [tokens, setTokens] = useState<TokenDTO[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ token: string; direction: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setTokens(await api<TokenDTO[]>(`/api/devices/${device.id}/tokens`));
    } catch {
      setTokens([]);
    }
  }, [device.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, device.sipStatus]);

  async function issue(direction: "outbound" | "listen") {
    setBusy(direction);
    try {
      const r = await api<{ token: string }>(`/api/devices/${device.id}/tokens`, { method: "POST", body: { direction } });
      setFresh({ token: r.token, direction });
      toast("15-minute token issued. It is shown once and can be redeemed one time.");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not issue token", "err");
    }
    setBusy(null);
  }

  async function redeem(token: string) {
    setBusy("redeem");
    try {
      await api("/api/gateway/redeem", { method: "POST", body: { token } });
      toast("Gateway accepted the token");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Gateway rejected the token", "err");
    }
    await load();
    setBusy(null);
  }

  async function register() {
    setBusy("register");
    try {
      const r = await api<{ token: string }>(`/api/devices/${device.id}/tokens`, { method: "POST", body: { direction: "listen" } });
      await api("/api/gateway/redeem", { method: "POST", body: { token: r.token } });
      toast("Registered. Device is in listening standby.");
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Registration failed", "err");
    }
    await load();
    setBusy(null);
  }

  const registered = device.sipStatus === "registered";
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-mono text-[11px] uppercase tracking-wider text-ink/55">Telephony · short-lived tokens</h3>
        <Badge tone={registered ? TOKEN_TONE.used : TOKEN_TONE.expired}>{registered ? "SIP registered · standby" : "SIP not registered"}</Badge>
      </div>
      <div className="space-y-3 rounded-xl bg-white/70 p-4 ring-1 ring-ink/10">
        <p className="text-xs text-ink/60">
          No master {device.voiceProvider === "none" ? "provider" : device.voiceProvider} credentials live on the handset. It exchanges its device certificate for a 15-minute, single-use JWT.
        </p>
        <div>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-ink/50">Approved call numbers</p>
          <div className="flex flex-wrap gap-1.5">
            {device.approvedNumbers.length === 0 ? (
              <span className="text-xs text-ink/50">None. Calls and texts are denied until you add numbers (Edit device).</span>
            ) : (
              device.approvedNumbers.map((n) => <code key={n} className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-xs">{n}</code>)
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="accent" loading={busy === "register"} onClick={register}>{registered ? "Re-register standby" : "Register for standby"}</Button>
          <Button size="sm" variant="outline" loading={busy === "outbound"} onClick={() => issue("outbound")}>Issue outbound token</Button>
        </div>
        {fresh && (
          <div className="slidein rounded-lg bg-ink p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-accent">{fresh.direction} token · shown once</p>
            <p className="mt-1 break-all font-mono text-[11px] text-paper/70">{fresh.token.slice(0, 120)}…</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="accent" loading={busy === "redeem"} onClick={() => redeem(fresh.token)}>Present to gateway</Button>
              <Button size="sm" variant="ghost" className="text-paper/70 hover:bg-paper/10 hover:text-paper" onClick={() => setFresh(null)}>Dismiss</Button>
            </div>
            <p className="mt-2 text-[11px] text-paper/50">Try presenting it twice — the second attempt is rejected.</p>
          </div>
        )}
        {tokens && tokens.length > 0 && (
          <ul className="divide-y divide-ink/10 text-xs">
            {tokens.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                <Badge tone={TOKEN_TONE[t.status]}>{t.status}</Badge>
                <span className="font-mono">{t.direction === "listen" ? "call.listen" : "call.outbound"}</span>
                {t.direction === "outbound" && <span className="text-ink/50">{t.numbers.length} numbers</span>}
                <span className="ml-auto text-ink/50">issued {timeAgo(t.issuedAt)} · 15 min TTL</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
