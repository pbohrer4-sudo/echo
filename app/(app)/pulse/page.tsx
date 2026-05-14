// Sonntags-Puls (Re-Design, Briefing v3 §6).
//
// Statt einem KI-Fließtext rendert die Seite jetzt vier interaktive
// Sektionen mit Quick-Actions pro Item:
//   - Geburtstage diese Woche (Person-Link + Draft → WhatsApp)
//   - Überfällige Reconnects (Stale-People mit cadence × 1.5)
//   - Offene Reminders (Snooze / Erledigt / Draft)
//   - Offene Todos (Snooze / Erledigt)
// AI-Pulse-Generierung bleibt als optionale Bottom-Card erhalten.

import { listPulseData } from "@/lib/pulse";
import { PulseSection } from "./pulse-section";
import { PulseItem } from "./pulse-item";
import { PulseRunner } from "@/components/pulse-runner";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function daysAgoLabel(days: number): string {
  if (days <= 1) return "heute";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}m`;
  return `${Math.floor(days / 365)}j`;
}

function daysUntilLabel(days: number): string {
  if (days === 0) return "heute";
  if (days === 1) return "morgen";
  return `in ${days}d`;
}

export default async function PulsePage() {
  const data = await listPulseData();

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Sonntags-Puls</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Wochenrhythmus
          </h1>
          <p className="max-w-xl text-sm text-ink-3">
            Wer war länger nicht auf dem Schirm, welche Versprechen sind
            offen, welche Geburtstage stehen an. Quick-Actions pro Item:
            Draft öffnet WhatsApp, +1W/+1M snoozen, ✓ erledigt.
          </p>
        </header>

        <PulseSection
          label="Geburtstage diese Woche"
          count={data.upcomingBirthdays.length}
          empty="Keine Geburtstage in den nächsten 7 Tagen."
        >
          {data.upcomingBirthdays.map((b) => (
            <PulseItem
              key={`bday-${b.person_id}-${b.date}`}
              kind="birthday"
              id={b.person_id}
              personId={b.person_id}
              primary={b.name}
              badge={daysUntilLabel(b.days_until)}
              secondary={
                <>
                  {b.date.slice(5)}
                  {b.age_turning !== null && ` · wird ${b.age_turning}`}
                </>
              }
            />
          ))}
        </PulseSection>

        <PulseSection
          label="Überfällige Reconnects"
          hint="Personen wo cadence × 1.5 überschritten ist und kein aktiver Snooze läuft."
          count={data.stalePeople.length}
          empty="Alle Cadences sind im grünen Bereich."
        >
          {data.stalePeople.slice(0, 12).map((p) => (
            <PulseItem
              key={`stale-${p.id}`}
              kind="stale_person"
              id={p.id}
              personId={p.id}
              personPhone={p.primary_phone}
              primary={p.name}
              badge={`${daysAgoLabel(p.days_since)} her`}
              secondary={
                <>
                  Letzter Kontakt {formatDate(p.last_contact_at)}
                  {p.cadence_days && ` · cadence ${p.cadence_days}d`}
                </>
              }
            />
          ))}
        </PulseSection>

        <PulseSection
          label="Offene Reminders"
          count={data.openReminders.length}
          empty="Inbox ist leer."
        >
          {data.openReminders.slice(0, 10).map((r) => (
            <PulseItem
              key={`rem-${r.id}`}
              kind="reminder"
              id={r.id}
              personId={r.person_id ?? null}
              primary={r.text}
              badge={r.recurrence !== "once" ? r.recurrence : undefined}
              secondary={
                <>
                  {formatDate(r.remind_at)}
                  {r.person_name && ` · ${r.person_name}`}
                </>
              }
            />
          ))}
        </PulseSection>

        <PulseSection
          label="Offene Todos"
          count={data.openTodos.length}
          empty="Keine offenen Todos."
        >
          {data.openTodos.slice(0, 10).map((t) => (
            <PulseItem
              key={`todo-${t.id}`}
              kind="todo"
              id={t.id}
              personId={t.person_id ?? null}
              primary={t.text}
              badge={t.priority !== "medium" ? t.priority : undefined}
              secondary={
                <>
                  {t.due_date ? `fällig ${formatDate(t.due_date)}` : "kein Datum"}
                  {t.person_name && ` · ${t.person_name}`}
                </>
              }
            />
          ))}
        </PulseSection>

        {/* AI-Zusammenfassung — collapsed by default, generiert nur on demand */}
        <details className="rounded border border-rule bg-paper">
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition hover:bg-paper-2">
            <span className="t-label">KI-Wochenzusammenfassung</span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
              Optional · kostet API-Cents
            </span>
          </summary>
          <div className="border-t border-rule-soft p-4">
            <PulseRunner />
          </div>
        </details>
      </div>
    </div>
  );
}
