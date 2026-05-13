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
    circleIds: Array.from(r.circleIds),
  }));

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
        <PeopleTable rows={rows} circles={circles} totalCount={rows.length} />
      </div>
    </div>
  );
}
