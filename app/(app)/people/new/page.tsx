import { createPerson } from "../actions";
import { PersonForm } from "../person-form";

export default async function NewPersonPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="px-6 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-1">
          <h1 className="font-serif text-3xl tracking-tight">Person anlegen</h1>
          <p className="text-sm text-neutral-500">
            Füll aus was du weißt — Rest sammelt ECHO über die Zeit.
          </p>
        </header>
        <PersonForm
          action={createPerson}
          cancelHref="/people"
          error={error ? decodeURIComponent(error) : undefined}
        />
      </div>
    </div>
  );
}
