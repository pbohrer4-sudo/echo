import Link from "next/link";
import { listCadenceRows, type CadenceBucket } from "@/lib/cadence";
import { SmartRemindersPanel } from "@/components/smart-reminders-panel";

const BUCKET_LABEL: Record<CadenceBucket, string> = {
  "on-rhythm": "Auf Rhythmus",
  "due-soon": "Bald fällig",
  drifting: "Drifting",
  "no-contact": "Noch kein Kontakt",
  "no-cadence": "Ohne Cadence",
};

const BUCKET_DESC: Record<CadenceBucket, string> = {
  "on-rhythm": "Letzter Kontakt innerhalb des erwarteten Rhythmus.",
  "due-soon": "Bis 1,5× Rhythmus — bald wieder melden.",
  drifting: "Über 1,5× Rhythmus her — Beziehung läuft weg.",
  "no-contact": "Cadence gesetzt, aber noch keine Interaktion geloggt.",
  "no-cadence": "Keine Cadence konfiguriert — keine Bewertung möglich.",
};

const BUCKET_TONE: Record<CadenceBucket, string> = {
  "on-rhythm": "border-good/40 bg-good/5",
  "due-soon": "border-signal/40 bg-signal-soft",
  drifting: "border-bad/30 bg-bad/5",
  "no-contact": "border-rule bg-paper-2",
  "no-cadence": "border-rule-soft bg-paper",
};

export default async function RhythmusPage() {
  const rows = await listCadenceRows();
  const buckets: CadenceBucket[] = [
    "drifting",
    "due-soon",
    "on-rhythm",
    "no-contact",
    "no-cadence",
  ];
  const grouped = new Map(buckets.map((b) => [b, [] as typeof rows]));
  for (const r of rows) grouped.get(r.bucket)!.push(r);

  const totalRated = rows.filter(
    (r) => r.bucket !== "no-cadence" && r.bucket !== "no-contact",
  ).length;
  const onRhythmCount = grouped.get("on-rhythm")!.length;

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="space-y-2">
          <p className="t-label">Cadence-Health</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Rhythmus
          </h1>
          <p className="text-sm text-ink-3">
            Wer ist im Rhythmus, wer driftet weg. Cadence wird pro Person
            in den Stammdaten gesetzt — nur dort wo gesetzt, hier
            bewertet.
          </p>
          {totalRated > 0 && (
            <p className="text-sm text-ink-2">
              {onRhythmCount} von {totalRated} im Rhythmus
              {totalRated > 0 &&
                ` (${Math.round((onRhythmCount / totalRated) * 100)}%)`}
              .
            </p>
          )}
        </header>

        <SmartRemindersPanel />

        {buckets.map((bucket) => {
          const list = grouped.get(bucket)!;
          if (list.length === 0) return null;
          return (
            <section key={bucket} className="space-y-3">
              <div className="section-head">
                <span className="t-label">
                  {BUCKET_LABEL[bucket]} · {list.length}
                </span>
                <span className="rule" />
              </div>
              <p className="text-xs text-ink-4">{BUCKET_DESC[bucket]}</p>
              <ul
                className={`overflow-hidden rounded border ${BUCKET_TONE[bucket]}`}
              >
                {list.map((row) => (
                  <li
                    key={row.person.id}
                    className="flex items-center justify-between gap-4 border-b border-rule-soft px-4 py-3 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/people/${row.person.id}`}
                        className="block truncate text-sm font-medium text-ink-1 transition hover:text-action"
                      >
                        {row.person.name}
                      </Link>
                      {row.person.role || row.person.company ? (
                        <p className="truncate text-xs text-ink-4">
                          {[row.person.role, row.person.company]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      {row.daysSince !== null ? (
                        <p className="font-mono text-xs text-ink-2">
                          {row.daysSince}{" "}
                          {row.daysSince === 1 ? "Tag" : "Tage"}
                        </p>
                      ) : (
                        <p className="font-mono text-xs text-ink-4">—</p>
                      )}
                      {row.person.expected_cadence_days && (
                        <p className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
                          Soll {row.person.expected_cadence_days}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {rows.length === 0 && (
          <div className="rounded border border-rule bg-paper p-8 text-center text-sm text-ink-3">
            Noch keine Personen mit Cadence. Set in den Stammdaten unter
            „Cadence" Tage zwischen üblichen Kontakten — dann erscheint
            jede Person in einem der Buckets.
          </div>
        )}
      </div>
    </div>
  );
}
