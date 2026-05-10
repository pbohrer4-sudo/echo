"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
  badge,
}: {
  href: string;
  children: React.ReactNode;
  // Optional count rendered as a small pill in the top-right of the
  // link. Hidden when 0 / null so clean nav stays clean.
  badge?: number | null;
}) {
  const pathname = usePathname();
  const active =
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`relative block rounded px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-paper-2 text-ink-1"
          : "text-ink-3 hover:bg-paper-2 hover:text-ink-1"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span>{children}</span>
        {badge != null && badge > 0 && (
          <span
            className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-bad px-1 font-mono text-[10px] font-medium leading-none text-paper"
            aria-label={`${badge} überfällig`}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
    </Link>
  );
}
