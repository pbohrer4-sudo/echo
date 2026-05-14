import { notFound } from "next/navigation";
import { getPersonById } from "@/lib/people";
import { EditPersonForm } from "./edit-form";

// Schlanke Edit-Form für die scalar Felder auf people. Arrays/JSONB
// (phones/emails/relationships/important_dates/etc.) werden direkt
// auf der Detail-Page via inline-Forms gepflegt, nicht hier — das
// hält diese Form fokussiert.

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

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-2">
          <p className="t-label">Bearbeiten</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            {person.name}
          </h1>
          <p className="text-sm text-ink-3">
            Grunddaten. Tags, Leidenschaften, Kreise, Telefon, Email,
            Beziehungen, wichtige Daten, Erinnerungen, Aufgaben, Orte,
            Notes pflegst du direkt auf der Detail-Seite per Inline-Buttons.
          </p>
        </header>

        <EditPersonForm
          person={person}
          error={error ? decodeURIComponent(error) : undefined}
        />
      </div>
    </div>
  );
}
