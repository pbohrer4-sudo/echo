// SuggestionStack — Server-Component, fetched alle pending Suggestions
// für eine Person und rendert die Cards. Wenn nichts pending ist:
// rendert NICHTS (kein Empty-State auf der Detail-Page — die ist eh
// vollgepackt, der Block soll nur auftauchen wenn was zu tun ist).

import { listPendingForPerson } from "@/lib/suggestions";
import { SuggestionCard } from "@/components/suggestion-card";

export async function SuggestionStack({ personId }: { personId: string }) {
  const suggestions = await listPendingForPerson(personId);
  if (suggestions.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="section-head">
        <span className="t-label">
          Vorschläge ({suggestions.length})
        </span>
        <span className="rule" />
      </div>
      <div className="space-y-2">
        {suggestions.map((s) => (
          <SuggestionCard key={s.id} suggestion={s} personId={personId} />
        ))}
      </div>
    </section>
  );
}
