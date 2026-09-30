import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { DevicesClient } from "./devices-client";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const rows = await db.select().from(devices).where(eq(devices.userId, user.id)).orderBy(desc(devices.createdAt));
  return <DevicesClient initial={rows} />;
}
