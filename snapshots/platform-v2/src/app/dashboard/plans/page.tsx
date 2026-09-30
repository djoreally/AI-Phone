import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/db";
import { devices, plans } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { ListSkeleton } from "@/components/ui";
import { PlansClient } from "./plans-client";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [rows, devs] = await Promise.all([
    db.select().from(plans).where(eq(plans.userId, user.id)).orderBy(desc(plans.createdAt)),
    db.select({ id: devices.id, name: devices.name, status: devices.status }).from(devices).where(eq(devices.userId, user.id)).orderBy(desc(devices.lastSeenAt)),
  ]);
  return (
    <Suspense fallback={<ListSkeleton />}>
      <PlansClient initial={rows} devices={devs} />
    </Suspense>
  );
}
