import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { capabilities, devices } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { CapabilitiesClient } from "./capabilities-client";

export const dynamic = "force-dynamic";

export default async function CapabilitiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [rows, devs] = await Promise.all([
    db.select().from(capabilities).where(eq(capabilities.userId, user.id)).orderBy(asc(capabilities.name)),
    db.select({ id: devices.id, name: devices.name }).from(devices).where(eq(devices.userId, user.id)),
  ]);
  return <CapabilitiesClient initial={rows} devices={devs} />;
}
