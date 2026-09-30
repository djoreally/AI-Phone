import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import Shell from "@/components/Shell";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  return <Shell user={{ name: user.name, email: user.email }}>{children}</Shell>;
}
