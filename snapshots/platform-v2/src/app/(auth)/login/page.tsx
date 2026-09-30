import { AuthForm } from "@/components/auth-form";
import { ensureDemoUser } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  await ensureDemoUser().catch(() => {});
  return <AuthForm mode="login" />;
}
