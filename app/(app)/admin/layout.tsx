import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-rule bg-paper-2 px-6 py-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="t-label">Admin</span>
          <span className="rounded border border-action/40 bg-action-soft px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-action">
            internal
          </span>
        </div>
        <nav className="mt-2 flex gap-1 text-sm">
          <AdminNavLink href="/admin">Übersicht</AdminNavLink>
          <AdminNavLink href="/admin/users">Users</AdminNavLink>
        </nav>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-8">{children}</div>
    </div>
  );
}

function AdminNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  // Server-component navigation — kein active-state hier (das macht
  // der NavLink-Client für die Sidebar; hier reicht's schlicht).
  return (
    <Link
      href={href}
      className="rounded px-3 py-1.5 text-ink-2 transition hover:bg-paper hover:text-ink-1"
    >
      {children}
    </Link>
  );
}
