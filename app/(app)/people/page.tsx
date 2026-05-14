import { listPeopleWithContext } from "@/lib/people";
import { listPeopleDuplicates } from "@/lib/duplicates";
import { listAllCircles } from "@/lib/circles";
import { PeopleTable } from "./people-table";
import { DuplicateBanner } from "@/components/duplicate-banner";
import { parseFilterFromParams } from "@/lib/people-filter";
import { getT } from "@/lib/i18n/server";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const initialFilter = parseFilterFromParams(params);
  const { t } = await getT();

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
    tagsByCluster: r.tagsByCluster, // Record ist serializable
    clusters: Object.keys(r.tagsByCluster), // welche Cluster überhaupt Tags haben
    passions: Array.from(r.passions),
    circleIds: Array.from(r.circleIds),
    tagNotes: r.tagNotes,        // 0028 — pro Tag-Name → Note
    passionNotes: r.passionNotes, // pro lower-case Passion-Name → Note
    circleNotes: r.circleNotes,   // pro circle_id → Note
    cityList: Array.from(r.cityList),         // 0030 — alle aktiven Geos lower
    contactChannels: Array.from(r.contactChannels), // 0030 — Set<ContactChannel>
  }));

  // Distinct Passions für Filter-Dropdown.
  const passionSet = new Set<string>();
  for (const r of rows) for (const p of r.passions) passionSet.add(p);
  const passionsList = Array.from(passionSet).sort((a, b) =>
    a.localeCompare(b),
  );

  // Distinct Locations für Ort-Filter. V3 (0030) zieht primär aus
  // person_geographies (über cityList), während die JSONB-Felder als
  // Transition-Fallback mitgenommen werden bis Phase 3 die Writes
  // komplett auf die Tabelle umgestellt hat.
  const locationMap = new Map<string, string>(); // lower → display
  for (const r of rows) {
    // Neue strukturierte Quelle
    for (const lower of r.cityList) {
      if (!lower) continue;
      if (!locationMap.has(lower)) {
        // Display = Title-case Variante
        const display = lower
          .split(/\s+/)
          .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
          .join(" ");
        locationMap.set(lower, display);
      }
    }
    // Legacy-Freitext als Fallback während der Migration
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
            {t("people.title")}
          </h1>
          <p className="max-w-xl text-sm text-ink-3">
            {t("people.subtitle")}
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
          initialFilter={initialFilter}
        />
      </div>
    </div>
  );
}
