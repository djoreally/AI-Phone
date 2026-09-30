import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Shell } from "@/components/shell";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <Shell user={{ name: user.name, email: user.email, organization: user.organization }}>{children}</Shell>;
}
