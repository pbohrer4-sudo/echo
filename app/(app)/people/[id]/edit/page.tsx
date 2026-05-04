import { notFound } from "next/navigation";
import { getPersonById } from "@/lib/people";
import { listPeople } from "@/lib/people";
import { updatePerson } from "../../actions";
import { PersonForm } from "../../person-form";

export default async function EditPersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const [person, allPeople] = await Promise.all([
    getPersonById(id),
    listPeople(),
  ]);
  if (!person) notFound();

  const peopleOptions = allPeople
    .filter((p) => p.id !== id)
    .map((p) => ({ id: p.id, name: p.name }));

  const action = updatePerson.bind(null, id);

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Bearbeiten</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            {person.name}
          </h1>
        </header>
        <PersonForm
          initial={person}
          action={action}
          cancelHref={`/people/${id}`}
          peopleOptions={peopleOptions}
          error={error ? decodeURIComponent(error) : undefined}
        />
      </div>
    </div>
  );
}
