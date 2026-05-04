import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";
import { NavLink } from "./nav-link";

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
      <header className="flex items-center justify-between gap-6 border-b border-neutral-900 px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-serif text-xl tracking-tight">
            ECHO
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink href="/">Voice</NavLink>
            <NavLink href="/people">Personen</NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-neutral-400">
          <span className="font-mono text-xs">{user.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
