import { listPeople } from "@/lib/people";
import { PeopleTable } from "./people-table";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;
  const all = await listPeople();

  const activeTag = tag?.trim() || null;
  const filtered = activeTag
    ? all.filter((p) =>
        (p.tags ?? []).some(
          (t) => t.toLowerCase() === activeTag.toLowerCase(),
        ),
      )
    : all;

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Personal CRM</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Personen
          </h1>
          <p className="max-w-xl text-sm text-ink-3">
            Beruflich und privat. Sortier-, filter- und durchsuchbar.
          </p>
        </header>
        <PeopleTable
          people={filtered}
          activeTag={activeTag}
          totalCount={all.length}
        />
      </div>
    </div>
  );
}
