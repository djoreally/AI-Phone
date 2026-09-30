"use client";

import { useState } from "react";
import { Badge, Card, cx, useToast } from "@/components/ui";

export function RuntimeClient({ files, manifestJson, signature }: { files: { path: string; body: string }[]; manifestJson: string; signature: string }) {
  const toast = useToast();
  const [tab, setTab] = useState<"kotlin" | "manifest">("kotlin");
  const [file, setFile] = useState(files[0]?.path ?? "");
  const current = files.find((f) => f.path === file);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.push("Copied to clipboard", "success");
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button onClick={() => setTab("kotlin")} className={cx("rounded-full border px-3 py-1 text-xs", tab === "kotlin" ? "border-lime-400/50 bg-lime-400/10 text-lime-200" : "border-zinc-800 text-zinc-400")}>Phase 1 · Kotlin Policy Broker</button>
        <button onClick={() => setTab("manifest")} className={cx("rounded-full border px-3 py-1 text-xs", tab === "manifest" ? "border-lime-400/50 bg-lime-400/10 text-lime-200" : "border-zinc-800 text-zinc-400")}>Phase 3 · MCP manifest spec</button>
      </div>

      {tab === "kotlin" ? (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card className="p-3">
            <p className="mb-2 px-2 text-[11px] uppercase tracking-wide text-zinc-500">com/aiphone/runtime/policy/</p>
            <ul className="space-y-0.5">
              {files.map((f) => (
                <li key={f.path}>
                  <button onClick={() => setFile(f.path)} className={cx("mono w-full rounded-md px-2 py-1 text-left text-xs", file === f.path ? "bg-lime-400/10 text-lime-200" : "text-zinc-400 hover:bg-zinc-800 hover:text-white")}>{f.path}</button>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
              <p className="mono text-xs text-zinc-300">{current?.path}</p>
              <button onClick={() => current && copy(current.body)} className="text-xs text-zinc-400 hover:text-lime-300">Copy</button>
            </div>
            <pre className="mono max-h-[70vh] overflow-auto p-4 text-[12px] leading-5 text-zinc-300">{current?.body}</pre>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
              <p className="mono text-xs text-zinc-300">capability-package.aipc / manifest.json</p>
              <button onClick={() => copy(manifestJson)} className="text-xs text-zinc-400 hover:text-lime-300">Copy</button>
            </div>
            <pre className="mono max-h-[70vh] overflow-auto p-4 text-[12px] leading-5 text-zinc-300">{manifestJson}</pre>
          </Card>
          <div className="space-y-4">
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">signature.sig</p>
              <p className="mono mt-1 break-all text-[11px] text-lime-200">{signature}</p>
              <p className="mt-2 text-xs text-zinc-500">Publisher signature over the canonical manifest. Import this pair on the Marketplace page to see the full verification pipeline pass; change any byte and the package is rejected.</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Package structure</p>
              <pre className="mono mt-2 text-[12px] leading-5 text-zinc-300">{`capability-package.aipc
├── manifest.json      # strict schema
├── signature.sig      # publisher Ed25519
├── icon.png
└── ui_templates/      # sandboxed MCP Apps
    └── main.html`}</pre>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Lifecycle & safety gates</p>
              <ul className="mt-2 space-y-2 text-sm text-zinc-300">
                <li><Badge tone="lime">1</Badge> <b>Publisher verification</b> — signature checked against the CIMD document at <span className="mono text-xs">/.well-known/mcp-client-metadata.json</span> before install.</li>
                <li><Badge tone="amber">2</Badge> <b>Policy sandbox</b> — <span className="mono text-xs">level_3_act</span> / <span className="mono text-xs">level_4_restricted</span> tools cannot bypass the broker; manifests declaring otherwise are rejected at import.</li>
                <li><Badge tone="sky">3</Badge> <b>Stateless transport</b> — no <span className="mono text-xs">initialize</span>, no <span className="mono text-xs">Mcp-Session-Id</span>; JSON-RPC over HTTP/mTLS with <span className="mono text-xs">Mcp-Method</span> / <span className="mono text-xs">Mcp-Name</span> routing headers and a <span className="mono text-xs">com.aiphone/policyProof</span> envelope.</li>
                <li><Badge tone="violet">4</Badge> <b>Elicitation</b> — mid-flight input returns <span className="mono text-xs">InputRequiredResult</span> or renders a sandboxed MCP App, still subject to consent gates.</li>
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
