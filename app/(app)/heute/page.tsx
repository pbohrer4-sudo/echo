// Heute-Dashboard (Phase C4, Briefing v3 #6).
//
// Tägliche Anker-Ansicht für Patrick. Sektionen werden nur gerendert
// wenn sie Inhalt haben — leere Tage = saubere Seite (Briefing-
// Konvention: Empty-States nur in expliziten Kontexten).
//
// Reihenfolge nach Wichtigkeit:
//   1. Pending Suggestions  — was die AI vorschlägt
//   2. Geburtstage 7d       — zeitkritisch
//   3. Reminders heute      — was du dir selbst gemerkt hast
//   4. Reconnect-Modus      — Personen die du wieder anpacken wolltest
//   5. Cadence-Überfällig   — Beziehungen die driften

import Link from "next/link";
import { listAllPending } from "@/lib/suggestions";
import { listInbox } from "@/lib/inbox";
import {
  listReconnectPeople,
  listUpcomingBirthdays,
  listCadenceOverdue,
} from "@/lib/today";
import { listSignals } from "@/lib/signals";
import { APP_CONFIG } from "@/lib/config";
import { MODE_LABELS, PURPOSE_LABELS } from "@/lib/types";
import type { Person } from "@/lib/types";
import { SignalCard } from "./signal-card";

export const metadata = {
  title: "Heute",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function todayDateISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dueLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round(
    (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff === 0) return "heute";
  if (diff === 1) return "morgen";
  if (diff === -1) return "gestern überfällig";
  if (diff < 0) return `${Math.abs(diff)} Tage überfällig`;
  return `in ${diff} Tagen`;
}

export default async function HeutePage() {
  const [
    pendingSuggestions,
    inboxAll,
    birthdays,
    reconnects,
    cadenceOverdue,
    signals,
  ] = await Promise.all([
    listAllPending(5),
    listInbox(),
    listUpcomingBirthdays(7),
    listReconnectPeople(5),
    listCadenceOverdue(5),
    listSignals(),
  ]);

  // Heute-relevante Reminders: Fälligkeit ≤ heute Ende.
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const remindersToday = inboxAll.filter(
    (r) => r.due && new Date(r.due).getTime() <= todayEnd.getTime(),
  );

  const hasAnything =
    pendingSuggestions.length > 0 ||
    remindersToday.length > 0 ||
    birthdays.length > 0 ||
    reconnects.length > 0 ||
    cadenceOverdue.length > 0 ||
    signals.length > 0;

  const now = new Date();
  const greeting =
    now.getHours() < 11
      ? "Guten Morgen"
      : now.getHours() < 18
        ? "Guten Tag"
        : "Guten Abend";

  return (
    <div className="px-6 py-10 sm:px-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Heute</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            {greeting}
          </h1>
          <p className="text-sm text-ink-3">
            {hasAnything
              ? "Das hier braucht heute deine Aufmerksamkeit."
              : `Nichts dringend. ${APP_CONFIG.PUBLIC_NAME} hält die Augen offen.`}
          </p>
        </header>

        {!hasAnything && (
          <div className="rounded-2xl border border-dashed border-rule bg-paper-2 px-6 py-12 text-center">
            <p className="t-label mb-2">Ruhe</p>
            <p className="text-sm text-ink-3">
              Keine offenen Vorschläge, Erinnerungen oder Geburtstage in den
              nächsten 7 Tagen.{" "}
              <Link href="/" className="text-action hover:underline">
                Voice öffnen
              </Link>{" "}
              um eine Notiz oder Person hinzuzufügen.
            </p>
          </div>
        )}

        {pendingSuggestions.length > 0 && (
          <section className="space-y-3">
            <SectionHead title={`Vorschläge · ${pendingSuggestions.length}`} />
            <ul className="space-y-2">
              {pendingSuggestions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/people/${s.person_id}`}
                    className="block rounded border border-rule bg-paper px-4 py-3 transition hover:border-action"
                  >
                    <span className="t-label">{s.suggestion_type}</span>
                    {s.reasoning && (
                      <p className="mt-1 text-sm text-ink-2">
                        {s.reasoning}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {birthdays.length > 0 && (
          <section className="space-y-3">
            <SectionHead title={`Geburtstage · ${birthdays.length}`} />
            <ul className="space-y-2">
              {birthdays.map((b) => (
                <PersonRow
                  key={b.person.id}
                  person={b.person}
                  rightLabel={
                    b.daysAway === 0
                      ? "🎂 heute"
                      : b.daysAway === 1
                        ? "morgen"
                        : `in ${b.daysAway} Tagen`
                  }
                />
              ))}
            </ul>
          </section>
        )}

        {signals.length > 0 && (
          <section className="space-y-3">
            <SectionHead
              title={`Signale · ${signals.length}`}
              rightHref="/people?cluster=reminders"
              rightLabel="Alle"
            />
            <p className="text-[11px] italic text-ink-4">
              Wiederkehrende Anker pro Person — Geburtstage, Follow-ups,
              Lebensereignisse. Klick „Erinnerung +" um daraus einen echten
              Reminder zu machen.
            </p>
            <ul className="overflow-hidden rounded border border-rule bg-paper">
              {signals.map((s) => (
                <SignalCard key={s.tag_id + s.person_id} signal={s} />
              ))}
            </ul>
          </section>
        )}

        {remindersToday.length > 0 && (
          <section className="space-y-3">
            <SectionHead
              title={`Reminders · ${remindersToday.length}`}
              rightHref="/inbox"
              rightLabel="Alle"
            />
            <ul className="space-y-1.5">
              {remindersToday.map((r) => (
                <li
                  key={`${r.kind}-${r.id}`}
                  className="flex items-start gap-3 rounded border border-rule bg-paper px-4 py-2.5"
                >
                  <span className="t-label mt-0.5 shrink-0">
                    {r.kind === "reminder" ? "ERIN" : "TODO"}
                  </span>
                  <span className="flex-1 text-sm text-ink-1">{r.text}</span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-ink-3">
                    {dueLabel(r.due)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {reconnects.length > 0 && (
          <section className="space-y-3">
            <SectionHead title={`Reconnect · ${reconnects.length}`} />
            <ul className="space-y-2">
              {reconnects.map((p) => (
                <PersonRow
                  key={p.id}
                  person={p}
                  rightLabel={
                    p.last_contact_at
                      ? `zuletzt ${dueLabel(p.last_contact_at)}`
                      : "noch kein Kontakt"
                  }
                />
              ))}
            </ul>
          </section>
        )}

        {cadenceOverdue.length > 0 && (
          <section className="space-y-3">
            <SectionHead title={`Cadence-Überfällig · ${cadenceOverdue.length}`} />
            <ul className="space-y-2">
              {cadenceOverdue.map((c) => (
                <PersonRow
                  key={c.person.id}
                  person={c.person}
                  rightLabel={`${c.daysSince}d her · ${c.bucket === "drifting" ? "drifting" : "due-soon"}`}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function SectionHead({
  title,
  rightHref,
  rightLabel,
}: {
  title: string;
  rightHref?: string;
  rightLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="t-label">{title}</span>
      {rightHref && rightLabel && (
        <Link
          href={rightHref}
          className="font-mono text-[10px] uppercase tracking-wider text-ink-4 transition hover:text-ink-1"
        >
          {rightLabel} →
        </Link>
      )}
    </div>
  );
}

function PersonRow({
  person,
  rightLabel,
}: {
  person: Person;
  rightLabel: string;
}) {
  return (
    <li>
      <Link
        href={`/people/${person.id}`}
        className="flex items-center gap-3 rounded border border-rule bg-paper px-4 py-2.5 transition hover:border-action"
      >
        <span className="avatar shrink-0" aria-hidden>
          {initials(person.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink-1">
            {person.name}
          </span>
          <span className="block truncate text-[11px] text-ink-3">
            {[person.role, person.company].filter(Boolean).join(" · ") ||
              (person.purpose ? PURPOSE_LABELS[person.purpose] : MODE_LABELS[person.mode])}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-ink-3">
          {rightLabel}
        </span>
      </Link>
    </li>
  );
}
