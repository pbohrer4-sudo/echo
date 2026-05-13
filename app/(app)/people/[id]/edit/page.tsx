import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getPersonById } from "@/lib/people";

// Volle Edit-Form (PersonForm, 1300 Zeilen) wurde in 0025 entfernt — die
// referenzierten Legacy-Felder gibt es nicht mehr. Inline-Edits gehen via:
//   - AxisBadges auf Detail-Page (depth/purpose/mode)
//   - SuggestionStack (alle AI-Vorschläge)
//   - tags-UI in Phase c (Tag-Cluster v3)
//   - eine schlanke neue Edit-Form kommt in Phase C, sobald das neue
//     Schema stabil ist und die UI darauf aufgebaut wurde.
//
// Bis dahin: Edit-Route zeigt einen Hinweis statt der alten Form.

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const person = await getPersonById(id);
  if (!person) notFound();

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        <header className="space-y-2">
          <p className="t-label">Bearbeiten</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            {person.name}
          </h1>
        </header>

        <div className="rounded-2xl border border-dashed border-rule bg-paper-2 p-6 space-y-3">
          <p className="t-label">Edit-Form temporär nicht verfügbar</p>
          <p className="text-sm text-ink-2">
            Die alte Edit-Form referenzierte Legacy-Felder (scope,
            stakeholder_types, priority etc.), die in 0025 entfernt wurden.
            Schlanke neue Edit-Form kommt in Phase C.
          </p>
          <p className="text-sm text-ink-2">
            Bis dahin: 3-Achsen (depth/purpose/mode) via Badges auf der
            Detail-Page, Felder-Updates via Suggestion-Stack.
          </p>
          <div className="pt-2">
            <Link
              href={`/people/${id}`}
              className="inline-flex h-9 items-center rounded border border-action bg-action px-4 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
            >
              Zurück zur Detail-Seite
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
