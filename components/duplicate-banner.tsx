import Link from "next/link";

// Subtle banner shown on the index pages when ECHO has detected
// possible duplicates. Stays out of the way for clean databases —
// the banner only renders when count > 0.
export function DuplicateBanner({
  count,
  highCount,
  href,
  entity,
}: {
  count: number;
  highCount: number;
  href: string;
  entity: "Personen" | "Organisationen";
}) {
  if (count === 0) return null;
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-xl border border-signal/30 bg-signal-soft/40 px-4 py-2.5 text-sm transition hover:border-signal/60"
    >
      <span className="flex items-center gap-2">
        <span className="text-base" aria-hidden>
          ⚠
        </span>
        <span>
          <strong className="font-medium text-ink-1">
            {count} {count === 1 ? "möglicher Doppelter" : "mögliche Doppelte"}
          </strong>{" "}
          <span className="text-ink-3">in {entity}</span>
          {highCount > 0 && (
            <span className="ml-1 font-mono text-[10px] uppercase tracking-wider text-ink-3">
              · {highCount} hochsicher
            </span>
          )}
        </span>
      </span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
        ansehen →
      </span>
    </Link>
  );
}
