"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Icon, inputCls } from "@/components/ui";
import { api } from "@/lib/client";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"form" | "demo" | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("form");
    try {
      await api(`/api/auth/${mode}`, { method: "POST", body: { name, email, password } });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(null);
    }
  }

  async function demo() {
    setError(null);
    setBusy("demo");
    try {
      await api("/api/auth/demo", { method: "POST" });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(null);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink p-12 text-paper lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-white">
            <Icon name="phone" />
          </div>
          <span className="font-display text-xl font-bold">AI Phone Studio</span>
        </Link>
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">Field guide / AI Phone</p>
          <h2 className="mt-4 font-display text-6xl font-bold leading-[0.95]">
            The phone
            <br />
            is your <em className="text-accent">robot.</em>
          </h2>
          <p className="mt-6 max-w-md text-paper/70">
            Here is what I understood. Here are the tools I need. Here is what requires your approval. Here is what I did.
            Here is the evidence.
          </p>
        </div>
        <div className="font-mono text-xs uppercase tracking-widest text-paper/40">Tyreese Burton · A life in progress</div>
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-flex items-center gap-2 font-display text-lg font-bold lg:hidden">
            <Icon name="phone" /> AI Phone Studio
          </Link>
          <h1 className="font-display text-3xl font-bold">{mode === "login" ? "Welcome back" : "Create your studio"}</h1>
          <p className="mt-1.5 text-sm text-ink/60">
            {mode === "login" ? "Sign in to manage your robot phones." : "Sign up and get a fully seeded demo fleet to explore."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <Field label="Name">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required autoComplete="name" />
              </Field>
            )}
            <Field label="Email">
              <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="email" />
            </Field>
            <Field label="Password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
              <input
                type="password"
                className={inputCls}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </Field>
            {error && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}
            <Button type="submit" variant="accent" className="w-full" loading={busy === "form"}>
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-ink/40">
            <div className="h-px flex-1 bg-ink/15" /> OR <div className="h-px flex-1 bg-ink/15" />
          </div>
          <Button variant="outline" className="w-full" onClick={demo} loading={busy === "demo"}>
            <Icon name="bolt" className="h-4 w-4" /> Explore the demo workspace
          </Button>
          <p className="mt-2 text-center text-xs text-ink/50">
            Demo login: <span className="font-mono">demo@aiphone.dev</span> / <span className="font-mono">demo1234</span>
          </p>

          <p className="mt-8 text-center text-sm text-ink/60">
            {mode === "login" ? (
              <>
                New here?{" "}
                <Link href="/signup" className="font-semibold text-accent hover:underline">
                  Create an account
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link href="/login" className="font-semibold text-accent hover:underline">
                  Sign in
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
