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
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-6 border-b border-rule bg-paper px-8 py-4">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-ink-1"
          >
            ECHO
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink href="/">Voice</NavLink>
            <NavLink href="/people">Personen</NavLink>
            <NavLink href="/inbox">Inbox</NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
            {user.email}
          </span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <NotificationManager />
    </div>
  );
}
