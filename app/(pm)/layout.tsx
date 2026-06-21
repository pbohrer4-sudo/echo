import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { APP_CONFIG } from "@/lib/config";
import { countUnread } from "@/lib/pm/notifications";
import { HubNotificationPoller } from "./teams/_components/notification-poller";

// Isolated layout for the cross-department project-management module.
// Auth-gated only — deliberately NOT behind the Personal-CRM onboarding
// gate, since this is a separate product surface that shares the same
// Supabase auth session.
export default async function PmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const unread = await countUnread();

  return (
    <div className="min-h-screen bg-paper text-ink-1">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-rule bg-paper/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-6">
          <Link href="/teams" className="text-lg font-semibold tracking-tight">
            {APP_CONFIG.PUBLIC_NAME} <span className="text-ink-4">Hub</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-ink-3">
            <Link href="/teams" className="hover:text-ink-1">
              Abteilungen
            </Link>
            <Link href="/teams/new-request" className="hover:text-ink-1">
              Neue Anfrage
            </Link>
            <Link href="/teams/settings" className="hover:text-ink-1">
              Einstellungen
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-4">
          <Link
            href="/teams/notifications"
            className="relative rounded-lg border border-rule px-2.5 py-1.5 text-ink-3 hover:border-action hover:text-ink-1"
          >
            Mitteilungen
            {unread > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-action px-1 text-[10px] font-medium text-paper">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          <Link href="/heute" className="hover:text-ink-1">
            ← Zur CRM-App
          </Link>
          <span className="font-mono">{user.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      <HubNotificationPoller />
    </div>
  );
}
