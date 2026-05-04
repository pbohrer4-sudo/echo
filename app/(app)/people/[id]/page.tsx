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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl space-y-10">
        <Link
          href="/people"
          className="t-label inline-flex items-center hover:text-ink-1"
        >
          ← Personen
        </Link>

        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-5">
            <span className="avatar lg" aria-hidden>
              {initials(person.name)}
            </span>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
                {person.name}
              </h1>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="tag">
                  <span className="dot" />
                  {SCOPE_LABEL[person.scope]}
                </span>
                {(person.tags ?? []).map((t) => (
                  <span key={t} className="tag">
                    <span className="dot" />
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/people/${person.id}/edit`}
              className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-ink-3 hover:text-ink-1"
            >
              Bearbeiten
            </Link>
            <DeleteButton id={person.id} name={person.name} />
          </div>
        </div>

        <section>
          <div className="section-head">
            <span className="t-label">Stammdaten</span>
            <span className="rule" />
          </div>
          <dl className="kv">
            <dt>Firma</dt>
            <dd>{person.company ?? "—"}</dd>
            <dt>Rolle</dt>
            <dd>{person.role ?? "—"}</dd>
            <dt>Email</dt>
            <dd className="mono">{person.email ?? "—"}</dd>
            <dt>Telefon</dt>
            <dd className="mono">{person.phone ?? "—"}</dd>
            <dt>Geburtstag</dt>
            <dd>{person.birthday ? fmtDate(person.birthday) : "—"}</dd>
            <dt>Cadence</dt>
            <dd>
              {person.expected_cadence_days
                ? `alle ${person.expected_cadence_days} Tage`
                : "—"}
            </dd>
            <dt>Letzte Interaktion</dt>
            <dd className="mono">{fmtDate(person.last_interaction_at)}</dd>
          </dl>
        </section>

        {person.notes_summary && (
          <section>
            <div className="section-head">
              <span className="t-label">Zusammenfassung</span>
              <span className="rule" />
            </div>
            <p className="text-sm leading-relaxed text-ink-2">
              {person.notes_summary}
            </p>
          </section>
        )}

        <div className="grid gap-10 md:grid-cols-2">
          <section>
            <div className="section-head">
              <span className="t-label">Erinnerungen</span>
              <span className="rule" />
            </div>
            <PersonReminders reminders={reminders} />
          </section>

          <section>
            <div className="section-head">
              <span className="t-label">Aufgaben</span>
              <span className="rule" />
            </div>
            <PersonTodos todos={todos} />
          </section>
        </div>

        <section>
          <div className="section-head">
            <span className="t-label">Timeline</span>
            <span className="rule" />
          </div>
          <PersonTimeline interactions={interactions} notes={notes} />
        </section>
      </div>
    </div>
  );
}
