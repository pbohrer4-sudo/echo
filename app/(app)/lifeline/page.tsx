// Globale Lifeline-Ansicht (Phase D2, Briefing v3 §11 Globale Lifeline).
// Chronologische Liste aller Life Events über alle Personen, gruppiert
// nach Monat. Klick auf Card → Person-Detail des verknüpften Menschen.

import Image from "next/image";
import Link from "next/link";
import { listAllLifeEvents, getSignedFileUrl } from "@/lib/life-events";
import {
  LIFE_EVENT_LABELS,
  type LifeEventType,
} from "@/lib/types";

export const metadata = {
  title: "Lifeline",
};

function formatMonthHeader(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
  });
}

function eventGradient(type: LifeEventType): string {
  switch (type) {
    case "photo":
      return "linear-gradient(135deg, #FCE3E1 0%, #F4C8C5 100%)";
    case "document":
      return "linear-gradient(135deg, #DCEAFA 0%, #B7D2EF 100%)";
    case "voice_note":
      return "linear-gradient(135deg, #F4DDF0 0%, #E5BBE0 100%)";
    case "milestone":
      return "linear-gradient(135deg, #FAEEDA 0%, #ECD1A0 100%)";
    case "note":
      return "linear-gradient(135deg, #E1F5EE 0%, #B6E0CF 100%)";
  }
}

function glyphFor(type: LifeEventType): string {
  switch (type) {
    case "photo":
      return "🖼";
    case "document":
      return "📄";
    case "voice_note":
      return "🎙";
    case "milestone":
      return "⭐";
    case "note":
      return "📝";
  }
}

export default async function LifelinePage() {
  const events = await listAllLifeEvents();

  // Signed-URLs parallel auflösen
  const withUrls = await Promise.all(
    events.map(async (e) => ({
      ...e,
      fileUrl: await getSignedFileUrl(e.event.file_path),
      thumbnailUrl: await getSignedFileUrl(e.event.thumbnail_path),
    })),
  );

  // Nach Monat gruppieren
  const grouped = new Map<
    string,
    typeof withUrls
  >();
  for (const item of withUrls) {
    const key = formatMonthHeader(item.event.occurred_at);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }

  return (
    <div className="px-6 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Lifeline</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Was war
          </h1>
          <p className="max-w-xl text-sm text-ink-3">
            Chronologie aller Fotos, Dokumente, Voice-Notes und Meilensteine
            über alle Personen.
          </p>
        </header>

        {withUrls.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-rule bg-paper-2 px-6 py-12 text-center">
            <p className="t-label mb-2">Noch leer</p>
            <p className="text-sm text-ink-3">
              Life Events sammeln sich auf jeder Personen-Seite. Erst dort
              eines anlegen, dann landet es hier in der Chronik.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {Array.from(grouped.entries()).map(([month, items]) => (
              <section key={month} className="space-y-3">
                <div className="section-head">
                  <span className="t-label">
                    {month} ({items.length})
                  </span>
                  <span className="rule" />
                </div>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li
                      key={item.event.id}
                      className="overflow-hidden rounded-2xl border border-rule bg-paper transition hover:border-action"
                    >
                      <div className="flex">
                        {/* Linkes Thumbnail */}
                        <div
                          className="relative h-24 w-24 shrink-0"
                          style={
                            item.thumbnailUrl ||
                            (item.event.event_type === "photo" && item.fileUrl)
                              ? undefined
                              : {
                                  background: eventGradient(
                                    item.event.event_type,
                                  ),
                                }
                          }
                        >
                          {(item.thumbnailUrl ??
                            (item.event.event_type === "photo"
                              ? item.fileUrl
                              : null)) && (
                            <Image
                              src={
                                item.thumbnailUrl ?? item.fileUrl!
                              }
                              alt={item.event.title}
                              fill
                              sizes="96px"
                              className="object-cover"
                              unoptimized
                            />
                          )}
                          {!item.thumbnailUrl &&
                            item.event.event_type !== "photo" && (
                              <span className="absolute inset-0 flex items-center justify-center text-2xl">
                                {glyphFor(item.event.event_type)}
                              </span>
                            )}
                        </div>
                        {/* Rechte Meta */}
                        <div className="min-w-0 flex-1 space-y-1 px-4 py-3">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-sm font-medium text-ink-1">
                              {item.event.title}
                            </span>
                            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-ink-3">
                              {formatDay(item.event.occurred_at)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                            <span className="rounded-full bg-paper-2 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider">
                              {LIFE_EVENT_LABELS[item.event.event_type]}
                            </span>
                            {item.event.location_name && (
                              <span>📍 {item.event.location_name}</span>
                            )}
                            {item.persons.length > 0 && (
                              <span className="flex flex-wrap gap-1">
                                {item.persons.slice(0, 3).map((p) => (
                                  <Link
                                    key={p.id}
                                    href={`/people/${p.id}`}
                                    className="text-action hover:underline"
                                  >
                                    {p.name}
                                  </Link>
                                ))}
                                {item.persons.length > 3 && (
                                  <span>+{item.persons.length - 3}</span>
                                )}
                              </span>
                            )}
                          </div>
                          {item.event.description && (
                            <p className="line-clamp-2 text-xs text-ink-2">
                              {item.event.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
