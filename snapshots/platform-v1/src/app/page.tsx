import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { LEVEL_META } from "@/lib/shared";

export const dynamic = "force-dynamic";

const STRIP = ["Software", "Content", "Knowledge", "Zero Stack", "Book", "Playwright", "AI Phone", "Reasoning Map", "My Way", "Archive", "Journal", "Research Ledger", "About the Project"];

const FLOW = ["User request", "AI planner", "Typed capability request", "Phone policy broker", "Allow / Confirm / Deny", "Android · API · MCP · Playwright", "Result and evidence", "Human-readable receipt"];

const PHASES = [
  ["01", "Prove the phone", "One Pixel, one voice provider. Launcher, plan display, policy gate, calling, maps, camera, receipts, provisioning wizard."],
  ["02", "Add the butler", "Hosted Playwright worker with approved domains, live session, screenshot evidence and download quarantine."],
  ["03", "MCP marketplace", "Five curated capabilities with install, OAuth, permissions, testing, updates and revocation."],
  ["04", "Managed devices", "Android Enterprise enrollment, inventory, organization policies, staged updates and lost-device handling."],
  ["05", "Open marketplace", "Only after permissions, publisher verification, isolation and incident response are proven."],
];

export default async function Home() {
  if (await getUser()) redirect("/dashboard");
  return (
    <div className="min-h-screen">
      <div className="overflow-x-auto border-b border-ink/10 bg-ink text-paper">
        <div className="mx-auto flex max-w-6xl items-center gap-5 whitespace-nowrap px-6 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em]">
          <span className="font-bold">Tyreese Burton</span>
          <span className="text-paper/40">A life in progress</span>
          {STRIP.map((s) => (
            <span key={s} className={s === "AI Phone" ? "text-accent" : "text-paper/50"}>
              {s}
            </span>
          ))}
        </div>
      </div>

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="font-display text-xl font-bold">AI Phone Studio</div>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-ink/5">
            Sign in
          </Link>
          <Link href="/signup" className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-2">
            Get started
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">Field guide / AI Phone</p>
        <h1 className="mt-4 font-display text-[clamp(3.5rem,11vw,9rem)] font-bold leading-[0.88] tracking-tight">
          The phone
          <br />
          is your <em className="text-accent">robot.</em>
        </h1>
        <p className="mt-8 max-w-2xl text-lg text-ink/70">
          Playwright is the browser butler. The AI Phone is the larger robot. Provision supported Android phones, install
          capabilities — not unrestricted code — and keep a receipt for every meaningful action.
        </p>
        <blockquote className="mt-8 max-w-2xl border-l-4 border-accent pl-5 font-display text-xl italic">
          The AI requests an outcome. Policy decides what is allowed. Android, Playwright, APIs, and MCP tools perform the work.
          Every meaningful action leaves a receipt.
        </blockquote>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/signup" className="rounded-lg bg-accent px-6 py-3 font-medium text-white hover:bg-accent-dark">
            Create your studio
          </Link>
          <Link href="/login" className="rounded-lg border border-ink/25 px-6 py-3 font-medium hover:bg-white">
            Explore the demo
          </Link>
        </div>
      </section>

      <section className="border-y border-ink/10 bg-ink py-16 text-paper">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 md:grid-cols-2">
          <div className="space-y-2 font-display text-3xl font-bold leading-tight sm:text-4xl">
            <p><span className="text-accent">Playwright</span> is the butler.</p>
            <p><span className="text-accent">Android</span> is the body.</p>
            <p><span className="text-accent">MCP</span> is the tool catalog.</p>
            <p><span className="text-accent">Policy</span> is the conscience.</p>
            <p>The <span className="text-accent">AI Phone</span> is the robot.</p>
          </div>
          <ol className="space-y-2 font-mono text-sm">
            {FLOW.map((f, i) => (
              <li key={f} className="flex items-center gap-3 rounded-lg border border-paper/15 px-4 py-2.5">
                <span className="text-accent">{String(i + 1).padStart(2, "0")}</span>
                {f}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-4xl font-bold">Four safety levels. Visible everywhere.</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((l) => (
            <div key={l} className="rounded-2xl border border-ink/10 bg-white/70 p-5">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-xs ring-1 ring-inset ${LEVEL_META[l].tone}`}>
                Level {l}
              </span>
              <h3 className="mt-3 font-display text-xl font-bold">{LEVEL_META[l].label}</h3>
              <p className="mt-1.5 text-sm text-ink/65">{LEVEL_META[l].blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-paper-2 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-4xl font-bold">Supported phones, honestly reported.</h2>
          <p className="mt-3 max-w-2xl text-ink/65">
            Android 12+, Google Play-certified, 6 GB RAM, current patches. Pixel first, Samsung next. Provisioning produces a
            compatibility report instead of a universal promise.
          </p>
          <pre className="mt-6 overflow-x-auto rounded-2xl bg-ink p-6 font-mono text-sm leading-relaxed text-paper">
{`Device: Pixel 9
Android: 16
AI Launcher: Supported
Assistant role: Supported
Managed-device mode: Supported
Twilio calling: Supported
Telnyx calling: Supported
Notification access: Awaiting approval
Local model: Limited by available memory

Result: READY WITH 1 REQUIRED APPROVAL`}
          </pre>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-4xl font-bold">Recommended build order</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {PHASES.map(([n, t, d]) => (
            <div key={n} className="rounded-2xl border border-ink/10 bg-white/70 p-5">
              <div className="font-mono text-sm text-accent">Phase {n}</div>
              <h3 className="mt-2 font-display text-lg font-bold">{t}</h3>
              <p className="mt-2 text-sm text-ink/65">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-ink/10 py-8 text-center font-mono text-xs uppercase tracking-widest text-ink/45">
        Tyreese Burton · A life in progress · AI Phone
      </footer>
    </div>
  );
}
