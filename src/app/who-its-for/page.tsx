import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow, PublicPage, SectionTitle } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Who AI Phone Is For",
  description: "AI Phone is for operators, field teams, founders, agencies, developers, and organizations that need AI to act through governed real-world systems.",
};

const groups = [
  ["Owner-operators", "You run the business and still do the work. AI Phone can become a controlled operational layer for calls, scheduling, customer context, navigation, reminders, and repetitive admin without requiring a separate desktop workflow."],
  ["Field service teams", "Technicians, inspectors, mobile service businesses, property teams, route workers, and fleet operators can use the phone they already carry as a governed execution endpoint."],
  ["Founders & builders", "If you are building agentic software, AI Phone provides a reference architecture for separating reasoning, policy, execution, identity, and receipts."],
  ["Agencies & operators", "Teams that manage many client systems can connect capabilities while keeping consequential actions visible, scoped, and attributable."],
  ["IT & managed-device teams", "Android Enterprise and policy-oriented deployment patterns make the architecture useful for fleets of dedicated work phones, kiosks, and managed operational devices."],
  ["AI power users", "People who have outgrown chat-only workflows and want an AI that can actually do things—but without giving a model silent, unrestricted control."],
];

export default function WhoItsForPage() {
  return (
    <PublicPage>
      <main>
        <section className="grid-bg border-b border-zinc-900">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
            <Eyebrow>Who it's for</Eyebrow>
            <h1 className="mt-5 max-w-5xl text-5xl font-black leading-[0.96] tracking-tight text-white sm:text-7xl">
              For people who need AI
              <br /><span className="text-lime-300">outside the chat window.</span>
            </h1>
            <p className="mt-7 max-w-3xl text-lg leading-8 text-zinc-400">
              AI Phone is most useful when work crosses between software, communication, physical location, and real-world action.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <SectionTitle eyebrow="Primary users" title="A device for operators, not spectators." />
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {groups.map(([title, body]) => (
              <article key={title} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h2 className="text-xl font-bold text-white">{title}</h2>
                <p className="mt-3 leading-7 text-zinc-400">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-zinc-900 bg-zinc-900/30">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <SectionTitle eyebrow="A simple test" title="AI Phone fits when the job sounds like this:" />
            <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-950 p-7 sm:p-10">
              <p className="text-2xl font-semibold leading-10 text-zinc-200">
                “Call the customer and tell them I'm twenty minutes away. Open the work order. Navigate me there. When I arrive, remind me to take inspection photos. Then prepare the estimate—but don't send anything until I approve it.”
              </p>
              <p className="mt-6 text-sm leading-6 text-zinc-500">
                That request crosses voice, business data, maps, device-local reminders, camera workflow, customer data, and a consequential approval boundary. That is the kind of multi-system work AI Phone is designed around.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20">
          <SectionTitle eyebrow="Not the target" title="It is intentionally overkill for some jobs." />
          <div className="mt-7 max-w-3xl space-y-4 leading-7 text-zinc-400">
            <p>If all you need is question answering, use a chatbot.</p>
            <p>If all you need is a single API automation, use a workflow or server function.</p>
            <p>If all you need is browser automation, use a browser agent.</p>
            <p><strong className="text-white">AI Phone becomes valuable when those worlds converge on a real person, a real device, and consequential action.</strong></p>
          </div>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/usage" className="rounded-xl bg-lime-400 px-5 py-3 text-sm font-bold text-zinc-950">Learn how to use it →</Link>
            <Link href="/register" className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-bold text-white">Open Studio</Link>
          </div>
        </section>
      </main>
    </PublicPage>
  );
}
