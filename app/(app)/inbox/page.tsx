import { listInbox, getPeopleMap } from "@/lib/inbox";
import { InboxRowItem } from "./inbox-row";

export default async function InboxPage() {
  const rows = await listInbox();

  const personIds = Array.from(
    new Set(rows.map((r) => r.person_id).filter((id): id is string => !!id)),
  );
  const peopleMap = await getPeopleMap(personIds);

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Was offen ist</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Inbox
          </h1>
          <p className="text-sm text-ink-3">
            Erinnerungen und Aufgaben — sortiert nach Fälligkeit.
          </p>
        </header>

        {rows.length === 0 ? (
          <div className="rounded border border-rule bg-paper px-6 py-16 text-center">
            <p className="text-sm text-ink-3">
              Nichts offen. Sprich gerade etwas oder leg manuell an.
            </p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded border border-rule bg-paper">
            {rows.map((r) => (
              <InboxRowItem
                key={`${r.kind}-${r.id}`}
                row={r}
                personName={r.person_id ? peopleMap[r.person_id] ?? null : null}
              />
            ))}
          </ul>
        )}

        <p className="t-label">{rows.length} offen</p>
      </div>
    </div>
  );
}
