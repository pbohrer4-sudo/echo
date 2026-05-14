// Onboarding-Layout — Vollbild, fokussiert. Liegt bewusst außerhalb
// der (app)-Route-Group damit die Standard-Sidebar nicht reinrutscht.

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { APP_CONFIG } from "@/lib/config";

export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-paper-2">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-12">
        <header className="mb-12 flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight text-ink-1">
            {APP_CONFIG.PUBLIC_NAME}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
            Erste Schritte
          </span>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
