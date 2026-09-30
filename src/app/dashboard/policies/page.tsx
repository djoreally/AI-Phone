import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { capabilities, policies } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { PoliciesClient } from "./policies-client";

export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [rows, caps] = await Promise.all([
    db.select().from(policies).where(eq(policies.userId, user.id)).orderBy(asc(policies.priority)),
    db.select({ slug: capabilities.slug, name: capabilities.name }).from(capabilities).where(eq(capabilities.userId, user.id)).orderBy(asc(capabilities.name)),
  ]);
  return <PoliciesClient initial={rows} capabilities={caps} />;
}
