import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ToastProvider } from "@/components/ui";

export const metadata: Metadata = {
  title: "AI Phone Studio — The phone is your robot",
  description: "Provisioning studio, policy broker, capability marketplace, and receipt timeline for AI-operated Android phones.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
