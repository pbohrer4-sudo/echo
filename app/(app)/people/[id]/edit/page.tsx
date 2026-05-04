import { notFound } from "next/navigation";
import { getPersonById } from "@/lib/people";
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

  const person = await getPersonById(id);
  if (!person) notFound();

  const action = updatePerson.bind(null, id);

  return (
    <div className="px-6 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-1">
          <h1 className="font-serif text-3xl tracking-tight">{person.name}</h1>
          <p className="text-sm text-neutral-500">Bearbeiten</p>
        </header>
        <PersonForm
          initial={person}
          action={action}
          cancelHref={`/people/${id}`}
          error={error ? decodeURIComponent(error) : undefined}
        />
      </div>
    </div>
  );
}
