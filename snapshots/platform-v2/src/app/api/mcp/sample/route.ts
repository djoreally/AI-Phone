import { NextResponse } from "next/server";
import { SAMPLE_MANIFEST, signManifest } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ manifest: SAMPLE_MANIFEST, signature: signManifest(SAMPLE_MANIFEST) });
}
