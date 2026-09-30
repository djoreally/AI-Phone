import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { capabilities, devices, plans, receipts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { Badge, Card, PageHeader, decisionTone, levelTone, timeAgo } from "@/components/ui";
import { EXECUTOR_LABEL, summarizeCompatibility } from "@/lib/engine";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const uid = user.id;

  const [deviceRows, capRows, planRows, receiptRows, receiptCount] = await Promise.all([
    db.select().from(devices).where(eq(devices.userId, uid)).orderBy(desc(devices.lastSeenAt)),
    db.select().from(capabilities).where(eq(capabilities.userId, uid)),
    db.select().from(plans).where(eq(plans.userId, uid)).orderBy(desc(plans.createdAt)).limit(5),
    db.select().from(receipts).where(eq(receipts.userId, uid)).orderBy(desc(receipts.createdAt)).limit(8),
    db.select({ n: sql<number>`count(*)::int` }).from(receipts).where(and(eq(receipts.userId, uid), eq(receipts.outcome, "success"))),
  ]);

  const ready = deviceRows.filter((d) => d.status === "ready").length;
  const needsApproval = deviceRows.filter((d) => d.status === "needs_approval").length;
  const installed = capRows.filter((c) => c.status === "installed").length;
  const unhealthy = capRows.filter((c) => c.status === "installed" && !c.healthy).length;
  const awaiting = planRows.filter((p) => p.status === "proposed");

  const stats = [
    { label: "Devices ready", value: ready, sub: needsApproval ? `${needsApproval} awaiting approval` : `${deviceRows.length} enrolled`, href: "/dashboard/devices" },
    { label: "Capabilities installed", value: installed, sub: unhealthy ? `${unhealthy} failing health check` : `${capRows.length} in catalog`, href: "/dashboard/capabilities" },
    { label: "Plans awaiting approval", value: awaiting.length, sub: `${planRows.length} recent plans`, href: "/dashboard/plans" },
    { label: "Successful actions", value: receiptCount[0]?.n ?? 0, sub: "with receipts", href: "/dashboard/receipts" },
  ];

  return (
    <div>
      <PageHeader eyebrow="Overview" title={`Good to see you, ${user.name.split(" ")[0]}.`} description="Here is what your robots understood, what needs your approval, and what they did." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="group rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 transition-colors hover:border-lime-400/40">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{s.label}</p>
            <p className="mt-2 text-3xl font-semibold text-white">{s.value}</p>
            <p className="mt-1 text-xs text-zinc-400 group-hover:text-zinc-300">{s.sub}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Needs your approval</h2>
              <Link href="/dashboard/plans" className="text-xs text-lime-300 hover:underline">All plans →</Link>
            </div>
            {awaiting.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">Nothing is waiting on you. Create a plan to put the robot to work.</p>
            ) : (
              <div className="space-y-3">
                {awaiting.map((p) => (
                  <Link key={p.id} href={`/dashboard/plans?open=${p.id}`} className="block rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 hover:border-amber-400/40">
                    <p className="line-clamp-2 text-sm text-zinc-100">“{p.request}”</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      <Badge tone="amber">Proposed</Badge>
                      <span>{p.steps.length} steps</span>
                      <span>·</span>
                      <span>{p.steps.filter((s) => s.decision !== "allow").length} need confirmation</span>
                      <span>·</span>
                      <span>{timeAgo(p.createdAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Receipt timeline</h2>
              <Link href="/dashboard/receipts" className="text-xs text-lime-300 hover:underline">All receipts →</Link>
            </div>
            {receiptRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">No actions yet. Every meaningful action will appear here with evidence.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-zinc-800 pl-5">
                {receiptRows.map((r) => (
                  <li key={r.id} className="relative">
                    <span className={`absolute -left-[26px] top-1.5 h-3 w-3 rounded-full border-2 border-zinc-950 ${r.outcome === "success" ? "bg-lime-400" : r.outcome === "blocked" ? "bg-rose-400" : "bg-amber-400"}`} />
                    <p className="text-sm text-zinc-100">{r.action}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                      <Badge tone={decisionTone(r.decision)}>{r.decision.replace("_", "-")}</Badge>
                      <Badge>{EXECUTOR_LABEL[r.executor] ?? r.executor}</Badge>
                      <Badge tone={levelTone(r.level)}>L{r.level}</Badge>
                      <span className="ml-1">{timeAgo(r.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Fleet</h2>
              <Link href="/dashboard/devices" className="text-xs text-lime-300 hover:underline">Manage →</Link>
            </div>
            {deviceRows.length === 0 ? (
              <p className="text-sm text-zinc-500">No devices enrolled.</p>
            ) : (
              <ul className="space-y-3">
                {deviceRows.slice(0, 5).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-100">{d.name}</p>
                      <p className="mono truncate text-[11px] text-zinc-500">{summarizeCompatibility(d)}</p>
                    </div>
                    <Badge tone={d.status === "ready" ? "lime" : d.status === "needs_approval" ? "amber" : d.status === "blocked" ? "rose" : "neutral"}>{d.status.replace("_", " ")}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-300">The central idea</h2>
            <ul className="space-y-1.5 text-sm">
              <li><span className="font-black text-lime-300">PLAYWRIGHT</span> <span className="text-zinc-400">is the butler.</span></li>
              <li><span className="font-black text-lime-300">ANDROID</span> <span className="text-zinc-400">is the body.</span></li>
              <li><span className="font-black text-lime-300">MCP</span> <span className="text-zinc-400">is the tool catalog.</span></li>
              <li><span className="font-black text-lime-300">POLICY</span> <span className="text-zinc-400">is the conscience.</span></li>
              <li><span className="font-black text-white">THE AI PHONE</span> <span className="text-zinc-400">is the robot.</span></li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/dashboard/studio" className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:border-lime-400/40">Open Provisioning Studio →</Link>
              <Link href="/dashboard/acceptance" className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:border-lime-400/40">Phase 1 acceptance →</Link>
            </div>
            <p className="mt-4 text-xs text-zinc-500">“Here is what I understood. Here are the tools I need. Here is what requires your approval. Here is what I did. Here is the evidence.”</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
