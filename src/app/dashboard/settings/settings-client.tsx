"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, Button, Card, Field, Input, PageHeader, useToast } from "@/components/ui";

export function SettingsClient({ user }: { user: { name: string; email: string; organization: string } }) {
  const toast = useToast();
  const router = useRouter();
  const [profile, setProfile] = useState({ name: user.name, organization: user.organization });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [busy, setBusy] = useState<"profile" | "pw" | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy("profile");
    try {
      await api("/api/auth/me", { method: "PATCH", json: profile });
      toast.push("Profile updated", "success");
      router.refresh();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(null);
    }
  }

  async function savePw(e: React.FormEvent) {
    e.preventDefault();
    setBusy("pw");
    try {
      await api("/api/auth/me", { method: "PATCH", json: pw });
      setPw({ currentPassword: "", newPassword: "" });
      toast.push("Password changed", "success");
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Account" title="Settings" description="Your identity is the root of every policy decision. Keep it accurate." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Profile</h2>
          <form onSubmit={saveProfile} className="mt-4 space-y-4">
            <Field label="Email"><Input value={user.email} disabled className="opacity-60" /></Field>
            <Field label="Name"><Input required value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
            <Field label="Organization"><Input value={profile.organization} onChange={(e) => setProfile({ ...profile, organization: e.target.value })} /></Field>
            <div className="flex justify-end"><Button type="submit" loading={busy === "profile"}>Save profile</Button></div>
          </form>
        </Card>
        <Card className="p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Password</h2>
          <form onSubmit={savePw} className="mt-4 space-y-4">
            <Field label="Current password"><Input type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
            <Field label="New password" hint="At least 8 characters"><Input type="password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
            <div className="flex justify-end"><Button type="submit" variant="secondary" loading={busy === "pw"}>Change password</Button></div>
          </form>
        </Card>
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Build order</h2>
          <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-5">
            {[
              ["Phase 1", "Prove the phone", "One Pixel, one voice provider, receipts."],
              ["Phase 2", "Add the butler", "Hosted Playwright, approved domains, evidence."],
              ["Phase 3", "MCP marketplace", "Five curated capabilities, OAuth, revocation."],
              ["Phase 4", "Managed devices", "Android Enterprise, inventory, staged updates."],
              ["Phase 5", "Open marketplace", "Only after isolation and review are proven."],
            ].map(([p, t, d]) => (
              <li key={p} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="text-[11px] uppercase tracking-widest text-lime-300">{p}</p>
                <p className="font-medium text-white">{t}</p>
                <p className="mt-1 text-xs text-zinc-500">{d}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
