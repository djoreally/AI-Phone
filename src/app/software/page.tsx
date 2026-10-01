import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow, PublicPage, SectionTitle } from "@/components/public-site";

export const metadata: Metadata = {
  title: "The Software — AI Phone",
  description: "Understand the AI Phone software stack: Studio, Android runtime, policy broker, capabilities, telephony, browser execution, and receipts.",
};

const layers = [
  ["01", "AI Phone Studio", "The web control plane for provisioning devices, configuring policy, managing capabilities, reviewing plans, and inspecting receipts."],
  ["02", "Planner", "Turns a natural-language outcome into typed, inspectable steps. It proposes work; it does not grant itself permission."],
  ["03", "Policy Broker", "Deterministic risk floors evaluate each step as Read, Prepare, Act, or Restricted and decide Allow, Confirm, Deny, or Step-up."],
  ["04", "Android Runtime", "The native body. It handles device-local capabilities such as intents, camera flows, notifications, geofences, assistant roles, secure storage, and managed-device behavior."],
  ["05", "Capability Layer", "MCP servers, APIs, Android adapters, voice providers, and approved Playwright workers expose tools through typed contracts."],
  ["06", "Receipt System", "Every meaningful executed, blocked, denied, or cancelled action can produce a human-readable, cryptographically signed audit artifact."],
];

const executors = [
  ["ANDROID", "Device-local work", "Navigation, camera, notifications, reminders, roles, sensors, and OS-level integrations."],
  ["MCP", "Structured external capabilities", "Business systems, productivity apps, vertical SaaS, and third-party capability packages."],
  ["API", "Deterministic service calls", "Fast server-side actions where a stable API already exists."],
  ["PLAYWRIGHT", "The browser butler", "Approved websites that lack usable APIs, executed in an isolated browser worker with screenshots and action evidence."],
  ["VOICE", "Telephony", "Inbound and outbound calling with scoped, short-lived credentials and policy-gated consequential actions."],
];

export default function SoftwarePage() {
  return (
    <PublicPage>
      <main>
        <section className="grid-bg border-b border-zinc-900">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
            <Eyebrow>The software</Eyebrow>
            <h1 className="mt-5 max-w-5xl text-5xl font-black leading-[0.96] tracking-tight text-white sm:text-7xl">
              Not an assistant app.
              <br /><span className="text-lime-300">An execution system for a real phone.</span>
            </h1>
            <p className="mt-7 max-w-3xl text-lg leading-8 text-zinc-400">
              AI Phone combines a control plane, native Android runtime, deterministic authorization, pluggable capability layer, and evidence trail into one governed execution architecture.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <SectionTitle eyebrow="System model" title="Six layers. Clear authority." description="Each layer has a distinct job so probabilistic reasoning never quietly becomes permission." />
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {layers.map(([num, title, body]) => (
              <div key={num} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <div className="flex gap-4">
                  <span className="mono text-sm font-bold text-lime-300">{num}</span>
                  <div>
                    <h3 className="text-xl font-bold text-white">{title}</h3>
                    <p className="mt-2 leading-7 text-zinc-400">{body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-zinc-900 bg-zinc-900/30">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <SectionTitle eyebrow="Execution plane" title="One intent. Multiple ways to do the work." />
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {executors.map(([name, title, body]) => (
                <article key={name} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
                  <p className="text-xs font-black tracking-[0.18em] text-lime-300">{name}</p>
                  <h3 className="mt-2 text-lg font-bold text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-6 py-20 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-7">
            <Eyebrow>Policy floors</Eyebrow>
            <h2 className="mt-3 text-2xl font-black text-white">Risk is built into the contract.</h2>
            <div className="mt-6 space-y-4 text-sm leading-6 text-zinc-400">
              <p><strong className="text-white">Level 1 · Read</strong> — retrieve, inspect, summarize.</p>
              <p><strong className="text-white">Level 2 · Prepare</strong> — draft, stage, calculate, assemble.</p>
              <p><strong className="text-white">Level 3 · Act</strong> — send, call, submit, schedule; explicit confirmation is the floor.</p>
              <p><strong className="text-white">Level 4 · Restricted</strong> — sensitive financial, security, deletion, or physical-control actions; step-up authentication is the floor.</p>
            </div>
          </div>
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-7">
            <Eyebrow>Ownership</Eyebrow>
            <h2 className="mt-3 text-2xl font-black text-white">Bring the infrastructure you trust.</h2>
            <p className="mt-4 leading-7 text-zinc-400">
              The architecture is designed for BYOK and BYODB patterns: use your own supported model keys, connect your own PostgreSQL-compatible database, and keep policy/evidence logic independent from any one model provider.
            </p>
            <p className="mt-4 leading-7 text-zinc-400">The AI layer can change. The deterministic control contract should remain.</p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="rounded-3xl border border-lime-400/20 bg-lime-400/[0.06] p-8">
            <h2 className="text-3xl font-black text-white">See how to get the most out of it.</h2>
            <p className="mt-3 max-w-2xl text-zinc-400">AI Phone works best when you treat it as a governed operator: give it outcomes, connect useful capabilities, define explicit policies, and review receipts.</p>
            <div className="mt-6 flex gap-3">
              <Link href="/usage" className="rounded-xl bg-lime-400 px-5 py-3 text-sm font-bold text-zinc-950">Usage playbook →</Link>
              <Link href="/who-its-for" className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-bold text-white">Who it's for</Link>
            </div>
          </div>
        </section>
      </main>
    </PublicPage>
  );
}
