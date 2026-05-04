import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getPersonById } from "@/lib/people";
import {
  listInteractionsForPerson,
  listNotesForPerson,
  listRemindersForPerson,
  listTodosForPerson,
  getPeopleMap,
} from "@/lib/inbox";
import type { Scope } from "@/lib/types";
import { DeleteButton } from "./delete-button";
import { PersonTimeline } from "./timeline";
import { PersonReminders, PersonTodos } from "./person-tasks";
import {
  AddressList,
  DateList,
  EmailList,
  PhoneList,
  RelationshipList,
  SocialList,
} from "./contact-fields";

const SCOPE_LABEL: Record<Scope, string> = {
  work: "Beruflich",
  personal: "Privat",
  both: "Beides",
};

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

  const relatedIds = (person.relationships ?? []).map(
    (r) => r.related_person_id,
  );
  const [interactions, notes, reminders, todos, peopleMap] = await Promise.all(
    [
      listInteractionsForPerson(id),
      listNotesForPerson(id),
      listRemindersForPerson(id),
      listTodosForPerson(id),
      getPeopleMap(relatedIds),
    ],
  );

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl space-y-10">
        <Link
          href={person.is_self ? "/" : "/people"}
          className="t-label inline-flex items-center hover:text-ink-1"
        >
          ← {person.is_self ? "Zurück" : "Personen"}
        </Link>

        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-5">
            {person.avatar_url ? (
              <Image
                src={person.avatar_url}
                alt={person.name}
                width={64}
                height={64}
                className="h-16 w-16 rounded-full object-cover ring-1 ring-rule"
                unoptimized
              />
            ) : (
              <span className="avatar lg" aria-hidden>
                {initials(person.name)}
              </span>
            )}
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
                {person.name}
              </h1>
              {(person.role || person.company) && (
                <p className="text-sm text-ink-3">
                  {[person.role, person.company].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {person.is_self && (
                  <span
                    className="tag"
                    style={{
                      borderColor: "var(--action)",
                      color: "var(--action)",
                    }}
                  >
                    Mein Profil
                  </span>
                )}
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

        <div className="grid gap-10 md:grid-cols-2">
          <section>
            <div className="section-head">
              <span className="t-label">Telefon</span>
              <span className="rule" />
            </div>
            <PhoneList phones={person.phones ?? []} />
          </section>

          <section>
            <div className="section-head">
              <span className="t-label">Email</span>
              <span className="rule" />
            </div>
            <EmailList emails={person.emails ?? []} />
          </section>
        </div>

        {(person.addresses?.length ?? 0) > 0 && (
          <section>
            <div className="section-head">
              <span className="t-label">Adressen</span>
              <span className="rule" />
            </div>
            <AddressList addresses={person.addresses ?? []} />
          </section>
        )}

        {(person.socials?.length ?? 0) > 0 && (
          <section>
            <div className="section-head">
              <span className="t-label">Social</span>
              <span className="rule" />
            </div>
            <SocialList socials={person.socials ?? []} />
          </section>
        )}

        <div className="grid gap-10 md:grid-cols-2">
          <section>
            <div className="section-head">
              <span className="t-label">Wichtige Daten</span>
              <span className="rule" />
            </div>
            <DateList
              dates={person.important_dates ?? []}
              personId={person.id}
            />
          </section>

          <section>
            <div className="section-head">
              <span className="t-label">Beziehungen</span>
              <span className="rule" />
            </div>
            <RelationshipList
              relationships={person.relationships ?? []}
              peopleMap={peopleMap}
            />
          </section>
        </div>

        {(person.notes || person.notes_summary) && (
          <section>
            <div className="section-head">
              <span className="t-label">Notizen</span>
              <span className="rule" />
            </div>
            {person.notes && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-1">
                {person.notes}
              </p>
            )}
            {person.notes_summary && (
              <div className="mt-4 rounded border border-rule-soft bg-paper-2 p-4">
                <p className="t-label mb-2">ECHO-Zusammenfassung</p>
                <p className="text-sm text-ink-2">{person.notes_summary}</p>
              </div>
            )}
          </section>
        )}

        {person.expected_cadence_days && (
          <section>
            <div className="section-head">
              <span className="t-label">Cadence</span>
              <span className="rule" />
            </div>
            <p className="text-sm text-ink-1">
              alle {person.expected_cadence_days} Tage
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
