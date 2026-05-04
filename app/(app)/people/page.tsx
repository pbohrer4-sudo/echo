import { listPeople } from "@/lib/people";
import { PeopleTable } from "./people-table";

export default async function PeoplePage() {
  const people = await listPeople();

  return (
    <div className="px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-1">
          <h1 className="font-serif text-3xl tracking-tight">Personen</h1>
          <p className="text-sm text-neutral-500">
            Beruflich und privat. Sortier-, filter- und durchsuchbar.
          </p>
        </header>
        <PeopleTable people={people} />
      </div>
    </div>
  );
}
