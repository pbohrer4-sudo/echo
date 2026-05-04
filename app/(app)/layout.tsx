import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";
import { NavLink } from "./nav-link";
import { NotificationManager } from "@/components/notification-manager";

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

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col justify-between border-r border-rule bg-paper px-5 py-6">
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
            <NavLink href="/inbox">Inbox</NavLink>
            <NavLink href="/profile">Mein Profil</NavLink>
          </nav>
        </div>
        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 break-all">
            {user.email}
          </p>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">{children}</main>
      <NotificationManager />
    </div>
  );
}
