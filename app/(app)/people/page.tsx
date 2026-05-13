import { listPeopleWithContext } from "@/lib/people";
import { listPeopleDuplicates } from "@/lib/duplicates";
import { listAllCircles } from "@/lib/circles";
import { PeopleTable } from "./people-table";
import { DuplicateBanner } from "@/components/duplicate-banner";

export default async function PeoplePage() {
  const [contextRows, dupes, circles] = await Promise.all([
    listPeopleWithContext(),
    listPeopleDuplicates(),
    listAllCircles(),
  ]);

  const highCount = dupes.filter((d) => d.confidence === "high").length;

  // Auf serializable shape mappen — Sets gehen nicht durch
  // Server→Client-Boundary in Next.js, also als string[].
  const rows = contextRows.map((r) => ({
    person: r.person,
    clusters: Array.from(r.clusters),
    passions: Array.from(r.passions),
    circleIds: Array.from(r.circleIds),
  }));

  // Distinct Passions für Filter-Dropdown.
  const passionSet = new Set<string>();
  for (const r of rows) for (const p of r.passions) passionSet.add(p);
  const passionsList = Array.from(passionSet).sort((a, b) =>
    a.localeCompare(b),
  );

  // Distinct Locations für Ort-Filter (current_location, home_location,
  // met_location aggregiert, case-insensitive dedupliziert).
  const locationMap = new Map<string, string>(); // lower → original
  for (const r of rows) {
    for (const loc of [
      r.person.current_location,
      r.person.home_location,
      r.person.met_location,
    ]) {
      if (loc && loc.trim()) {
        const trimmed = loc.trim();
        const lower = trimmed.toLowerCase();
        if (!locationMap.has(lower)) locationMap.set(lower, trimmed);
      }
    }
  }
  const locationsList = Array.from(locationMap.entries())
    .map(([lower, orig]) => ({ value: lower, label: orig }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <p className="t-label">Personal CRM</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Personen
          </h1>
          <p className="max-w-xl text-sm text-ink-3">
            Beruflich und privat. Sortier-, filter- und durchsuchbar.
          </p>
        </header>
        <DuplicateBanner
          count={dupes.length}
          highCount={highCount}
          href="/people/duplicates"
          entity="Personen"
        />
        <PeopleTable
          rows={rows}
          circles={circles}
          passions={passionsList}
          locations={locationsList}
          totalCount={rows.length}
        />
      </div>
    </div>
  );
}
