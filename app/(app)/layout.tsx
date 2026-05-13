import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateSelfPerson } from "@/lib/people";
import { isAdminEmail } from "@/lib/admin";
import { countOverdueReminders } from "@/lib/inbox";
import { APP_CONFIG } from "@/lib/config";
import { SignOutButton } from "./sign-out-button";
import { NavLink } from "./nav-link";
import { NotificationManager } from "@/components/notification-manager";
import { SearchModal } from "@/components/search-modal";
import { SearchTrigger } from "@/components/search-trigger";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const self = await getOrCreateSelfPerson();
  const showAdmin = isAdminEmail(user.email);
  const overdueReminders = await countOverdueReminders();

  return (
    <div className="flex h-screen">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col overflow-y-auto border-r border-rule bg-paper px-5 py-6">
        <div className="space-y-8">
          <Link
            href="/"
            className="block text-lg font-semibold tracking-tight text-ink-1"
          >
            {APP_CONFIG.PUBLIC_NAME}
          </Link>
          <SearchTrigger />
          <nav className="flex flex-col gap-1 text-sm">
            <NavLink href="/">Voice</NavLink>
            <NavLink href="/debrief">Wecker</NavLink>
            <NavLink href="/people">Personen</NavLink>
            <NavLink href="/organizations">Organisationen</NavLink>
            {/* Pipelines hidden per Discovery Decision Q1 (refactor/3-axis-model).
                Code + Tabellen bleiben — Route ist via app/pipelines/page.tsx
                manuell aufrufbar wenn Patrick rein will. */}
            <NavLink href="/inbox" badge={overdueReminders}>
              Reminders
            </NavLink>
            <NavLink href="/rhythmus">Rhythmus</NavLink>
            <NavLink href="/pulse">Sonntags-Puls</NavLink>
            <NavLink href="/recap">Rückblick</NavLink>
            <NavLink href="/integrations">Voice Vibe Integrations</NavLink>
            <NavLink href="/connections">Verbindungen</NavLink>
            <NavLink href="/integrations/workflows">Workflows</NavLink>
            <NavLink href="/models">Modelle</NavLink>
            {showAdmin && (
              <>
                <span className="mt-3 px-3 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-4">
                  Internal
                </span>
                <NavLink href="/admin">Admin</NavLink>
              </>
            )}
          </nav>
        </div>
      </aside>
      <div className="flex h-screen min-w-0 flex-1 flex-col">
        {/* Sticky topbar — Profil + Account oben rechts, scrollt mit
            content nicht weg. Avatar führt zur Profil-Seite, Email dient
            als Account-Anzeige, Logout direkt erreichbar. */}
        <header className="sticky top-0 z-40 flex items-center justify-end gap-3 border-b border-rule bg-paper/95 px-6 py-2 backdrop-blur">
          <Link
            href="/profile"
            className="flex items-center gap-2.5 rounded border border-rule bg-paper-2 px-2 py-1 transition hover:border-action hover:bg-action-soft"
          >
            {self.photo_url ? (
              <Image
                src={self.photo_url}
                alt={self.name}
                width={28}
                height={28}
                className="h-7 w-7 rounded-full object-cover"
                unoptimized
              />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-action/15 font-mono text-[10px] font-medium uppercase tracking-wider text-action">
                {initials(self.name)}
              </span>
            )}
            <span className="hidden min-w-0 flex-col text-left sm:flex">
              <span className="truncate text-xs font-medium text-ink-1">
                {self.name}
              </span>
              <span
                className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-ink-4"
                title={user.email ?? ""}
              >
                {user.email}
              </span>
            </span>
          </Link>
          <SignOutButton />
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
      <NotificationManager />
      <SearchModal />
    </div>
  );
}
