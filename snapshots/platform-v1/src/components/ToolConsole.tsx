"use client";

import { useState } from "react";
import { Badge, Button, DECISION_TONE, Field, LevelBadge, inputCls, cn } from "@/components/ui";
import { ApiError, api } from "@/lib/client";
import type { CapabilityDTO } from "@/lib/shared";

type Tool = CapabilityDTO["tools"][number];

function skeleton(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return null;
  const s = schema as { type?: string; properties?: Record<string, unknown> };
  if (s.type === "object") return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, skeleton(v)]));
  if (s.type === "string") return "";
  if (s.type === "number" || s.type === "integer") return 0;
  if (s.type === "boolean") return false;
  if (s.type === "array") return [];
  return null;
}

type Pending = { stepUp: boolean; reason: string; summary: string; requiredEvidence: string[] };
type Outcome =
  | { kind: "ok"; decision: string; result: unknown; envelope: unknown }
  | { kind: "deny"; message: string }
  | { kind: "schema"; errors: string[] };

export default function ToolConsole({ cap }: { cap: CapabilityDTO }) {
  const [toolName, setToolName] = useState(cap.tools[0]?.name ?? "");
  const tool: Tool | undefined = cap.tools.find((t) => t.name === toolName);
  const [args, setArgs] = useState(() => JSON.stringify(skeleton(cap.tools[0]?.inputSchema), null, 2));
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [password, setPassword] = useState("");
  const [stepErr, setStepErr] = useState<string | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [out, setOut] = useState<Outcome | null>(null);

  function pick(name: string) {
    setToolName(name);
    setArgs(JSON.stringify(skeleton(cap.tools.find((t) => t.name === name)?.inputSchema), null, 2));
    setPending(null);
    setOut(null);
    setParseErr(null);
  }

  async function run(confirm: boolean) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(args || "{}");
    } catch {
      setParseErr("Arguments are not valid JSON");
      return;
    }
    setParseErr(null);
    setStepErr(null);
    setBusy(true);
    if (!confirm) setOut(null);
    try {
      const r = await api<{ status: string; decision: string; result?: unknown; envelope?: unknown } & Partial<Pending>>(`/api/capabilities/${cap.id}/invoke`, {
        method: "POST",
        body: { tool: toolName, arguments: parsed, confirm, password: confirm ? password : undefined },
      });
      if (r.status === "needs_confirmation") setPending({ stepUp: !!r.stepUp, reason: r.reason ?? "", summary: r.summary ?? "", requiredEvidence: r.requiredEvidence ?? [] });
      else {
        setPending(null);
        setPassword("");
        setOut({ kind: "ok", decision: r.decision, result: r.result, envelope: r.envelope });
      }
    } catch (e) {
      if (e instanceof ApiError && e.data.needsStepUp) setStepErr(password ? "Incorrect password. Try again." : "Password required.");
      else if (e instanceof ApiError && Array.isArray(e.data.errors)) {
        setPending(null);
        setOut({ kind: "schema", errors: e.data.errors as string[] });
      } else {
        setPending(null);
        setOut({ kind: "deny", message: e instanceof Error ? e.message : "Call failed" });
      }
    }
    setBusy(false);
  }

  if (!tool) return null;
  return (
    <div className="space-y-3 rounded-xl bg-white/70 p-4 ring-1 ring-ink/10">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tool">
          <select className={inputCls} value={toolName} onChange={(e) => pick(e.target.value)}>
            {cap.tools.map((t) => <option key={t.name} value={t.name}>{t.name} · L{t.level}</option>)}
          </select>
        </Field>
        <div className="flex items-end gap-2 pb-1"><LevelBadge level={tool.level} long /></div>
      </div>
      <Field label="Arguments (validated against the tool's inputSchema)">
        <textarea className={cn(inputCls, "min-h-28 font-mono text-xs")} value={args} onChange={(e) => setArgs(e.target.value)} spellCheck={false} />
      </Field>
      {parseErr && <p role="alert" className="text-sm text-red-700">{parseErr}</p>}

      {!pending && <Button variant="accent" size="sm" loading={busy} onClick={() => run(false)}>Send through policy broker</Button>}

      {pending && (
        <div className="slidein space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-amber-800">Policy approval required{pending.stepUp ? " · step-up" : ""}</p>
          <p className="text-sm">{pending.summary}</p>
          <p className="text-xs text-amber-900/80">{pending.reason}</p>
          {pending.requiredEvidence.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pending.requiredEvidence.map((e) => <span key={e} className="rounded bg-ink px-1.5 py-0.5 font-mono text-[11px] text-paper">{e}</span>)}
            </div>
          )}
          {pending.stepUp && (
            <Field label="Account password (step-up)">
              <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </Field>
          )}
          {stepErr && <p role="alert" className="text-sm text-red-700">{stepErr}</p>}
          <div className="flex gap-2">
            <Button variant="accent" size="sm" loading={busy} onClick={() => run(true)}>Confirm execution</Button>
            <Button variant="ghost" size="sm" onClick={() => setPending(null)}>Reject</Button>
          </div>
        </div>
      )}

      {out?.kind === "deny" && <div role="alert" className="slidein rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"><strong>Denied:</strong> {out.message}</div>}
      {out?.kind === "schema" && (
        <div role="alert" className="slidein rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <strong>Schema rejected the arguments</strong>
          <ul className="mt-1 list-disc pl-5 text-xs">{out.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {out?.kind === "ok" && (
        <div className="slidein space-y-2">
          <div className="flex items-center gap-2">
            <Badge tone={DECISION_TONE[out.decision]} className="uppercase">{out.decision}</Badge>
            <span className="text-sm font-medium text-emerald-800">Executed. A signed receipt was recorded.</span>
          </div>
          <pre className="max-h-64 overflow-auto rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed text-paper/85">{JSON.stringify(out.envelope, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
