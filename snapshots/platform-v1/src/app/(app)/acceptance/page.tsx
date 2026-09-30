"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Icon, PageHeader, Skeleton, cn, inputCls, useToast } from "@/components/ui";
import { api, useApi } from "@/lib/client";
import type { DeviceDTO } from "@/lib/shared";

type Item = { n: number; title: string; status: "pass" | "pending" | "fail"; detail: string; action?: string };
type Report = { device: { id: number; name: string }; command: string; items: Item[]; passed: number; certified: boolean; planId: number | null };

const TONE = {
  pass: "bg-emerald-600 text-white",
  pending: "bg-ink/10 text-ink/60",
  fail: "bg-red-600 text-white",
};

export default function AcceptancePage() {
  const { data: devices, loading: devLoading, error: devError, reload } = useApi<DeviceDTO[]>("/api/devices");
  const toast = useToast();
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const list = devices ?? [];
  const activeId = deviceId ?? list.find((d) => /pixel (8|9)/i.test(d.model))?.id ?? list[0]?.id ?? null;

  const load = useCallback(async (id: number) => {
    setLoading(true);
    try {
      setReport(await api<Report>(`/api/acceptance?deviceId=${id}`));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load report", "err");
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeId) load(activeId);
  }, [activeId, load]);

  async function run(action: string) {
    if (!activeId || !report) return;
    setBusy(action);
    try {
      if (action === "reboot") {
        await api(`/api/devices/${activeId}`, { method: "PATCH", body: { action: "reboot" } });
        toast("Device rebooted into the launcher. SIP registration dropped.");
      } else if (action === "register") {
        const r = await api<{ token: string }>(`/api/devices/${activeId}/tokens`, { method: "POST", body: { direction: "listen" } });
        await api("/api/gateway/redeem", { method: "POST", body: { token: r.token } });
        toast("Registered with an ephemeral token. Listening for calls.");
      } else if (action === "command") {
        await api("/api/plans", { method: "POST", body: { utterance: report.command, deviceId: activeId } });
        toast("Plan card created. Confirm it in the Assistant.");
      }
      await load(activeId);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed", "err");
    }
    setBusy(null);
  }

  function ActionButton({ item }: { item: Item }) {
    if (!item.action) return null;
    if (item.action === "provision") return <Link href="/devices" className="text-sm font-medium text-accent hover:underline">Open Devices →</Link>;
    if (item.action === "assistant") return <Link href="/plans" className="text-sm font-medium text-accent hover:underline">Confirm in Assistant →</Link>;
    if (item.action === "receipts") return <Link href="/receipts" className="text-sm font-medium text-accent hover:underline">Open receipts →</Link>;
    const label = item.action === "reboot" ? "Reboot device" : item.action === "register" ? "Register standby" : item.status === "fail" ? "Re-run command" : "Issue command";
    return <Button size="sm" variant="accent" loading={busy === item.action} onClick={() => run(item.action!)}>{label}</Button>;
  }

  return (
    <div>
      <PageHeader eyebrow="Phase 1 milestone" title="Acceptance test" sub="The six-step protocol a reference Pixel must pass: provision, reboot, register over Wi-Fi, run a voice-driven plan, and verify the signed receipts." />

      {devError && <ErrorState message={devError} onRetry={reload} />}
      {devLoading && <Skeleton className="h-64" />}
      {!devLoading && !devError && list.length === 0 && <EmptyState icon="phone" title="No devices to test" body="Add a Pixel 8 or 9 on Android 14+ and provision it first." action={<Link href="/devices" className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white">Add a device</Link>} />}

      {list.length > 0 && (
        <>
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <select className={cn(inputCls, "sm:w-72")} value={activeId ?? ""} onChange={(e) => setDeviceId(Number(e.target.value))} aria-label="Device under test">
              {list.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.model}, Android {d.androidVersion}</option>)}
            </select>
            {report && (
              <div className="flex flex-1 items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(report.passed / 6) * 100}%` }} />
                </div>
                <span className="font-mono text-xs text-ink/60">{report.passed}/6 passed</span>
                {report.certified && <Badge tone="bg-emerald-100 text-emerald-800 ring-emerald-600/20">Phase 1 certified</Badge>}
              </div>
            )}
          </div>

          {loading && !report && <div className="space-y-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20" />)}</div>}

          {report && (
            <>
              <Card className="mb-5 bg-ink p-4 text-paper">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">Voice command under test</p>
                <p className="mt-1 font-display text-lg italic">“{report.command}”</p>
                <p className="mt-1 text-xs text-paper/55">Expected: Step 1 navigation (Level 2) auto-prepares · Step 2 outbound call (Level 3) shows a mandatory [Confirm plan] card.</p>
              </Card>
              <ol className={cn("space-y-3 transition-opacity", loading && "opacity-60")}>
                {report.items.map((it) => (
                  <li key={it.n}>
                    <Card className="pop flex items-start gap-4 p-4">
                      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold", TONE[it.status])}>
                        {it.status === "pass" ? <Icon name="check" className="h-4 w-4" /> : it.status === "fail" ? <Icon name="x" className="h-4 w-4" /> : it.n}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold">{it.n}. {it.title}</h3>
                        <p className="mt-0.5 text-sm text-ink/60">{it.detail}</p>
                      </div>
                      <div className="shrink-0 self-center"><ActionButton item={it} /></div>
                    </Card>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </div>
  );
}
