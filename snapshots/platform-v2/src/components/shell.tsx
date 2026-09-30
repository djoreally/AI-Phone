"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cx } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "▦" },
  { href: "/dashboard/plans", label: "Plans", icon: "⟶" },
  { href: "/dashboard/devices", label: "Devices", icon: "▭" },
  { href: "/dashboard/studio", label: "Provisioning Studio", icon: "⟲" },
  { href: "/dashboard/capabilities", label: "Marketplace", icon: "✦" },
  { href: "/dashboard/policies", label: "Policy broker", icon: "⛨" },
  { href: "/dashboard/receipts", label: "Receipts", icon: "≣" },
  { href: "/dashboard/acceptance", label: "Phase 1 acceptance", icon: "◈" },
  { href: "/dashboard/runtime", label: "Runtime reference", icon: "</>" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙" },
];

export function Shell({ user, children }: { user: { name: string; email: string; organization: string }; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.map((n) => {
        const active = n.href === "/dashboard" ? pathname === n.href : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={cx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-lime-400/10 text-lime-200 border border-lime-400/20" : "text-zinc-400 hover:bg-zinc-800/80 hover:text-white border border-transparent",
            )}
          >
            <span className="w-4 text-center text-base leading-none">{n.icon}</span>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/dashboard" className="flex items-center gap-2 px-1">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime-400 text-xs font-black text-zinc-950">AI</span>
      <div>
        <p className="text-sm font-semibold leading-none text-white">AI Phone Studio</p>
        <p className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">The phone is your robot</p>
      </div>
    </Link>
  );

  const userBox = (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="truncate text-sm font-medium text-white">{user.name}</p>
      <p className="truncate text-xs text-zinc-500">{user.organization}</p>
      <button onClick={logout} className="mt-2 text-xs text-zinc-400 hover:text-rose-300">Sign out →</button>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r border-zinc-800 bg-zinc-950 p-4 lg:flex">
        {brand}
        {nav}
        {userBox}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="flex h-full w-72 flex-col gap-6 border-r border-zinc-800 bg-zinc-950 p-4" onClick={(e) => e.stopPropagation()}>
            {brand}
            {nav}
            {userBox}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg border border-zinc-800 p-2 text-zinc-300" aria-label="Open navigation">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          {brand}
          <span className="w-9" />
        </header>
        <main className="grid-bg flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
