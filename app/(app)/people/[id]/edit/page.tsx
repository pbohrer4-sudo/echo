import { notFound } from "next/navigation";
import { getPersonById } from "@/lib/people";
import { listTagsWithNotesForPerson } from "@/lib/tags";
import { listPassionsForPerson } from "@/lib/passions";
import {
  listAllCircles,
  listCirclesForPerson,
} from "@/lib/circles";
import { listContactsForPerson } from "@/lib/person-contacts";
import { getFieldDefs } from "@/lib/custom-fields.server";
import { EditPersonForm } from "./edit-form";

// Edit-Page mit allen scalar + Cluster-Feldern. Multi-Row-Sachen
// (phones/emails/relationships/reminders/todos/multiple-Geographies/
// multiple important_dates beyond Birthday) bleiben den Inline-Buttons
// auf der Detail-Seite vorbehalten — sonst wird die Form unhandlich.

export default async function EditPersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const [person, tags, passions, personCircles, allCircles, contacts, fieldDefs] =
    await Promise.all([
      getPersonById(id),
      listTagsWithNotesForPerson(id),
      listPassionsForPerson(id),
      listCirclesForPerson(id),
      listAllCircles(),
      listContactsForPerson(id),
      getFieldDefs(),
    ]);
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
            Alle Felder dieser Person editierbar. Beziehungen, Reminders,
            Aufgaben, Life Events und mehrere Orte (Wohnsitz-Historie) pflegst
            du via Inline-Buttons auf der Detail-Seite.
          </p>
        </header>

        <EditPersonForm
          person={person}
          tags={tags}
          passions={passions}
          personCircles={personCircles}
          allCircles={allCircles}
          contacts={contacts}
          fieldDefs={fieldDefs}
          error={error ? decodeURIComponent(error) : undefined}
        />
      </div>
    </div>
  );
}
