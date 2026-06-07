// Geographies-Block auf Person-Detail (Phase 2 V3-Migration, 0030).
//
// Mehrere Geo-Einträge pro Person gruppiert nach geo_type. Inaktive
// (historisch) werden separat unter „Frühere Orte" angezeigt. Optional
// rendert ein „+ Ort"-Slot rechts im Section-Header (durchgereicht
// vom Parent — die Server-Action lebt in app/, die Komponente in components/).

import type { ReactNode } from "react";
import { GEO_TYPE_LABELS, type GeoType, type PersonGeography } from "@/lib/types";

interface Props {
  geographies: PersonGeography[];
  addSlot?: ReactNode;
}

const GROUP_ORDER: GeoType[] = [
  "residence",
  "current_location",
  "professional_hub",
  "origin",
  "met_location",
  "custom",
];

export function GeographiesList({ geographies, addSlot }: Props) {
  // Auch wenn leer: Sektion rendern wenn ein addSlot da ist, damit
  // der „+ Ort"-Button sichtbar bleibt.
  if (geographies.length === 0 && !addSlot) return null;

  const active = geographies.filter((g) => g.is_active);
  const inactive = geographies.filter((g) => !g.is_active);

  const grouped = new Map<GeoType, PersonGeography[]>();
  for (const g of active) {
    if (!grouped.has(g.geo_type)) grouped.set(g.geo_type, []);
    grouped.get(g.geo_type)!.push(g);
  }

  return (
    <section className="space-y-3">
      <div className="section-head">
        <span className="t-label">Orte</span>
        <span className="rule" />
        {addSlot}
      </div>
      {geographies.length === 0 && (
        <p className="text-[11px] italic text-ink-4">
          Noch keine Orte hinterlegt.
        </p>
      )}
      {/* Boxed rows — gleiche Optik wie Stammdaten / Origin. */}
      {active.length > 0 && (
        <dl className="overflow-hidden rounded border border-rule bg-paper">
          {GROUP_ORDER.filter((t) => grouped.has(t)).flatMap((type) =>
            grouped.get(type)!.map((g) => (
              <GeoRow
                key={g.id}
                label={type === "custom" ? "Weitere" : GEO_TYPE_LABELS[type]}
                geo={g}
              />
            )),
          )}
        </dl>
      )}
      {inactive.length > 0 && (
        <details className="space-y-1.5">
          <summary className="t-label cursor-pointer text-ink-4 transition hover:text-ink-2">
            Frühere Orte ({inactive.length})
          </summary>
          <dl className="mt-2 overflow-hidden rounded border border-rule bg-paper">
            {inactive.map((g) => (
              <GeoRow
                key={g.id}
                label={
                  g.geo_type === "custom"
                    ? "Weitere"
                    : GEO_TYPE_LABELS[g.geo_type]
                }
                geo={g}
                muted
              />
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}

function GeoRow({
  label,
  geo,
  muted = false,
}: {
  label: string;
  geo: PersonGeography;
  muted?: boolean;
}) {
  // Kompakter Display-Name — erste Komma-Component reicht meistens,
  // aber wenn die strukturierte Adresse separat existiert, sie
  // bevorzugen.
  const compact = geo.city ?? geo.display_name.split(",")[0];
  const detail = geo.display_name !== compact ? geo.display_name : null;
  return (
    <div className="flex items-center gap-3 border-b border-rule-soft px-4 py-2.5 last:border-0">
      <dt className="t-label">{label}</dt>
      <dd
        className={`ml-auto flex min-w-0 flex-col items-end text-right text-sm ${
          muted ? "text-ink-4" : "text-ink-1"
        }`}
      >
        <span className="truncate">{geo.custom_label || compact}</span>
        {detail && (
          <span className="truncate text-[11px] text-ink-4">{detail}</span>
        )}
      </dd>
    </div>
  );
}
