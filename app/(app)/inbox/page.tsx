import { listInbox, getPeopleMap, type InboxRow } from "@/lib/inbox";
import { listUnreadWhatsapp } from "@/lib/whatsapp-inbox";
import { InboxRowItem } from "./inbox-row";
import { WhatsappInboxStrip } from "@/components/whatsapp-inbox-strip";
import { AgendaCalendar, type DayMarker } from "./agenda-calendar";
import { CtaProvider } from "./cta-provider";

// Reminders gelten erst als „offen" wenn sie heute oder früher fällig
// sind. Zukünftige Erinnerungen (Geburtstage in 4 Wochen, Hochzeitstag
// in 3 Monaten) tauchen in der „Anstehend"-Sektion auf — sichtbar
// chronologisch, aber sie zählen nicht in die OFFEN-Anzahl und blockieren
// nicht die mentale Bandbreite des Users.

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function dateKey(iso: string): string {
  // YYYY-MM-DD (lokale Zeit). Für Gruppierung des Anstehend-Buckets
  // damit Items am selben Tag zusammen erscheinen.
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateHeading(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  const weekday = date.toLocaleDateString("de-DE", { weekday: "long" });
  const fmt = date.toLocaleDateString("de-DE", {
    day: "numeric",
    month: "long",
  });
  if (diffDays === 0) return `Heute · ${weekday}, ${fmt}`;
  if (diffDays === 1) return `Morgen · ${weekday}, ${fmt}`;
  if (diffDays < 7) return `${weekday}, ${fmt}`;
  return `${weekday}, ${fmt}`;
}

function groupByDay(rows: InboxRow[]): Array<{ day: string; rows: InboxRow[] }> {
  const map = new Map<string, InboxRow[]>();
  for (const r of rows) {
    if (!r.due) continue;
    const key = dateKey(r.due);
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, rows]) => ({ day, rows }));
}

export default async function InboxPage() {
  const [rows, waRows] = await Promise.all([
    listInbox(),
    listUnreadWhatsapp(),
  ]);

  const personIds = Array.from(
    new Set(rows.map((r) => r.person_id).filter((id): id is string => !!id)),
  );
  const peopleMap = await getPeopleMap(personIds);

  // Bucket: "due" = überfällig oder heute fällig + alle ohne Datum.
  // "upcoming" = strikt in der Zukunft (ab morgen 00:00).
  const cutoff = endOfToday().toISOString();
  const due: InboxRow[] = [];
  const upcoming: InboxRow[] = [];
  for (const r of rows) {
    if (!r.due) {
      due.push(r);
    } else if (r.due <= cutoff) {
      due.push(r);
    } else {
      upcoming.push(r);
    }
  }
  const upcomingGroups = groupByDay(upcoming);

  // Kalender-Marker: aggregiert beide Buckets damit der Kalender
  // sowohl heute-fällige (rot) als auch anstehende (action-Farbe)
  // Tage anzeigt. Items ohne due werden ignoriert.
  const markerMap = new Map<string, DayMarker>();
  for (const r of [...due, ...upcoming]) {
    if (!r.due) continue;
    const key = dateKey(r.due);
    const existing = markerMap.get(key);
    const isDue = r.due <= cutoff;
    if (existing) {
      existing.count += 1;
      if (isDue) existing.due = true;
    } else {
      markerMap.set(key, { key, count: 1, due: isDue });
    }
  }
  const markers = [...markerMap.values()];

  // Reminder-IDs für den batched CTA-Fetch. Todos haben keine CTAs
  // (anders strukturiert — die User-Aufgabe ist meistens schon die
  // Aktion), also nur Reminders sammeln.
  const reminderIds = [
    ...due.filter((r) => r.kind === "reminder").map((r) => r.id),
    ...upcoming.filter((r) => r.kind === "reminder").map((r) => r.id),
  ];

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Was offen ist</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Reminders
          </h1>
          <p className="text-sm text-ink-3">
            Heute fällig oben. Anstehend chronologisch darunter — sichtbar,
            aber zählt nicht als „offen" bis es soweit ist.
          </p>
        </header>

        <WhatsappInboxStrip rows={waRows} />

        {/* — Kalender-Übersicht (current + next month) — */}
        {markers.length > 0 && (
          <section className="rounded border border-rule bg-paper px-4 py-4">
            <AgendaCalendar markers={markers} />
            <p className="mt-3 text-[10px] text-ink-4">
              Rote Punkte = heute fällig oder überfällig · graue Punkte =
              anstehend. Klick auf einen Tag scrollt zur Liste.
            </p>
          </section>
        )}

        <CtaProvider reminderIds={reminderIds}>
        {/* — Heute & Überfällig — */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium text-ink-1">
              Heute & Überfällig
            </h2>
            <p className="t-label">{due.length} offen</p>
          </div>
          {due.length === 0 ? (
            <div className="rounded border border-rule bg-paper px-6 py-12 text-center">
              <p className="text-sm text-ink-3">
                Nichts offen. Heute ist alles abgehakt.
              </p>
            </div>
          ) : (
            <ul className="overflow-hidden rounded border border-rule bg-paper">
              {due.map((r) => (
                <InboxRowItem
                  key={`${r.kind}-${r.id}`}
                  row={r}
                  personName={r.person_id ? peopleMap[r.person_id] ?? null : null}
                />
              ))}
            </ul>
          )}
        </section>

        {/* — Anstehend — */}
        {upcomingGroups.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-medium text-ink-1">Anstehend</h2>
              <p className="t-label">{upcoming.length} geplant</p>
            </div>
            <div className="space-y-5">
              {upcomingGroups.map((g) => (
                <div key={g.day} id={`day-${g.day}`} className="space-y-2 scroll-mt-20">
                  <p className="text-[11px] uppercase tracking-wider text-ink-4">
                    {formatDateHeading(g.day)}
                  </p>
                  <ul className="overflow-hidden rounded border border-rule bg-paper">
                    {g.rows.map((r) => (
                      <InboxRowItem
                        key={`${r.kind}-${r.id}`}
                        row={r}
                        personName={
                          r.person_id ? peopleMap[r.person_id] ?? null : null
                        }
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}
        </CtaProvider>
      </div>
    </div>
  );
}
