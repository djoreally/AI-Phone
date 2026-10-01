import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow, PublicPage, SectionTitle } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Manifesto — AI Phone",
  description: "Why AI Phone exists: a case for governed, understandable delegated action on real devices.",
};

const principles = [
  ["The model is not the authority.", "Inference is powerful, but probabilistic. It can understand intent, propose plans, and choose tools. It should not be the final security boundary for a device that can call, message, navigate, unlock, purchase, or modify real systems."],
  ["A phone is already a robot body.", "Modern Android phones already have cameras, microphones, radios, GPS, notifications, secure hardware, apps, connectivity, and a battery. We do not need to wait for a humanoid shell to give AI a useful physical presence."],
  ["Delegation needs receipts.", "If software acts for you, you should be able to see what it understood, what it asked permission to do, what actually happened, and what evidence proves it."],
  ["Autonomy should be graduated.", "Reading is not the same as sending. Drafting is not the same as purchasing. AI Phone treats capability risk as a first-class system property instead of relying on a blanket permission prompt."],
  ["The user should own the stack.", "Bring your own model keys, your own database, your own providers, and your own policies where practical. The product should increase leverage without turning infrastructure ownership into a hostage situation."],
  ["Tools are capabilities, not trust.", "MCP, APIs, Android intents, browser automation, and voice providers expand what the phone can do. None of them should bypass policy, identity, or evidence requirements."],
];

export default function ManifestoPage() {
  return (
    <PublicPage>
      <main>
        <section className="grid-bg border-b border-zinc-900">
          <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
            <Eyebrow>The AI Phone Manifesto</Eyebrow>
            <h1 className="mt-5 text-5xl font-black leading-[0.95] tracking-tight text-white sm:text-7xl">
              AI should be able to act.
              <br />
              <span className="text-lime-300">It should never act without structure.</span>
            </h1>
            <p className="mt-8 max-w-3xl text-xl leading-8 text-zinc-300">
              AI Phone was created because the next useful step after chat is not “give the model every permission.” The next step is to build a deterministic execution system around the model.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-20">
          <div className="max-w-3xl space-y-7 text-lg leading-8 text-zinc-300">
            <p>Software has spent decades teaching humans how to operate software. AI reverses that relationship. You state an outcome, the system interprets it, assembles a plan, selects capabilities, and performs work on your behalf.</p>
            <p>That is an enormous shift. It also creates a new responsibility: <strong className="text-white">the reasoning engine and the execution authority cannot be the same thing.</strong></p>
            <p>A language model is excellent at ambiguity. Security policy should not be ambiguous. A model can infer that you probably want an email sent. A deterministic broker should decide whether “send” is allowed, whether confirmation is mandatory, what identity is acting, which account may be used, and what receipt must be generated afterward.</p>
            <p>This is why AI Phone exists. Not to make a phone “chatty.” Not to bolt a voice assistant onto Android. Not to disguise browser automation as autonomy. The goal is to create a device that can accept delegated intent while remaining understandable, governable, inspectable, and owned by the person using it.</p>
          </div>
        </section>

        <section className="border-y border-zinc-900 bg-zinc-900/30">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <SectionTitle eyebrow="Six principles" title="The rules underneath the product." />
            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {principles.map(([title, body], i) => (
                <article key={title} className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6">
                  <p className="mono text-xs text-lime-300">0{i + 1}</p>
                  <h3 className="mt-3 text-xl font-bold text-white">{title}</h3>
                  <p className="mt-3 leading-7 text-zinc-400">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-20">
          <SectionTitle eyebrow="What we reject" title="Unlimited automation is not the goal." />
          <div className="mt-8 grid gap-5 text-base leading-7 text-zinc-400">
            <p><strong className="text-white">We reject prompt-only security.</strong> “Never do X” in a system prompt is guidance, not enforcement.</p>
            <p><strong className="text-white">We reject invisible execution.</strong> Consequential actions should not disappear into an agent log that normal users never see.</p>
            <p><strong className="text-white">We reject one giant permission bucket.</strong> Reading a calendar, drafting a message, placing a call, issuing a refund, and unlocking a door are not equivalent operations.</p>
            <p><strong className="text-white">We reject fake openness.</strong> A marketplace is not open if one vendor owns every model, database, runtime, and identity dependency.</p>
            <p><strong className="text-white">We reject autonomy as theater.</strong> The product should show the user exactly where simulation ends and real execution begins.</p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-24">
          <div className="rounded-3xl border border-lime-400/20 bg-lime-400/[0.06] p-8 sm:p-10">
            <Eyebrow>The thesis</Eyebrow>
            <blockquote className="mt-5 text-3xl font-black leading-tight text-white sm:text-4xl">
              “The AI requests an outcome. Policy decides what is allowed. The device and its tools perform the work. Every meaningful action leaves evidence.”
            </blockquote>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/software" className="rounded-xl bg-lime-400 px-5 py-3 text-sm font-bold text-zinc-950 hover:bg-lime-300">See the software →</Link>
              <Link href="/register" className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-bold text-white hover:bg-zinc-900">Open the Studio</Link>
            </div>
          </div>
        </section>
      </main>
    </PublicPage>
  );
}
