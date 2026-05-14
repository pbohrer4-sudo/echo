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
      <div className="space-y-3">
        {GROUP_ORDER.filter((t) => grouped.has(t)).map((type) => (
          <div key={type} className="space-y-1.5">
            <span className="t-label">
              {type === "custom"
                ? "Weitere"
                : GEO_TYPE_LABELS[type]}
            </span>
            <ul className="space-y-1">
              {grouped.get(type)!.map((g) => (
                <GeoRow key={g.id} geo={g} />
              ))}
            </ul>
          </div>
        ))}
        {inactive.length > 0 && (
          <details className="space-y-1.5">
            <summary className="t-label cursor-pointer text-ink-4 transition hover:text-ink-2">
              Frühere Orte ({inactive.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {inactive.map((g) => (
                <GeoRow key={g.id} geo={g} muted />
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

function GeoRow({ geo, muted = false }: { geo: PersonGeography; muted?: boolean }) {
  // Kompakter Display-Name — erste Komma-Component reicht meistens,
  // aber wenn die strukturierte Adresse separat existiert, sie
  // bevorzugen.
  const compact = geo.city ?? geo.display_name.split(",")[0];
  const detail = geo.display_name !== compact ? geo.display_name : null;
  return (
    <li
      className={`flex flex-col text-sm ${muted ? "text-ink-4" : "text-ink-1"}`}
    >
      <span className="flex items-baseline gap-2">
        <span>{geo.custom_label || compact}</span>
        {geo.custom_label && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
            {geo.country_code ?? ""}
          </span>
        )}
      </span>
      {detail && (
        <span className="text-[11px] text-ink-4">{detail}</span>
      )}
    </li>
  );
}
