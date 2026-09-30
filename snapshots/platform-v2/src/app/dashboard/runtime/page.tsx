import { PageHeader } from "@/components/ui";
import { RuntimeClient } from "./runtime-client";
import { KOTLIN_FILES } from "./kotlin";
import { SAMPLE_MANIFEST, signManifest } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export default function RuntimePage() {
  const manifestJson = JSON.stringify(SAMPLE_MANIFEST, null, 2);
  const signature = signManifest(SAMPLE_MANIFEST);
  return (
    <div>
      <PageHeader eyebrow="Implementation package" title="Runtime reference" description="Phase 1 Kotlin Policy Broker codebase and the Phase 3 MCP capability manifest specification, as shipped to the Android runtime and Studio." />
      <RuntimeClient files={KOTLIN_FILES} manifestJson={manifestJson} signature={signature} />
    </div>
  );
}
