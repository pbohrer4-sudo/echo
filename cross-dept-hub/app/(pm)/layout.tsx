import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { APP_CONFIG } from "@/lib/config";
import { countUnread } from "@/lib/pm/notifications";
import { signOut } from "../(auth)/login/actions";
import { HubNotificationPoller } from "./teams/_components/notification-poller";

// Auth-gated layout for the cross-department hub. Everything below /teams
// renders inside this shell.
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
            <Link href="/teams/my-todo" className="hover:text-ink-1">
              Meine Aufgaben
            </Link>
            <Link href="/teams/dashboard" className="hover:text-ink-1">
              Dashboard
            </Link>
            <Link href="/teams/stream" className="hover:text-ink-1">
              Stream
            </Link>
            <Link href="/teams/new-request" className="hover:text-ink-1">
              Neue Anfrage
            </Link>
            <Link href="/teams/settings" className="hover:text-ink-1">
              Einstellungen
            </Link>
            <Link href="/teams/feedback" className="hover:text-ink-1">
              Feedback
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
          <span className="font-mono">{user.email}</span>
          <form action={signOut}>
            <button type="submit" className="hover:text-ink-1">
              Abmelden
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      <HubNotificationPoller />
    </div>
  );
}
