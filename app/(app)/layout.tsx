import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateSelfPerson } from "@/lib/people";
import { SignOutButton } from "./sign-out-button";
import { NavLink } from "./nav-link";
import { NotificationManager } from "@/components/notification-manager";

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

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col justify-between overflow-y-auto border-r border-rule bg-paper px-5 py-6">
        <div className="space-y-8">
          <Link
            href="/"
            className="block text-lg font-semibold tracking-tight text-ink-1"
          >
            ECHO
          </Link>
          <nav className="flex flex-col gap-1 text-sm">
            <NavLink href="/">Voice</NavLink>
            <NavLink href="/debrief">Debrief</NavLink>
            <NavLink href="/people">Personen</NavLink>
            <NavLink href="/organizations">Organisationen</NavLink>
            <NavLink href="/inbox">Inbox</NavLink>
            <NavLink href="/rhythmus">Rhythmus</NavLink>
            <NavLink href="/pulse">Sonntags-Puls</NavLink>
            <NavLink href="/recap">Rückblick</NavLink>
          </nav>
        </div>

        <div className="space-y-3">
          <Link
            href="/profile"
            className="flex items-center gap-3 rounded border border-rule bg-paper-2 p-2 transition hover:border-action hover:bg-action-soft"
          >
            {self.avatar_url ? (
              <Image
                src={self.avatar_url}
                alt={self.name}
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover"
                unoptimized
              />
            ) : (
              <span className="avatar" aria-hidden>
                {initials(self.name)}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink-1">
                {self.name}
              </span>
              <span className="block truncate font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                Mein Profil
              </span>
            </span>
          </Link>
          <div className="flex items-center justify-between gap-2">
            <span
              className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4"
              title={user.email ?? ""}
            >
              {user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">{children}</main>
      <NotificationManager />
    </div>
  );
}
