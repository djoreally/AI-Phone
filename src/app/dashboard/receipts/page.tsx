import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { devices, receipts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { ReceiptsClient } from "./receipts-client";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [rows, devs] = await Promise.all([
    db.select().from(receipts).where(eq(receipts.userId, user.id)).orderBy(desc(receipts.createdAt)).limit(300),
    db.select({ id: devices.id, name: devices.name }).from(devices).where(eq(devices.userId, user.id)),
  ]);
  return <ReceiptsClient initial={rows} devices={devs} />;
}
