import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const pillars = [
  { k: "PLAYWRIGHT", v: "is the butler", d: "Operates browser-only websites with approved domains, screenshots, and a full action log." },
  { k: "ANDROID", v: "is the body", d: "Calls, camera, navigation, notifications, Bluetooth — through Android APIs, not hacks." },
  { k: "MCP", v: "is the tool catalog", d: "A common contract for discovering capabilities. Never the security system." },
  { k: "POLICY", v: "is the conscience", d: "Allow / Confirm / Deny / Step-up. Level 4 can never become silently autonomous." },
];

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="grid-bg min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime-400 text-sm font-black text-zinc-950">AI</span>
          <span className="text-sm font-semibold tracking-wide text-white">AI PHONE STUDIO</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:text-white">Sign in</Link>
          <Link href="/register" className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-lime-300">Get started</Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12 sm:pt-20">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-lime-300">Field guide / AI Phone</p>
        <h1 className="mt-4 max-w-4xl text-5xl font-black leading-[0.95] tracking-tight text-white sm:text-7xl">
          THE PHONE
          <br />
          IS YOUR <span className="italic text-lime-300">ROBOT.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-zinc-400">
          More than a launcher: a provisioning studio, AI runtime, calling client, and capability marketplace that turns supported Android phones into controlled robots.
        </p>
        <blockquote className="mt-8 max-w-3xl border-l-2 border-lime-400 pl-5 text-base text-zinc-200">
          The AI requests an outcome. Policy decides what is allowed. Android, Playwright, APIs, and MCP tools perform the work. <strong className="text-white">Every meaningful action leaves a receipt.</strong>
        </blockquote>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/register" className="rounded-xl bg-lime-400 px-6 py-3 text-sm font-semibold text-zinc-950 shadow-[0_12px_40px_-12px_rgba(163,230,53,0.7)] hover:bg-lime-300">Open the Studio</Link>
          <Link href="/login" className="rounded-xl border border-zinc-700 bg-zinc-900 px-6 py-3 text-sm font-semibold text-zinc-100 hover:bg-zinc-800">Try the demo workspace</Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p) => (
            <div key={p.k} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <p className="text-xs font-black tracking-[0.2em] text-lime-300">{p.k}</p>
              <p className="text-lg font-semibold text-white">{p.v}</p>
              <p className="mt-2 text-sm text-zinc-400">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-24 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Safe execution path</p>
          <pre className="mono mt-4 text-sm leading-7 text-zinc-300">
{`User request
    ↓
AI planner
    ↓
Typed capability request
    ↓
Phone policy broker
    ↓
Allow / Confirm / Deny
    ↓
Android · API · MCP · Playwright
    ↓
Result and evidence
    ↓
Human-readable receipt`}
          </pre>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Compatibility report</p>
          <pre className="mono mt-4 text-sm leading-7 text-zinc-300">
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

      <footer className="border-t border-zinc-900 px-6 py-8 text-center text-xs text-zinc-600">
        Tyreese Burton · A life in progress · The goal is not unlimited automation. The goal is understandable delegated action.
      </footer>
    </main>
  );
}
