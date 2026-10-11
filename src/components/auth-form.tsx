"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, Button, Field, Input } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: mode === "login" ? "demo@aiphone.studio" : "", password: mode === "login" ? "robot1234" : "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ next?: string }>(`/api/auth/${mode}`, { method: "POST", json: form });
      router.push(mode === "register" ? (result.next ?? "/dashboard/studio") : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">{mode === "login" ? "Welcome back" : "Create your AI Phone account"}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {mode === "login" ? "Sign in to your AI Phone control plane." : "Start clean, connect an Android phone, and provision it into your AI Phone."}
        </p>
      </div>
      {mode === "register" && (
        <Field label="Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" /></Field>
      )}
      <Field label="Email"><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></Field>
      <Field label="Password" hint={mode === "register" ? "At least 8 characters" : undefined}>
        <Input type="password" required minLength={mode === "register" ? 8 : undefined} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
      </Field>
      {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
      <Button type="submit" className="w-full" loading={loading}>{mode === "login" ? "Sign in" : "Create account & provision phone"}</Button>
      {mode === "login" && (
        <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
          Want to explore first? Demo credentials are pre-filled: <span className="mono text-zinc-200">demo@aiphone.studio</span> / <span className="mono text-zinc-200">robot1234</span>
        </p>
      )}
      <p className="text-center text-sm text-zinc-400">
        {mode === "login" ? (
          <>No account? <Link href="/register" className="text-lime-300 hover:underline">Create one</Link></>
        ) : (
          <>Already have an account? <Link href="/login" className="text-lime-300 hover:underline">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
