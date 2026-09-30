"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Field, Modal, PageHeader, Skeleton, inputCls, useToast } from "@/components/ui";
import { api, useApi } from "@/lib/client";

type Me = { id: number; name: string; email: string };

export default function SettingsPage() {
  const { data, setData, loading } = useApi<Me>("/api/auth/me");
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data) setName(data.name);
  }, [data]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const me = await api<Me>("/api/auth/me", { method: "PATCH", body: { name } });
      setData(me);
      toast("Profile saved");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", "err");
    }
    setSaving(false);
  }

  async function reset() {
    setResetting(true);
    try {
      await api("/api/auth/me", { method: "PATCH", body: { action: "reset_demo" } });
      toast("Demo workspace restored");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Reset failed", "err");
    }
    setResetting(false);
  }

  async function deleteAccount() {
    await api("/api/auth/me", { method: "DELETE" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow="Account" title="Settings" />

      <Card className="p-6">
        <h2 className="font-display text-xl font-bold">Profile</h2>
        {loading || !data ? (
          <Skeleton className="mt-4 h-24" />
        ) : (
          <form onSubmit={save} className="mt-4 space-y-4">
            <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
            <Field label="Email"><input className={inputCls} value={data.email} disabled /></Field>
            <Button type="submit" variant="accent" loading={saving} disabled={!name.trim() || name === data.name}>Save profile</Button>
          </form>
        )}
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-xl font-bold">Sample data</h2>
        <p className="mt-1 text-sm text-ink/60">Replace your devices, policies, plans and receipts with the original demo fleet. Useful after experimenting.</p>
        <Button variant="outline" className="mt-4" loading={resetting} onClick={reset}>Restore demo workspace</Button>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-xl font-bold">Emergency calling & consent</h2>
        <p className="mt-1 text-sm text-ink/60">
          Wi-Fi calling may not support emergency calls like a SIM-based phone. Each assigned number needs a registered emergency address, and recording or transcription requires consent from everyone on the call. Phones only receive short-lived, device-scoped voice tokens — never master provider credentials.
        </p>
      </Card>

      <Card className="mt-6 border-red-200 p-6">
        <h2 className="font-display text-xl font-bold text-red-800">Danger zone</h2>
        <p className="mt-1 text-sm text-ink/60">Permanently delete your account and everything in it.</p>
        <Button variant="danger" className="mt-4" onClick={() => setConfirmDelete(true)}>Delete account</Button>
      </Card>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete your account?">
        <p className="text-sm text-ink/70">All devices, policies, plans, and receipts will be permanently removed. This can&apos;t be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep account</Button>
          <Button variant="danger" onClick={deleteAccount}>Delete forever</Button>
        </div>
      </Modal>
    </div>
  );
}
