import Link from "next/link";
import type { ReactNode } from "react";

const nav = [
  ["Manifesto", "/manifesto"],
  ["Software", "/software"],
  ["Who it's for", "/who-its-for"],
  ["Use it well", "/usage"],
];

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-900/80 bg-zinc-950/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime-400 text-sm font-black text-zinc-950">AI</span>
          <span>
            <span className="block text-sm font-black tracking-wide text-white">AI PHONE</span>
            <span className="block text-[10px] uppercase tracking-[0.2em] text-zinc-500">The phone is the robot</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex">
          {nav.map(([label, href]) => (
            <Link key={href} href={href} className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-900 hover:text-white">{label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm text-zinc-300 hover:text-white sm:block">Sign in</Link>
          <Link href="/register" className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-lime-300">Open Studio</Link>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-zinc-900 bg-zinc-950">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime-400 text-xs font-black text-zinc-950">AI</span>
            <span className="font-bold text-white">AI Phone</span>
          </div>
          <p className="mt-4 max-w-md text-sm leading-6 text-zinc-500">A policy-governed Android runtime, provisioning studio, capability marketplace, and evidence system for delegated AI action.</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Explore</p>
          <div className="mt-4 grid gap-2 text-sm">{nav.map(([label, href]) => <Link key={href} href={href} className="text-zinc-400 hover:text-white">{label}</Link>)}</div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Studio</p>
          <div className="mt-4 grid gap-2 text-sm">
            <Link href="/register" className="text-zinc-400 hover:text-white">Create workspace</Link>
            <Link href="/login" className="text-zinc-400 hover:text-white">Sign in</Link>
            <Link href="/dashboard/runtime" className="text-zinc-400 hover:text-white">Runtime reference</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-zinc-900 px-6 py-5 text-center text-xs text-zinc-600">Built around one principle: the model may propose. Deterministic policy decides.</div>
    </footer>
  );
}

export function PublicPage({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-zinc-950 text-zinc-100"><PublicHeader />{children}<PublicFooter /></div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-black uppercase tracking-[0.24em] text-lime-300">{children}</p>;
}

export function SectionTitle({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <div className="max-w-3xl">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-base leading-7 text-zinc-400">{description}</p>}
    </div>
  );
}
