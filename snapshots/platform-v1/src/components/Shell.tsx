"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon, cn } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "dashboard" },
  { href: "/plans", label: "Assistant", icon: "sparkle" },
  { href: "/devices", label: "Devices", icon: "phone" },
  { href: "/acceptance", label: "Acceptance test", icon: "check" },
  { href: "/marketplace", label: "Marketplace", icon: "store" },
  { href: "/publisher", label: "Publisher studio", icon: "bolt" },
  { href: "/policies", label: "Policy broker", icon: "shield" },
  { href: "/receipts", label: "Receipts", icon: "receipt" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export default function Shell({ user, children }: { user: { name: string; email: string }; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-ink text-paper">
      <Link href="/dashboard" className="flex items-center gap-3 px-5 py-6" onClick={() => setOpen(false)}>
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-white">
          <Icon name="phone" className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="font-display text-lg font-bold">AI Phone</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/50">Studio</div>
        </div>
      </Link>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((n) => {
          const active = pathname === n.href || pathname.startsWith(n.href + "/");
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                active ? "bg-paper text-ink" : "text-paper/65 hover:bg-paper/10 hover:text-paper",
              )}
            >
              <Icon name={n.icon} className="h-[18px] w-[18px]" />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="mx-3 mb-3 rounded-xl bg-paper/5 p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-accent">The rule</p>
        <p className="mt-1.5 text-xs leading-relaxed text-paper/70">
          The AI requests. Policy decides. Android performs. Every action leaves a receipt.
        </p>
      </div>
      <div className="border-t border-paper/10 p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper/10 font-display text-sm font-bold">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-paper/50">{user.email}</div>
          </div>
          <button onClick={logout} title="Sign out" className="rounded-md p-2 text-paper/60 hover:bg-paper/10 hover:text-paper">
            <Icon name="logout" className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-ink/10 bg-paper/90 px-4 py-3 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-md p-2 hover:bg-ink/5" aria-label="Open menu">
          <Icon name="menu" />
        </button>
        <div className="font-display text-lg font-bold">AI Phone Studio</div>
        <div className="w-9" />
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <aside className="pop absolute inset-y-0 left-0 w-72 max-w-[85%]">{sidebar}</aside>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}
