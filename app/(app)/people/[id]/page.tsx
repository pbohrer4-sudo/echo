import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonById } from "@/lib/people";
import {
  listInteractionsForPerson,
  listNotesForPerson,
  listRemindersForPerson,
  listTodosForPerson,
} from "@/lib/inbox";
import type { Scope } from "@/lib/types";
import { DeleteButton } from "./delete-button";
import { PersonTimeline } from "./timeline";
import { PersonReminders, PersonTodos } from "./person-tasks";

const SCOPE_LABEL: Record<Scope, string> = {
  work: "Beruflich",
  personal: "Privat",
  both: "Beides",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const person = await getPersonById(id);
  if (!person) notFound();

  const [interactions, notes, reminders, todos] = await Promise.all([
    listInteractionsForPerson(id),
    listNotesForPerson(id),
    listRemindersForPerson(id),
    listTodosForPerson(id),
  ]);

  const fields: Array<{ label: string; value: string | null }> = [
    { label: "Firma", value: person.company },
    { label: "Rolle", value: person.role },
    { label: "Email", value: person.email },
    { label: "Telefon", value: person.phone },
    {
      label: "Geburtstag",
      value: person.birthday ? fmtDate(person.birthday) : null,
    },
    {
      label: "Cadence",
      value: person.expected_cadence_days
        ? `alle ${person.expected_cadence_days} Tage`
        : null,
    },
  ];

  return (
    <div className="px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Link
              href="/people"
              className="text-xs uppercase tracking-widest text-neutral-500 hover:text-neutral-300"
            >
              ← Personen
            </Link>
            <h1 className="font-serif text-4xl tracking-tight">{person.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                {SCOPE_LABEL[person.scope]}
              </span>
              {(person.tags ?? []).map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-neutral-800 px-2 py-0.5 text-xs text-neutral-400"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/people/${person.id}/edit`}
              className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-600 hover:text-neutral-100"
            >
              Bearbeiten
            </Link>
            <DeleteButton id={person.id} name={person.name} />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-md border border-neutral-900 p-6">
          {fields.map(({ label, value }) => (
            <div key={label} className="space-y-1">
              <dt className="text-xs uppercase tracking-wider text-neutral-500">
                {label}
              </dt>
              <dd className="text-sm text-neutral-200">{value ?? "—"}</dd>
            </div>
          ))}
          <div className="space-y-1">
            <dt className="text-xs uppercase tracking-wider text-neutral-500">
              Letzte Interaktion
            </dt>
            <dd className="font-mono text-sm text-neutral-200">
              {fmtDate(person.last_interaction_at)}
            </dd>
          </div>
        </dl>

        {person.notes_summary && (
          <section className="rounded-md border border-neutral-900 p-6">
            <h2 className="mb-3 text-xs uppercase tracking-wider text-neutral-500">
              Zusammenfassung
            </h2>
            <p className="text-sm text-neutral-300">{person.notes_summary}</p>
          </section>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-md border border-neutral-900 p-6">
            <h2 className="mb-4 text-xs uppercase tracking-wider text-neutral-500">
              Erinnerungen
            </h2>
            <PersonReminders reminders={reminders} />
          </section>

          <section className="rounded-md border border-neutral-900 p-6">
            <h2 className="mb-4 text-xs uppercase tracking-wider text-neutral-500">
              Aufgaben
            </h2>
            <PersonTodos todos={todos} />
          </section>
        </div>

        <section className="rounded-md border border-neutral-900 p-6">
          <h2 className="mb-4 text-xs uppercase tracking-wider text-neutral-500">
            Timeline
          </h2>
          <PersonTimeline interactions={interactions} notes={notes} />
        </section>
      </div>
    </div>
  );
}
