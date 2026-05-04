import { listInbox, getPeopleMap } from "@/lib/inbox";
import { InboxRowItem } from "./inbox-row";

export default async function InboxPage() {
  const rows = await listInbox();

  const personIds = Array.from(
    new Set(rows.map((r) => r.person_id).filter((id): id is string => !!id)),
  );
  const peopleMap = await getPeopleMap(personIds);

  return (
    <div className="px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1">
          <h1 className="font-serif text-3xl tracking-tight">Inbox</h1>
          <p className="text-sm text-neutral-500">
            Offene Erinnerungen und Aufgaben — sortiert nach Fälligkeit.
          </p>
        </header>

        {rows.length === 0 ? (
          <div className="rounded-md border border-neutral-900 px-6 py-16 text-center">
            <p className="text-sm text-neutral-500">
              Nichts offen. Sprich gerade etwas oder leg manuell an.
            </p>
          </div>
        ) : (
          <ul className="rounded-md border border-neutral-900">
            {rows.map((r) => (
              <InboxRowItem
                key={`${r.kind}-${r.id}`}
                row={r}
                personName={r.person_id ? peopleMap[r.person_id] ?? null : null}
              />
            ))}
          </ul>
        )}

        <p className="text-xs text-neutral-600">
          {rows.length} offen
        </p>
      </div>
    </div>
  );
}
