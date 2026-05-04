"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active =
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`rounded px-3 py-1.5 text-sm transition-colors ${
        active
          ? "bg-paper-2 text-ink-1"
          : "text-ink-3 hover:text-ink-1"
      }`}
    >
      {children}
    </Link>
  );
}
