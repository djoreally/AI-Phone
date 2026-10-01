import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Eyebrow, PublicPage, SectionTitle } from "@/components/public-site";

export const dynamic = "force-dynamic";

const pillars = [
  ["PLAYWRIGHT", "is the butler", "Operates approved browser-only websites in an isolated worker with screenshots and an action log."],
  ["ANDROID", "is the body", "Uses native device capabilities for calls, camera, navigation, notifications, reminders, and managed-device functions."],
  ["MCP", "is the tool catalog", "Discovers structured external capabilities. It expands reach, but it never replaces policy."],
  ["POLICY", "is the conscience", "Deterministic Allow / Confirm / Deny / Step-up decisions sit between AI intent and execution."],
];

const lifecycle = [
  ["1", "You state the outcome", "Speak or type the job you want completed."],
  ["2", "The planner decomposes it", "The model turns the outcome into typed capability requests."],
  ["3", "Policy evaluates every step", "Risk floors determine what can run, what must pause, and what is forbidden."],
  ["4", "The right executor does the work", "Android, MCP, APIs, Playwright, or voice execute within their scoped authority."],
  ["5", "Evidence comes back", "Receipts record what happened, what was blocked, and what proof exists."],
];

const useCases = [
  ["Field work", "Call the customer, open the work order, navigate to the job, remind me to capture photos, prepare the estimate."],
  ["Customer operations", "Review appointments, draft outreach, place approved calls, schedule follow-ups, and log evidence."],
  ["Managed devices", "Provision work phones, apply policy, verify runtime status, and certify device readiness."],
  ["Business systems", "Use MCP and APIs to connect vertical software without giving the model unrestricted credentials."],
  ["Browser-only portals", "Send approved web tasks to a Playwright worker instead of handing raw browser control to the phone."],
  ["Personal automation", "Create reminders, navigation, summaries, and low-risk device actions that stay inside explicit policy."],
];

const faq = [
  ["Is AI Phone another voice assistant?", "No. Voice can be one interface and telephony can be one capability, but the product is a governed execution architecture for Android devices."],
  ["Does the AI get unrestricted control of my phone?", "No. The model proposes actions. Deterministic policy decides whether each action can run, requires confirmation, needs step-up authentication, or is denied."],
  ["Why use a phone instead of a dedicated robot?", "A modern phone already has secure hardware, cameras, radios, GPS, microphones, apps, connectivity, a battery, and an operating system. It is an unusually capable existing robot body."],
  ["What is a receipt?", "A receipt is a human-readable audit record for an action or attempted action: what was requested, the policy decision, executor, result, evidence, and signature information."],
  ["Can I use my own AI provider or database?", "The architecture is designed around BYOK and BYODB patterns so model and data infrastructure can remain replaceable instead of becoming the authority layer."],
];

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <PublicPage>
      <main>
        <section className="grid-bg overflow-hidden border-b border-zinc-900">
          <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 sm:py-28 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
            <div>
              <Eyebrow>Governed AI execution on Android</Eyebrow>
              <h1 className="mt-5 text-5xl font-black leading-[0.92] tracking-tight text-white sm:text-7xl xl:text-8xl">
                THE PHONE
                <br />
                IS YOUR <span className="italic text-lime-300">ROBOT.</span>
              </h1>
              <p className="mt-7 max-w-3xl text-lg leading-8 text-zinc-300 sm:text-xl">
                AI Phone turns a supported Android device into a policy-governed AI execution endpoint: a device that can understand outcomes, select tools, ask for approval when required, perform real work, and leave evidence behind.
              </p>
              <p className="mt-4 max-w-3xl leading-7 text-zinc-500">
                It is part control plane, part Android runtime, part capability marketplace, part telephony client, and part audit system. The AI reasons. Deterministic software controls authority.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/register" className="rounded-xl bg-lime-400 px-6 py-3 text-sm font-black text-zinc-950 shadow-[0_12px_40px_-12px_rgba(163,230,53,0.7)] hover:bg-lime-300">Open AI Phone Studio</Link>
                <Link href="/manifesto" className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-6 py-3 text-sm font-bold text-zinc-100 hover:border-zinc-600">Read the manifesto</Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs uppercase tracking-[0.15em] text-zinc-600">
                <span>Android runtime</span><span>Policy broker</span><span>MCP</span><span>Playwright</span><span>Voice</span><span>Receipts</span>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-12 rounded-full bg-lime-400/5 blur-3xl" />
              <div className="relative rounded-3xl border border-zinc-800 bg-zinc-950/90 p-5 shadow-2xl">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                  <div>
                    <p className="text-xs font-bold text-white">LIVE PLAN</p>
                    <p className="mt-1 text-xs text-zinc-500">Intent → policy → execution → evidence</p>
                  </div>
                  <span className="rounded-md border border-lime-400/20 bg-lime-400/10 px-2 py-1 text-[10px] font-bold text-lime-300">GOVERNED</span>
                </div>
                <div className="mt-5 rounded-xl bg-zinc-900 p-4 text-sm leading-6 text-zinc-300">
                  “Call John and tell him I'm 20 minutes away. Open WO-1842. Navigate to 125 Main Street. When I arrive, remind me to take four photos. Prepare the estimate.”
                </div>
                <div className="mt-5 space-y-2">
                  {[
                    ["Voice", "Call John", "CONFIRM"],
                    ["MCP", "Open WO-1842", "ALLOW"],
                    ["Android", "Start navigation", "ALLOW"],
                    ["Android", "Create arrival reminder", "ALLOW"],
                    ["MCP", "Prepare estimate", "CONFIRM"],
                  ].map(([executor, action, decision]) => (
                    <div key={action} className="grid grid-cols-[76px_1fr_auto] items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-3 text-xs">
                      <span className="mono text-zinc-500">{executor}</span>
                      <span className="text-zinc-200">{action}</span>
                      <span className={decision === "ALLOW" ? "text-lime-300" : "text-amber-300"}>{decision}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-xl border border-zinc-800 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">After execution</p>
                  <p className="mt-2 text-sm text-zinc-300">5 actions → 5 receipts → evidence attached → user can inspect exactly what happened.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-20">
          <SectionTitle eyebrow="The idea" title="AI needs a control system, not just more permissions." description="Most agent products focus on making the model capable. AI Phone focuses equally on making capability governable." />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pillars.map(([k, v, d]) => (
              <article key={k} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <p className="text-xs font-black tracking-[0.2em] text-lime-300">{k}</p>
                <h3 className="mt-1 text-xl font-bold text-white">{v}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{d}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-zinc-900 bg-zinc-900/30">
          <div className="mx-auto max-w-7xl px-6 py-20">
            <SectionTitle eyebrow="How it works" title="Natural language in. Governed action out." />
            <div className="mt-10 grid gap-3 lg:grid-cols-5">
              {lifecycle.map(([n, title, body]) => (
                <article key={n} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
                  <span className="mono text-xs font-bold text-lime-300">{n}</span>
                  <h3 className="mt-3 font-bold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">{body}</p>
                </article>
              ))}
            </div>
            <div className="mt-10 flex justify-center">
              <Link href="/software" className="text-sm font-bold text-lime-300 hover:text-lime-200">Explore the full software architecture →</Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
            <div>
              <SectionTitle eyebrow="Why it was created" title="Chat was never the final interface." />
              <p className="mt-5 leading-7 text-zinc-400">
                The useful endpoint of AI is not a smarter text box. It is software that can accept an outcome, understand context, operate across systems, and help in the physical world without hiding what it is doing.
              </p>
              <p className="mt-4 leading-7 text-zinc-400">
                Phones are already in our pockets, already authenticated to us, already connected to the services we use, and already packed with sensors and secure hardware. AI Phone starts there.
              </p>
              <Link href="/manifesto" className="mt-6 inline-block text-sm font-bold text-lime-300 hover:text-lime-200">Why this exists →</Link>
            </div>
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-7">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Core axiom</p>
              <blockquote className="mt-5 text-3xl font-black leading-tight text-white sm:text-4xl">
                Prompting is instruction.
                <br />
                <span className="text-lime-300">Authority is architecture.</span>
              </blockquote>
              <p className="mt-5 max-w-2xl leading-7 text-zinc-400">
                An LLM can suggest. A typed runtime validates. Policy authorizes. A scoped executor acts. Evidence verifies. That separation is what turns an impressive demo into a system you can actually trust with work.
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-zinc-900 bg-zinc-900/30">
          <div className="mx-auto max-w-7xl px-6 py-20">
            <SectionTitle eyebrow="Where it fits" title="Built for work that crosses boundaries." description="The strongest use cases combine communication, business systems, device capabilities, and real-world context." />
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {useCases.map(([title, body]) => (
                <article key={title} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
                  <h3 className="text-lg font-bold text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">{body}</p>
                </article>
              ))}
            </div>
            <Link href="/who-its-for" className="mt-8 inline-block text-sm font-bold text-lime-300">See who AI Phone is for →</Link>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-20">
          <SectionTitle eyebrow="Control model" title="Four risk levels. Hard floors." description="Custom policy can make the system stricter. It cannot silently weaken the minimum controls for consequential actions." />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["L1", "READ", "Auto-allow", "Inspect, retrieve, summarize."],
              ["L2", "PREPARE", "Auto-allow", "Draft, stage, assemble local state."],
              ["L3", "ACT", "Confirmation floor", "Send, call, submit, schedule."],
              ["L4", "RESTRICTED", "Step-up floor", "Sensitive financial, security, deletion, or physical-control actions."],
            ].map(([level, name, gate, body]) => (
              <div key={level} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-black text-lime-300">{level}</span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">{gate}</span>
                </div>
                <h3 className="mt-4 font-bold text-white">{name}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-20">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-8">
              <Eyebrow>Own the stack</Eyebrow>
              <h2 className="mt-3 text-3xl font-black text-white">BYOK. BYODB. Replaceable intelligence.</h2>
              <p className="mt-4 leading-7 text-zinc-400">
                Model providers and databases should be infrastructure choices—not the security model. AI Phone is designed so reasoning providers can change while policy, execution contracts, and receipts remain stable.
              </p>
            </div>
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-8">
              <Eyebrow>Maximize usage</Eyebrow>
              <h2 className="mt-3 text-3xl font-black text-white">Start narrow. Earn autonomy.</h2>
              <p className="mt-4 leading-7 text-zinc-400">
                Begin with one real workflow, connect only the capabilities it needs, review plans and receipts, then expand low-risk automation as the system proves itself.
              </p>
              <Link href="/usage" className="mt-5 inline-block text-sm font-bold text-lime-300">Read the usage playbook →</Link>
            </div>
          </div>
        </section>

        <section className="border-y border-zinc-900 bg-zinc-900/30">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <SectionTitle eyebrow="FAQ" title="The important questions." />
            <div className="mt-9 divide-y divide-zinc-800 border-y border-zinc-800">
              {faq.map(([q, a]) => (
                <details key={q} className="group py-5">
                  <summary className="cursor-pointer list-none font-bold text-white">{q}<span className="float-right text-zinc-600 group-open:text-lime-300">+</span></summary>
                  <p className="mt-3 max-w-3xl leading-7 text-zinc-400">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-20">
          <div className="rounded-3xl border border-lime-400/20 bg-lime-400/[0.06] px-7 py-10 sm:px-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <Eyebrow>Build from intent, not clicks</Eyebrow>
                <h2 className="mt-3 text-4xl font-black text-white">Give the phone a job. Keep the authority.</h2>
                <p className="mt-4 max-w-2xl leading-7 text-zinc-400">Open the Studio to explore provisioning, policy, capabilities, plans, receipts, acceptance testing, and the Android runtime reference.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/register" className="rounded-xl bg-lime-400 px-6 py-3 text-sm font-black text-zinc-950">Open Studio</Link>
                <Link href="/software" className="rounded-xl border border-zinc-700 px-6 py-3 text-sm font-bold text-white">Explore software</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicPage>
  );
}
