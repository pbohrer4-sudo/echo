import { createPerson } from "../actions";
import { PersonForm } from "../person-form";

export default async function NewPersonPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Neue Person</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Person anlegen
          </h1>
          <p className="text-sm text-ink-3">
            Füll aus was du weißt — den Rest sammelt ECHO über die Zeit.
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
