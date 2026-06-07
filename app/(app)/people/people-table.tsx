"use client";

// People-Tabelle (Phase C5 v7).
//
// Spalten ein-/ausblenden, sortieren, drag-and-drop reordern — alles
// über den generischen useColumnConfig-Hook plus die data-table
// Components. Avatar + Name links gepinnt, Aktionen rechts. Filter und
// Row-Rendering bleibt people-spezifisch.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { bulkDeletePeopleAction } from "./bulk-actions";
import {
  isEmptyFilter,
  serializeFilterToParams,
  type PeopleFilterSpec,
} from "@/lib/people-filter";
import {
  CIRCLE_COLOR,
  DEPTH_LABELS,
  MODE_LABELS,
  PASSION_COLOR,
  PURPOSE_LABELS,
  TAG_CLUSTER_COLORS,
  TAG_CLUSTER_LABELS,
  type CircleRow,
  type Depth,
  type Mode,
  type Person,
  type Purpose,
  type TagCluster,
} from "@/lib/types";
import {
  useColumnConfig,
  type DataTableColumn,
  type SortDir,
} from "@/hooks/use-column-config";
import { ColumnPopover } from "@/components/data-table/column-popover";
import { SortableHeaderRow } from "@/components/data-table/sortable-header-row";

type SortKey = "name" | "company" | "last_contact_at";
type ChannelFilter = "all" | "has_phone" | "has_email" | "has_linkedin";

interface Row {
  person: Person;
  tagsByCluster: Record<string, string[]>;
  clusters: string[];
  passions: string[];
  circleIds: string[];
  // 0028 — per-link Notes (pro Tag-Name / Passion-Lower / Circle-ID).
  tagNotes: Record<string, string>;
  passionNotes: Record<string, string>;
  circleNotes: Record<string, string>;
  // 0030 — V3 strukturierte Aggregation (parallel zu JSONB-Feldern bis Phase 3)
  cityList: string[];          // lower-case Cities + display_names aus person_geographies
  contactChannels: string[];   // distinct channels aus person_contacts
}

interface LocationOption {
  value: string; // lower-cased
  label: string; // original
}

interface Props {
  rows: Row[];
  circles: CircleRow[];
  passions: string[];
  locations: LocationOption[];
  totalCount?: number;
  // Voice / Deep-Link: initiale Filter aus URL-Params. Wenn gesetzt,
  // wird die UI sofort mit diesen Filtern gerendert; jede manuelle
  // Änderung schreibt zurück in die URL.
  initialFilter?: PeopleFilterSpec;
}

// ───────── Column Registry ─────────
type ColumnKey =
  | "select"      // always (bulk-delete checkbox)
  | "avatar"      // always
  | "name"        // always
  | "company"
  | "purpose"
  | "mode"
  | "depth"
  | "cadence"
  | "last_contact"
  | "current_location"
  | "met_location"
  | "gifts"       // gift_idea, filterbar (hat/hat nicht)
  | "reminders"   // Tag-Cluster
  | "interests"   // Tag-Cluster
  | "potential"   // Tag-Cluster
  | "origin"      // Tag-Cluster
  | "passions"
  | "circles"
  | "actions";    // always

type ColumnDef = DataTableColumn<ColumnKey, SortKey>;

const COLUMNS: ColumnDef[] = [
  { key: "select", label: "", always: true, default: true, gridCol: "32px", pinned: "start" },
  { key: "avatar", label: "Avatar", always: true, default: true, gridCol: "40px", pinned: "start" },
  { key: "name", label: "Name", always: true, default: true, sortKey: "name", gridCol: "minmax(180px,1.6fr)", pinned: "start" },
  { key: "company", label: "Firma · Rolle", default: true, sortKey: "company", gridCol: "minmax(140px,1fr)" },
  { key: "purpose", label: "Purpose", default: true, gridCol: "100px" },
  { key: "mode", label: "Mode", default: true, gridCol: "100px" },
  { key: "depth", label: "Depth", default: false, gridCol: "110px" },
  { key: "cadence", label: "Cadence", default: false, gridCol: "80px", align: "right" },
  { key: "last_contact", label: "Letzter Kontakt", default: true, sortKey: "last_contact_at", gridCol: "110px" },
  { key: "current_location", label: "Stadt", default: false, gridCol: "120px" },
  { key: "met_location", label: "Wo getroffen", default: false, gridCol: "140px" },
  { key: "gifts", label: "Gifts", default: false, gridCol: "minmax(140px,1fr)" },
  { key: "reminders", label: "Signale", default: false, gridCol: "minmax(200px,1.4fr)" },
  { key: "interests", label: "Interests", default: false, gridCol: "minmax(200px,1.4fr)" },
  { key: "potential", label: "Synergies", default: false, gridCol: "minmax(200px,1.4fr)" },
  { key: "origin", label: "Origin", default: false, gridCol: "minmax(180px,1.2fr)" },
  { key: "passions", label: "Passions", default: false, gridCol: "minmax(180px,1.2fr)" },
  { key: "circles", label: "Circles", default: false, gridCol: "minmax(180px,1.2fr)" },
  { key: "actions", label: "Aktionen", always: true, default: true, gridCol: "auto", align: "right", pinned: "end" },
];

const STORAGE_KEY = "echo:people:columns:v3";

// ───────── Utils ─────────

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function compareNullable(
  a: string | null,
  b: string | null,
  dir: SortDir,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const cmp = a.localeCompare(b);
  return dir === "asc" ? cmp : -cmp;
}

function normalizeForWaMe(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/[^\d]/g, "");
}

function primaryPhone(person: Person): string | null {
  const mobile = person.phones?.find(
    (p) =>
      p.label?.toLowerCase().includes("mobile") ||
      p.label?.toLowerCase().includes("iphone"),
  );
  const first = mobile ?? person.phones?.[0];
  return first?.value ?? null;
}

function primaryEmail(person: Person): string | null {
  return person.emails?.[0]?.value ?? null;
}

const CLUSTER_ORDER: TagCluster[] = [
  "reminders",
  "interests",
  "potential",
  "origin",
];

// ───────── Main ─────────

export function PeopleTable({
  rows,
  circles,
  passions,
  locations,
  totalCount,
  initialFilter,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  // initialFilter aus URL (Voice/Deep-Link). circle kommt entweder als
  // circle_id ODER als name-substring — bei name suchen wir die circle_id.
  // location kommt lower-cased — passt direkt zu locationFilter-value.
  const resolvedCircleId = useMemo(() => {
    const v = initialFilter?.circle;
    if (!v) return undefined;
    // Wenn UUID, direkt nehmen.
    if (/^[0-9a-f-]{36}$/i.test(v)) {
      return circles.find((c) => c.id === v)?.id;
    }
    // Substring-Match über alle Circles.
    const lower = v.toLowerCase();
    return circles.find((c) => c.name.toLowerCase().includes(lower))?.id;
  }, [initialFilter?.circle, circles]);

  const resolvedLocation = useMemo(() => {
    const v = initialFilter?.location;
    if (!v) return undefined;
    // Substring-Match gegen die known locations damit Dropdown-Value matched.
    const hit = locations.find((l) => l.value.includes(v));
    return hit?.value ?? v;
  }, [initialFilter?.location, locations]);

  const [search, setSearch] = useState(initialFilter?.q ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, startBulkTransition] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<"all" | Mode>(
    initialFilter?.mode ?? "all",
  );
  const [purposeFilter, setPurposeFilter] = useState<"all" | Purpose>(
    initialFilter?.purpose ?? "all",
  );
  const [depthFilter, setDepthFilter] = useState<"all" | Depth>(
    initialFilter?.depth ?? "all",
  );
  const [clusterFilter, setClusterFilter] = useState<"all" | TagCluster>(
    initialFilter?.cluster ?? "all",
  );
  const [tagFilter, setTagFilter] = useState<string>(
    initialFilter?.tag ?? "all",
  );
  const [passionFilter, setPassionFilter] = useState<string>(
    initialFilter?.passion ?? "all",
  );
  const [synergyFilter, setSynergyFilter] = useState<string>(
    initialFilter?.synergy ?? "all",
  );
  const [circleFilter, setCircleFilter] = useState<string>(
    resolvedCircleId ?? "all",
  );
  const [locationFilter, setLocationFilter] = useState<string>(
    resolvedLocation ?? "all",
  );
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>(
    initialFilter?.channel ?? "all",
  );
  const [giftsFilter, setGiftsFilter] = useState<"all" | "yes" | "no">(
    initialFilter?.gifts ?? "all",
  );

  // URL-Sync — jede Filter-Änderung schreibt die URL um, sodass der
  // Stand bookmarkbar/shareable bleibt. Beim ersten Render skip damit
  // wir nicht mit ?cluster=all&… volllaufen.
  const skipFirstSync = useRef(true);
  useEffect(() => {
    if (skipFirstSync.current) {
      skipFirstSync.current = false;
      return;
    }
    const spec: PeopleFilterSpec = {};
    if (search.trim()) spec.q = search.trim();
    if (modeFilter !== "all") spec.mode = modeFilter;
    if (purposeFilter !== "all") spec.purpose = purposeFilter;
    if (depthFilter !== "all") spec.depth = depthFilter;
    if (clusterFilter !== "all") spec.cluster = clusterFilter;
    if (tagFilter !== "all") spec.tag = tagFilter;
    if (passionFilter !== "all") spec.passion = passionFilter;
    if (synergyFilter !== "all") spec.synergy = synergyFilter;
    if (circleFilter !== "all") spec.circle = circleFilter;
    if (locationFilter !== "all") spec.location = locationFilter;
    if (channelFilter !== "all") spec.channel = channelFilter;
    if (giftsFilter !== "all") spec.gifts = giftsFilter;
    const params = serializeFilterToParams(spec);
    const qs = params.toString();
    const target = qs ? `${pathname}?${qs}` : pathname;
    router.replace(target, { scroll: false });
  }, [
    search,
    modeFilter,
    purposeFilter,
    depthFilter,
    clusterFilter,
    tagFilter,
    passionFilter,
    synergyFilter,
    circleFilter,
    locationFilter,
    channelFilter,
    giftsFilter,
    pathname,
    router,
  ]);

  // Aktive-Filter-Indikator nutzt isEmptyFilter unten (siehe activeFilterCount).
  void isEmptyFilter;

  // Column-Config (Attio-Pattern) — Hook handelt visibility + order +
  // persistence + sort + DnD-Sensoren komplett ab.
  const cols = useColumnConfig<ColumnKey, SortKey>({
    columns: COLUMNS,
    storageKey: STORAGE_KEY,
    defaultSortKey: "name",
    defaultSortDir: "asc",
  });
  const sortKey = cols.sortKey ?? "name";
  const sortDir = cols.sortDir;

  const activeFilterCount =
    (modeFilter !== "all" ? 1 : 0) +
    (purposeFilter !== "all" ? 1 : 0) +
    (depthFilter !== "all" ? 1 : 0) +
    (clusterFilter !== "all" ? 1 : 0) +
    (tagFilter !== "all" ? 1 : 0) +
    (passionFilter !== "all" ? 1 : 0) +
    (synergyFilter !== "all" ? 1 : 0) +
    (circleFilter !== "all" ? 1 : 0) +
    (locationFilter !== "all" ? 1 : 0) +
    (channelFilter !== "all" ? 1 : 0) +
    (giftsFilter !== "all" ? 1 : 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const p = r.person;
      if (modeFilter !== "all" && p.mode !== modeFilter) return false;
      if (purposeFilter !== "all" && p.purpose !== purposeFilter) return false;
      if (depthFilter !== "all" && p.depth !== depthFilter) return false;
      if (clusterFilter !== "all" && !r.clusters.includes(clusterFilter))
        return false;
      if (tagFilter !== "all") {
        // case-insensitive Match gegen alle Tag-Namen aller Cluster
        const allTagNames = Object.values(r.tagsByCluster).flat();
        const wanted = tagFilter.toLowerCase();
        if (!allTagNames.some((n) => n.toLowerCase() === wanted)) return false;
      }
      if (passionFilter !== "all" && !r.passions.includes(passionFilter))
        return false;
      if (synergyFilter !== "all") {
        const tags = (p.synergy_tags ?? []).map((t) => t.toLowerCase());
        if (!tags.includes(synergyFilter)) return false;
      }
      if (circleFilter !== "all" && !r.circleIds.includes(circleFilter))
        return false;

      // Location-Filter — V3 schaut auf person_geographies cityList
      // PLUS Legacy-Freitext-Felder. „all" deaktiviert den Filter.
      if (locationFilter !== "all") {
        const v3 = r.cityList.includes(locationFilter);
        const legacy = [
          p.current_location?.toLowerCase(),
          p.home_location?.toLowerCase(),
          p.met_location?.toLowerCase(),
        ].some((x) => x === locationFilter);
        if (!v3 && !legacy) return false;
      }

      // Channel-Filter — V3 person_contacts ODER JSONB-Fallback.
      if (channelFilter === "has_phone") {
        const v3 = r.contactChannels.some(
          (c) => c === "phone" || c === "whatsapp",
        );
        const legacy = (p.phones?.length ?? 0) > 0;
        if (!v3 && !legacy) return false;
      }
      if (channelFilter === "has_email") {
        const v3 = r.contactChannels.includes("email");
        const legacy = (p.emails?.length ?? 0) > 0;
        if (!v3 && !legacy) return false;
      }
      if (channelFilter === "has_linkedin") {
        const v3 = r.contactChannels.includes("linkedin");
        const legacy = Boolean(p.linkedin_url);
        if (!v3 && !legacy) return false;
      }

      if (giftsFilter === "yes" && !p.gift_idea) return false;
      if (giftsFilter === "no" && p.gift_idea) return false;

      if (!q) return true;
      // Haystack umfasst Person-Felder + alle Tag-Namen aller Cluster
      // + Passion-Namen + Circle-Namen — sodass Free-Text-Suche auch
      // „geburtstag", „entrepreneurship", „padel" findet.
      const allTagNames = Object.values(r.tagsByCluster).flat();
      const circleNames = r.circleIds
        .map((id) => circles.find((c) => c.id === id)?.name ?? "")
        .filter(Boolean);
      const haystack = [
        p.name,
        p.company,
        p.role,
        p.notes,
        p.gift_idea,
        p.how_we_met,
        p.met_location,
        p.current_location,
        p.home_location,
        ...allTagNames,
        ...r.passions,
        ...circleNames,
        ...(p.synergies ?? []),
        ...(p.synergy_tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [
    rows,
    search,
    modeFilter,
    purposeFilter,
    depthFilter,
    clusterFilter,
    tagFilter,
    passionFilter,
    synergyFilter,
    circleFilter,
    locationFilter,
    channelFilter,
    giftsFilter,
    circles,
  ]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const pa = a.person;
      const pb = b.person;
      if (sortKey === "name") {
        return sortDir === "asc"
          ? pa.name.localeCompare(pb.name)
          : pb.name.localeCompare(pa.name);
      }
      if (sortKey === "company") {
        return compareNullable(pa.company, pb.company, sortDir);
      }
      if (sortKey === "last_contact_at") {
        return compareNullable(pa.last_contact_at, pb.last_contact_at, sortDir);
      }
      return 0;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function resetFilters() {
    setModeFilter("all");
    setPurposeFilter("all");
    setDepthFilter("all");
    setClusterFilter("all");
    setTagFilter("all");
    setPassionFilter("all");
    setSynergyFilter("all");
    setCircleFilter("all");
    setLocationFilter("all");
    setChannelFilter("all");
    setGiftsFilter("all");
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, Firma, Ort, Notiz …"
          className="h-9 w-full max-w-xs rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
        />

        <FilterSelect
          label="Mode"
          value={modeFilter}
          onChange={(v) => setModeFilter(v as "all" | Mode)}
          options={[
            { value: "all", label: "Alle" },
            ...(Object.keys(MODE_LABELS) as Mode[]).map((m) => ({
              value: m,
              label: MODE_LABELS[m],
            })),
          ]}
        />

        <FilterSelect
          label="Purpose"
          value={purposeFilter}
          onChange={(v) => setPurposeFilter(v as "all" | Purpose)}
          options={[
            { value: "all", label: "Alle" },
            ...(Object.keys(PURPOSE_LABELS) as Purpose[]).map((p) => ({
              value: p,
              label: PURPOSE_LABELS[p],
            })),
          ]}
        />

        <FilterSelect
          label="Depth"
          value={depthFilter}
          onChange={(v) => setDepthFilter(v as "all" | Depth)}
          options={[
            { value: "all", label: "Alle" },
            ...(Object.keys(DEPTH_LABELS) as Depth[]).map((d) => ({
              value: d,
              label: DEPTH_LABELS[d],
            })),
          ]}
        />

        <FilterSelect
          label="Cluster"
          value={clusterFilter}
          onChange={(v) => setClusterFilter(v as "all" | TagCluster)}
          options={[
            { value: "all", label: "Alle" },
            ...CLUSTER_ORDER.map((c) => ({
              value: c,
              label: TAG_CLUSTER_LABELS[c],
            })),
          ]}
          highlight={
            clusterFilter !== "all"
              ? TAG_CLUSTER_COLORS[clusterFilter as TagCluster]
              : undefined
          }
        />

        {passions.length > 0 && (
          <FilterSelect
            label="Passion"
            value={passionFilter}
            onChange={setPassionFilter}
            options={[
              { value: "all", label: "Alle" },
              ...passions.map((p) => ({ value: p, label: titleCase(p) })),
            ]}
          />
        )}

        {circles.length > 0 && (
          <FilterSelect
            label="Circle"
            value={circleFilter}
            onChange={setCircleFilter}
            options={[
              { value: "all", label: "Alle" },
              ...circles.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        )}

        {locations.length > 0 && (
          <FilterSelect
            label="Ort"
            value={locationFilter}
            onChange={setLocationFilter}
            options={[
              { value: "all", label: "Alle" },
              ...locations.map((l) => ({ value: l.value, label: l.label })),
            ]}
          />
        )}

        <FilterSelect
          label="Kanäle"
          value={channelFilter}
          onChange={(v) => setChannelFilter(v as ChannelFilter)}
          options={[
            { value: "all", label: "Alle" },
            { value: "has_phone", label: "Hat Telefon" },
            { value: "has_email", label: "Hat Email" },
            { value: "has_linkedin", label: "Hat LinkedIn" },
          ]}
        />

        <FilterSelect
          label="Gifts"
          value={giftsFilter}
          onChange={(v) => setGiftsFilter(v as "all" | "yes" | "no")}
          options={[
            { value: "all", label: "Alle" },
            { value: "yes", label: "Mit Geschenkidee" },
            { value: "no", label: "Ohne Geschenkidee" },
          ]}
        />

        {tagFilter !== "all" && (
          <button
            type="button"
            onClick={() => setTagFilter("all")}
            className="inline-flex h-9 items-center gap-1 rounded border border-action bg-action-soft px-2.5 text-xs text-ink-1 transition hover:border-bad hover:text-bad"
            title="Tag-Filter entfernen"
          >
            <span className="t-label">Tag</span>
            <span>{tagFilter}</span>
            <span aria-hidden>×</span>
          </button>
        )}

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-9 items-center rounded border border-dashed border-rule px-3 text-xs text-ink-3 transition hover:border-bad hover:text-bad"
            title="Alle Filter zurücksetzen"
          >
            × {activeFilterCount}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <ColumnPopover api={cols} />

          <Link
            href="/people/import"
            className="inline-flex h-9 items-center rounded border border-rule px-3 text-xs text-ink-2 transition hover:border-action hover:text-action"
          >
            iPhone import
          </Link>
          <Link
            href="/people/new"
            className="inline-flex h-9 items-center rounded border border-action bg-action px-4 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
          >
            + Person
          </Link>
        </div>
      </div>

      {/* Bulk-Action-Bar — sichtbar wenn mindestens eine Zeile ausgewählt. */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded border border-action bg-action-soft px-3 py-2">
          <span className="t-label text-action">{selected.size} ausgewählt</span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-ink-3 transition hover:text-ink-1"
          >
            Auswahl aufheben
          </button>
          <div className="ml-auto flex items-center gap-2">
            {bulkError && (
              <span className="text-[11px] text-bad">{bulkError}</span>
            )}
            <button
              type="button"
              onClick={() => {
                const ids = Array.from(selected);
                if (
                  !confirm(`${ids.length} Person${ids.length > 1 ? "en" : ""} löschen?`)
                ) {
                  return;
                }
                setBulkError(null);
                startBulkTransition(async () => {
                  const res = await bulkDeletePeopleAction(ids);
                  if (!res.ok) {
                    setBulkError(res.error ?? "Fehler beim Löschen");
                    return;
                  }
                  setSelected(new Set());
                });
              }}
              disabled={bulkPending}
              className="rounded border border-bad bg-bad/10 px-3 py-1 text-xs font-medium text-bad transition hover:bg-bad hover:text-paper disabled:opacity-50"
            >
              {bulkPending ? "Lösche…" : `Löschen (${selected.size})`}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded border border-rule bg-paper">
        <div className="min-w-max">
          <SortableHeaderRow
            api={cols}
            customHeaderCells={{
              select: (
                <SelectAllCheckbox
                  visibleIds={sorted.map((r) => r.person.id)}
                  selected={selected}
                  onChange={setSelected}
                />
              ),
            }}
          />

          {sorted.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm italic text-ink-3">
              {totalCount === 0
                ? "Noch keine Personen — leg die erste an."
                : "Keine Treffer für diese Filter."}
            </div>
          ) : (
            sorted.map((r) => (
              <PersonTableRow
                key={r.person.id}
                row={r}
                activeColumns={cols.activeColumns}
                gridTemplate={cols.gridTemplate}
                circles={circles}
                selected={selected.has(r.person.id)}
                onToggleSelect={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(r.person.id)) next.delete(r.person.id);
                    else next.add(r.person.id);
                    return next;
                  });
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ───────── Filter Select ─────────

function FilterSelect({
  label,
  value,
  onChange,
  options,
  highlight,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  highlight?: { bg: string; fg: string };
}) {
  const active = value !== "all";
  const style: React.CSSProperties | undefined =
    active && highlight
      ? { background: highlight.bg, color: highlight.fg, borderColor: highlight.fg }
      : undefined;
  return (
    <label
      className={`inline-flex h-9 items-center gap-1.5 rounded border bg-paper px-2.5 text-xs transition ${
        active
          ? "border-action text-ink-1"
          : "border-rule text-ink-3 hover:border-ink-3 hover:text-ink-1"
      }`}
      style={style}
    >
      <span className="t-label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer bg-transparent text-xs text-inherit outline-none"
        style={style}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ───────── Row Renderer ─────────

function PersonTableRow({
  row,
  activeColumns,
  gridTemplate,
  circles,
  selected,
  onToggleSelect,
}: {
  row: Row;
  activeColumns: ColumnDef[];
  gridTemplate: string;
  circles: CircleRow[];
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const person = row.person;
  return (
    <div
      className={`grid items-start gap-3 border-b border-rule-soft px-4 py-3 transition last:border-0 ${
        selected ? "bg-action-soft" : "hover:bg-paper-2"
      }`}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {activeColumns.map((c) => (
        <Cell
          key={c.key}
          column={c}
          person={person}
          row={row}
          circles={circles}
          selected={selected}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}

// Select-All-Checkbox im Header. Wird checked wenn ALLE sichtbaren
// Personen ausgewählt sind; indeterminate wenn nur einige.
function SelectAllCheckbox({
  visibleIds,
  selected,
  onChange,
}: {
  visibleIds: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const visibleCount = visibleIds.length;
  const selectedVisible = visibleIds.filter((id) => selected.has(id)).length;
  const allSelected = visibleCount > 0 && selectedVisible === visibleCount;
  const someSelected = selectedVisible > 0 && selectedVisible < visibleCount;

  return (
    <span className="flex items-center justify-center">
      <input
        type="checkbox"
        checked={allSelected}
        ref={(el) => {
          if (el) el.indeterminate = someSelected;
        }}
        onChange={() => {
          if (allSelected || someSelected) {
            // Auswahl auf nicht-sichtbare reduzieren
            const next = new Set(selected);
            for (const id of visibleIds) next.delete(id);
            onChange(next);
          } else {
            const next = new Set(selected);
            for (const id of visibleIds) next.add(id);
            onChange(next);
          }
        }}
        className="h-3.5 w-3.5 accent-[var(--action)]"
        aria-label="Alle sichtbaren auswählen"
      />
    </span>
  );
}

function Cell({
  column,
  person,
  row,
  circles,
  selected,
  onToggleSelect,
}: {
  column: ColumnDef;
  person: Person;
  row: Row;
  circles: CircleRow[];
  selected: boolean;
  onToggleSelect: () => void;
}) {
  switch (column.key) {
    case "select":
      return (
        <span className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5 accent-[var(--action)]"
            aria-label={`${person.name} auswählen`}
          />
        </span>
      );
    case "avatar":
      return (
        <Link
          href={`/people/${person.id}`}
          className="flex items-center justify-center"
        >
          <span className="avatar" aria-hidden>
            {initials(person.name)}
          </span>
        </Link>
      );
    case "name":
      return (
        <Link href={`/people/${person.id}`} className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink-1">
            {person.name}
          </span>
          {person.how_we_met && (
            <span className="block truncate text-[11px] italic text-ink-4">
              {person.how_we_met}
            </span>
          )}
        </Link>
      );
    case "company":
      return (
        <Link href={`/people/${person.id}`} className="min-w-0">
          <span className="block truncate text-xs text-ink-3">
            {[person.company, person.role].filter(Boolean).join(" · ") || "—"}
          </span>
        </Link>
      );
    case "purpose":
      return (
        <span className="text-xs text-ink-2">
          {person.purpose ? PURPOSE_LABELS[person.purpose] : "—"}
        </span>
      );
    case "mode":
      return (
        <span className="text-xs text-ink-2">{MODE_LABELS[person.mode]}</span>
      );
    case "depth":
      return (
        <span className="text-xs text-ink-2">
          {person.depth ? DEPTH_LABELS[person.depth] : "—"}
        </span>
      );
    case "cadence":
      return (
        <span className="text-right font-mono text-[11px] text-ink-3">
          {person.cadence_days ? `${person.cadence_days}d` : "—"}
        </span>
      );
    case "last_contact":
      return (
        <span className="font-mono text-[11px] text-ink-3">
          {formatDate(person.last_contact_at)}
        </span>
      );
    case "current_location":
      return (
        <span className="truncate text-xs text-ink-3">
          {person.current_location ?? "—"}
        </span>
      );
    case "met_location":
      return (
        <span className="truncate text-xs text-ink-3">
          {person.met_location ?? "—"}
        </span>
      );
    case "gifts":
      return (
        <span
          className="block truncate text-xs text-ink-2"
          title={person.gift_idea ?? undefined}
        >
          {person.gift_idea ?? "—"}
        </span>
      );
    case "reminders":
      return (
        <TagClusterCell
          tags={row.tagsByCluster.reminders ?? []}
          cluster="reminders"
          notes={row.tagNotes}
        />
      );
    case "interests":
      return (
        <TagClusterCell
          tags={row.tagsByCluster.interests ?? []}
          cluster="interests"
          notes={row.tagNotes}
        />
      );
    case "potential":
      // Repurposed as "Synergies" (2026-06-07): now reads the synergies
      // text list, not the old potential tag cluster.
      return (
        <span
          className="block truncate text-xs text-ink-2"
          title={(person.synergies ?? []).join(" · ") || undefined}
        >
          {(person.synergies ?? []).join(" · ") || "—"}
        </span>
      );
    case "origin":
      return (
        <TagClusterCell
          tags={row.tagsByCluster.origin ?? []}
          cluster="origin"
          notes={row.tagNotes}
        />
      );
    case "passions":
      return <PassionsCell names={row.passions} notes={row.passionNotes} />;
    case "circles":
      return (
        <CirclesCell
          circleIds={row.circleIds}
          circles={circles}
          notes={row.circleNotes}
        />
      );
    case "actions": {
      const phone = primaryPhone(person);
      const email = primaryEmail(person);
      const phoneDigits = phone ? normalizeForWaMe(phone) : "";
      const hasUsablePhone = phoneDigits.length >= 7;
      return (
        <div className="flex items-center justify-end gap-1">
          <ActionIcon
            href={hasUsablePhone ? `tel:${phone}` : undefined}
            title="Anrufen"
            icon={
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
              </svg>
            }
          />
          <ActionIcon
            href={
              hasUsablePhone ? `https://wa.me/${phoneDigits}` : undefined
            }
            title="WhatsApp"
            variant="wa"
            icon={
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M20.52 3.48A11.94 11.94 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.17 1.6 5.99L0 24l6.18-1.62A11.94 11.94 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.2-1.25-6.21-3.48-8.52z" />
              </svg>
            }
          />
          <ActionIcon
            href={email ? `mailto:${email}` : undefined}
            title="Email"
            icon={
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
            }
          />
        </div>
      );
    }
    default:
      return <span />;
  }
}

function ActionIcon({
  href,
  title,
  icon,
  variant,
}: {
  href: string | undefined;
  title: string;
  icon: React.ReactNode;
  variant?: "wa";
}) {
  const base =
    "inline-flex h-8 w-8 items-center justify-center rounded transition";
  if (!href) {
    return (
      <span
        title={`${title} · nicht hinterlegt`}
        className={`${base} cursor-not-allowed text-ink-4 opacity-40`}
        aria-hidden
      >
        {icon}
      </span>
    );
  }
  if (variant === "wa") {
    return (
      <a
        href={href}
        title={title}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} text-ink-3 hover:bg-[#25D366]/15 hover:text-[#25D366]`}
        onClick={(e) => e.stopPropagation()}
      >
        {icon}
      </a>
    );
  }
  return (
    <a
      href={href}
      title={title}
      className={`${base} text-ink-3 hover:bg-paper-2 hover:text-action`}
      onClick={(e) => e.stopPropagation()}
    >
      {icon}
    </a>
  );
}

// ───────── Cluster / Passion / Circle Cells ─────────

// Volltextige Pills ohne Truncation, kompakte Optik. Pills wrappen
// vertikal wenn die Spalte zu eng ist. Items mit Note kriegen ein
// dezentes „·"-Glyph als Hinweis, Hover zeigt die Note als Tooltip
// (0028, Tag-Notes in der Listen-Übersicht).
function PillStack({
  values,
  bg,
  fg,
  max = 6,
  notesByValue,
  hrefFor,
}: {
  values: string[];
  bg: string;
  fg: string;
  max?: number;
  // Optional: Map von value → Note. value ist im selben Format wie der
  // angezeigte String (also für Passions z. B. capitalized).
  notesByValue?: Record<string, string>;
  // Wenn gesetzt: jede Pill wird ein <Link> auf den entsprechenden
  // Filter (z.B. /people?tag=stammtisch). Klick auf Pill leitet auf die
  // People-Liste mit allen Trägern dieses Tags.
  hrefFor?: (value: string) => string;
}) {
  if (values.length === 0)
    return <span className="text-[11px] italic text-ink-4">—</span>;
  const visible = values.slice(0, max);
  const extra = values.length - visible.length;
  return (
    <span className="flex flex-wrap items-start gap-1">
      {visible.map((v, i) => {
        const note = notesByValue?.[v];
        const inner = (
          <>
            <span>{v}</span>
            {note && (
              <span
                className="font-bold leading-none opacity-60"
                aria-hidden
                style={{ fontSize: "9px" }}
              >
                ·
              </span>
            )}
          </>
        );
        const className =
          "group/pill relative inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] leading-snug" +
          (hrefFor ? " cursor-pointer transition hover:opacity-80" : "");
        if (hrefFor) {
          return (
            <Link
              key={`${v}-${i}`}
              href={hrefFor(v)}
              className={className}
              style={{ background: bg, color: fg }}
              title={note ? `${note} — Filter auf "${v}"` : `Filter auf "${v}"`}
              onClick={(e) => e.stopPropagation()}
            >
              {inner}
            </Link>
          );
        }
        return (
          <span
            key={`${v}-${i}`}
            className={className}
            style={{ background: bg, color: fg }}
            title={note || undefined}
          >
            {inner}
          </span>
        );
      })}
      {extra > 0 && (
        <span
          className="font-mono text-[10px] text-ink-4"
          title={values.slice(max).join(", ")}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}

function TagClusterCell({
  tags,
  cluster,
  notes,
}: {
  tags: string[];
  cluster: TagCluster;
  notes: Record<string, string>;
}) {
  const colors = TAG_CLUSTER_COLORS[cluster];
  return (
    <PillStack
      values={tags}
      bg={colors.bg}
      fg={colors.fg}
      notesByValue={notes}
      hrefFor={(tag) =>
        `/people?cluster=${cluster}&tag=${encodeURIComponent(tag)}`
      }
    />
  );
}

function PassionsCell({
  names,
  notes,
}: {
  names: string[];
  notes: Record<string, string>;
}) {
  // Names sind lower-cased aus der Server-Aggregation. Capitalize fürs UI.
  const display = names.map((n) =>
    n
      .split(/\s+/)
      .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" "),
  );
  // notes ist auf den lower-cased Namen indiziert — mappen wir auf die
  // display-Variante damit der Tooltip findet.
  const displayNotes: Record<string, string> = {};
  for (let i = 0; i < names.length; i += 1) {
    const note = notes[names[i]];
    if (note) displayNotes[display[i]] = note;
  }
  // hrefFor bekommt den display-Wert (capitalized) — wir geben aber den
  // lower-case-Namen an die URL weiter, weil parseFilterFromParams das
  // erwartet und das tatsächliche Match auf lower-case läuft.
  return (
    <PillStack
      values={display}
      bg={PASSION_COLOR.bg}
      fg={PASSION_COLOR.fg}
      notesByValue={displayNotes}
      hrefFor={(displayValue) => {
        const idx = display.indexOf(displayValue);
        const lower = idx >= 0 ? names[idx] : displayValue.toLowerCase();
        return `/people?passion=${encodeURIComponent(lower)}`;
      }}
    />
  );
}

function CirclesCell({
  circleIds,
  circles,
  notes,
}: {
  circleIds: string[];
  circles: CircleRow[];
  notes: Record<string, string>;
}) {
  const items = circleIds
    .map((id) => {
      const c = circles.find((cc) => cc.id === id);
      return c ? { id, name: c.name } : null;
    })
    .filter((x): x is { id: string; name: string } => x !== null);
  const names = items.map((c) => c.name);
  // Map circle-name → note via id-lookup.
  const notesByName: Record<string, string> = {};
  for (const c of items) {
    const note = notes[c.id];
    if (note) notesByName[c.name] = note;
  }
  // Filter nimmt circle_id ODER name-substring; wir nutzen die id für
  // deterministisches Matching auch bei umbenannten Circles.
  return (
    <PillStack
      values={names}
      bg={CIRCLE_COLOR.bg}
      fg={CIRCLE_COLOR.fg}
      notesByValue={notesByName}
      hrefFor={(name) => {
        const item = items.find((i) => i.name === name);
        const param = item ? item.id : name;
        return `/people?circle=${encodeURIComponent(param)}`;
      }}
    />
  );
}
