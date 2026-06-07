"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { extractSynergyTags } from "./synergy-tag-actions";

// On-demand "Verschlagworten" trigger for the Synergien section. Calls
// the AI extraction action; on success the page revalidates and the new
// chips render server-side.
export function SynergyTagsButton({ personId }: { personId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await extractSynergyTags(personId);
      if (!res.ok) setError(res.error ?? "Fehler");
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        title="Synergien automatisch verschlagworten (filterbar machen)"
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-rule px-2.5 py-1 text-xs text-ink-3 transition hover:border-action hover:text-action disabled:opacity-50"
      >
        <Sparkles className="h-3 w-3" aria-hidden />
        {pending ? "…" : "Verschlagworten"}
      </button>
      {error && <span className="text-[11px] text-bad">{error}</span>}
    </span>
  );
}
