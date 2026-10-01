import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow, PublicPage, SectionTitle } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Usage Playbook — AI Phone",
  description: "How to maximize AI Phone: connect the right capabilities, write useful policies, delegate outcomes, and use receipts to improve automation safely.",
};

const steps = [
  ["1", "Start with one device and one real workflow", "Do not begin with fifty automations. Pick a repeatable job that already happens on the phone: arrival calls, field dispatch, appointment follow-up, inspections, route work, or customer updates."],
  ["2", "Connect only the capabilities the workflow needs", "Use Android for device-local work, APIs for deterministic services, MCP for structured external tools, Playwright only where no practical API exists, and voice for telephony."],
  ["3", "Define risk before convenience", "Decide what should auto-run, what must pause for confirmation, what should require step-up authentication, and what the system should simply refuse."],
  ["4", "Delegate outcomes, not button presses", "Ask for the result you want. Let the planner decompose it. A useful request sounds like a job description, not a macro: prepare the estimate and ask me before sending it."],
  ["5", "Inspect the plan before expanding autonomy", "If the generated steps are consistently correct, you can reduce friction on low-risk work. Never use fewer controls merely because the AI seems confident."],
  ["6", "Treat receipts as operating data", "Review what executed, what was blocked, what required intervention, and where the system misunderstood intent. Receipts are not just compliance artifacts—they are feedback for better workflows."],
  ["7", "Add capabilities incrementally", "A new tool changes the system’s action surface. Install capabilities deliberately, review requested permissions, restrict domains, and keep sensitive actions behind hard risk floors."],
  ["8", "Use BYOK/BYODB where ownership matters", "Separate the product’s execution architecture from any one model or database vendor. This makes it easier to control costs, migrate providers, and keep operational data where you want it."],
];

export default function UsagePage() {
  return (
    <PublicPage>
      <main>
        <section className="grid-bg border-b border-zinc-900">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
            <Eyebrow>Usage playbook</Eyebrow>
            <h1 className="mt-5 max-w-5xl text-5xl font-black leading-[0.96] tracking-tight text-white sm:text-7xl">
              Get more autonomy
              <br /><span className="text-lime-300">by adding more structure.</span>
            </h1>
            <p className="mt-7 max-w-3xl text-lg leading-8 text-zinc-400">
              The best AI Phone setup is not the one with the most tools. It is the one where the device knows exactly what it may do, when it must ask, and what proof it must leave behind.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <SectionTitle eyebrow="Eight-step playbook" title="How to maximize useful delegation." />
          <div className="mt-10 grid gap-4">
            {steps.map(([n, title, body]) => (
              <article key={n} className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 sm:grid-cols-[52px_1fr]">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-lime-400/20 bg-lime-400/10 text-sm font-black text-lime-300">{n}</div>
                <div>
                  <h2 className="text-xl font-bold text-white">{title}</h2>
                  <p className="mt-2 max-w-4xl leading-7 text-zinc-400">{body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-zinc-900 bg-zinc-900/30">
          <div className="mx-auto grid max-w-6xl gap-6 px-6 py-20 lg:grid-cols-2">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7">
              <Eyebrow>Good delegation</Eyebrow>
              <div className="mono mt-5 whitespace-pre-wrap text-sm leading-7 text-zinc-300">
                Review today’s appointments.{"\n"}
                Call customers whose arrival window changed.{"\n"}
                Draft follow-up messages for anyone we could not reach.{"\n"}
                Do not send a text without asking me first.{"\n"}
                Give me a receipt for every attempted contact.
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7">
              <Eyebrow>Weak delegation</Eyebrow>
              <div className="mono mt-5 whitespace-pre-wrap text-sm leading-7 text-zinc-300">
                Handle everything.{"\n\n"}
                Why it is weak:{"\n"}
                • unclear objective{"\n"}
                • unclear boundaries{"\n"}
                • no data scope{"\n"}
                • no approval model{"\n"}
                • no evidence requirement{"\n"}
                • no useful stopping condition
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <SectionTitle eyebrow="Operating principle" title="Automate the predictable. Escalate the consequential." description="The point is not to remove the human. The point is to spend human attention only where judgment, consent, or accountability is actually required." />
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/register" className="rounded-xl bg-lime-400 px-5 py-3 text-sm font-bold text-zinc-950">Create a workspace →</Link>
            <Link href="/manifesto" className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-bold text-white">Read the manifesto</Link>
          </div>
        </section>
      </main>
    </PublicPage>
  );
}
