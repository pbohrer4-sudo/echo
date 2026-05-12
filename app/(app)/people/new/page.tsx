import { QuickAddForm } from "./quick-add-form";

// Quick-Add Person — 4 Pflicht-Felder (Name, how_we_met, purpose, depth)
// + Advanced-Toggle mit 7 Zusatz-Feldern (Briefing 5.1, Phase C2).
// Die alte 30-Felder-Form (lib PersonForm) bleibt für die Edit-Page,
// hier kommt das Minimal-Quick-Add zum Einsatz.

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
            Vier Felder. Den Rest entdeckt ECHO über die Zeit — oder du
            füllst nach auf der Detail-Seite.
          </p>
        </header>
        <QuickAddForm error={error ? decodeURIComponent(error) : undefined} />
      </div>
    </div>
  );
}
