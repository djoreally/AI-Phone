import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/db";
import { devices, provisioningRuns, voiceTokens } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { ListSkeleton } from "@/components/ui";
import { StudioClient } from "./studio-client";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [devs, runs, tokens] = await Promise.all([
    db.select().from(devices).where(eq(devices.userId, user.id)).orderBy(desc(devices.lastSeenAt)),
    db.select().from(provisioningRuns).where(eq(provisioningRuns.userId, user.id)).orderBy(desc(provisioningRuns.createdAt)).limit(20),
    db.select().from(voiceTokens).where(eq(voiceTokens.userId, user.id)).orderBy(desc(voiceTokens.createdAt)).limit(50),
  ]);
  return (
    <Suspense fallback={<ListSkeleton />}>
      <StudioClient devices={devs} runs={runs} tokens={tokens} />
    </Suspense>
  );
}
