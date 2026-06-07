"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { removeSynergyTag } from "./synergy-tag-actions";

// Synergy keyword chips: the label links to the filtered People list;
// the × quickly removes the tag (optimistic). Client component so the
// × can fire the server action without a full edit flow.
export function SynergyTagChips({
  personId,
  tags,
}: {
  personId: string;
  tags: string[];
}) {
  const [local, setLocal] = useState<string[]>(tags);
  const [pending, startTransition] = useTransition();

  function remove(tag: string) {
    setLocal((prev) => prev.filter((t) => t !== tag));
    startTransition(async () => {
      const res = await removeSynergyTag(personId, tag);
      // On failure, restore the tag so the user sees it didn't delete.
      if (!res.ok) setLocal((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    });
  }

  if (local.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {local.map((t) => (
        <span key={t} className="tag inline-flex items-center gap-1">
          <span className="dot" />
          <Link
            href={`/people?synergy=${encodeURIComponent(t.toLowerCase())}`}
            className="transition hover:text-action"
          >
            {t}
          </Link>
          <button
            type="button"
            onClick={() => remove(t)}
            disabled={pending}
            aria-label={`${t} entfernen`}
            className="-mr-0.5 ml-0.5 text-ink-4 transition hover:text-bad disabled:opacity-50"
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
