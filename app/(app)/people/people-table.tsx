"use client";

// People-Tabelle (Phase C5 v6): Column-Toggle + Reihenfolge per Drag.
//
// User entscheidet welche Spalten sichtbar sind UND in welcher Folge —
// sowohl im Spalten-Popover als auch direkt auf den Header-Zellen
// (Attio-Style). Avatar + Name sind links gepinnt, Aktionen rechts —
// alles dazwischen ist frei sortierbar.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

type SortKey = "name" | "company" | "last_contact_at";
type SortDir = "asc" | "desc";
type ChannelFilter = "all" | "has_phone" | "has_email" | "has_linkedin";

interface Row {
  person: Person;
  tagsByCluster: Record<string, string[]>;
  clusters: string[];
  passions: string[];
  circleIds: string[];
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
}

// ───────── Column Registry ─────────
type ColumnKey =
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
  | "reminders"   // Tag-Cluster
  | "interests"   // Tag-Cluster
  | "potential"   // Tag-Cluster
  | "origin"      // Tag-Cluster
  | "passions"
  | "circles"
  | "actions";    // always

interface ColumnDef {
  key: ColumnKey;
  label: string;
  always?: boolean;
  default: boolean;
  sortKey?: SortKey;
  gridCol: string;
  align?: "left" | "right";
  // Pinned-Spalten lassen sich nicht reordern und behalten ihren Platz
  // links (avatar/name) oder rechts (actions) — Attio macht's genauso.
  pinned?: "start" | "end";
}

const COLUMNS: ColumnDef[] = [
  { key: "avatar", label: "Avatar", always: true, default: true, gridCol: "40px", pinned: "start" },
  { key: "name", label: "Name", always: true, default: true, sortKey: "name", gridCol: "minmax(180px,1.6fr)", pinned: "start" },
  { key: "company", label: "Firma · Rolle", default: true, sortKey: "company", gridCol: "minmax(140px,1fr)" },
  { key: "purpose", label: "Zweck", default: true, gridCol: "100px" },
  { key: "mode", label: "Modus", default: true, gridCol: "100px" },
  { key: "depth", label: "Tiefe", default: false, gridCol: "110px" },
  { key: "cadence", label: "Cadence", default: false, gridCol: "80px", align: "right" },
  { key: "last_contact", label: "Letzter Kontakt", default: true, sortKey: "last_contact_at", gridCol: "110px" },
  { key: "current_location", label: "Stadt", default: false, gridCol: "120px" },
  { key: "met_location", label: "Wo getroffen", default: false, gridCol: "140px" },
  { key: "reminders", label: "Reminders", default: false, gridCol: "minmax(200px,1.4fr)" },
  { key: "interests", label: "Interests", default: false, gridCol: "minmax(200px,1.4fr)" },
  { key: "potential", label: "Potential", default: false, gridCol: "minmax(200px,1.4fr)" },
  { key: "origin", label: "Origin", default: false, gridCol: "minmax(180px,1.2fr)" },
  { key: "passions", label: "Passions", default: false, gridCol: "minmax(180px,1.2fr)" },
  { key: "circles", label: "Circles", default: false, gridCol: "minmax(180px,1.2fr)" },
  { key: "actions", label: "Aktionen", always: true, default: true, gridCol: "auto", align: "right", pinned: "end" },
];

// Reihenfolge der nicht-gepinnten Spalten — initial die Registry-Reihenfolge.
const DEFAULT_MIDDLE_ORDER: ColumnKey[] = COLUMNS.filter((c) => !c.pinned).map(
  (c) => c.key,
);

const STORAGE_KEY = "echo:people:columns:v3";
const STORAGE_KEY_V2 = "echo:people:columns:v2";

interface ColumnConfig {
  visible: Set<ColumnKey>;
  order: ColumnKey[]; // nur die middle-Spalten, in Anzeige-Reihenfolge
}

function defaultConfig(): ColumnConfig {
  return {
    visible: new Set(COLUMNS.filter((c) => c.default).map((c) => c.key)),
    order: [...DEFAULT_MIDDLE_ORDER],
  };
}

// Order normalisieren — fehlende Keys ans Ende, unbekannte raus,
// damit neue Spalten nach einem Release nicht verschwinden.
function normalizeOrder(input: ColumnKey[]): ColumnKey[] {
  const validMiddle = new Set(DEFAULT_MIDDLE_ORDER);
  const seen = new Set<ColumnKey>();
  const out: ColumnKey[] = [];
  for (const k of input) {
    if (validMiddle.has(k) && !seen.has(k)) {
      out.push(k);
      seen.add(k);
    }
  }
  for (const k of DEFAULT_MIDDLE_ORDER) {
    if (!seen.has(k)) out.push(k);
  }
  return out;
}

function loadConfig(): ColumnConfig {
  if (typeof window === "undefined") return defaultConfig();
  const validKeys = new Set(COLUMNS.map((c) => c.key));
  try {
    // v3 — { visible: string[], order: string[] }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        visible?: string[];
        order?: string[];
      };
      const visible = new Set<ColumnKey>();
      for (const k of parsed.visible ?? []) {
        if (validKeys.has(k as ColumnKey)) visible.add(k as ColumnKey);
      }
      // Always-Spalten immer aktiv
      for (const c of COLUMNS) if (c.always) visible.add(c.key);
      const order = normalizeOrder(
        (parsed.order ?? []).filter((k) =>
          validKeys.has(k as ColumnKey),
        ) as ColumnKey[],
      );
      return { visible, order };
    }
    // Migration v2 → v3 (nur Visibility, Order = default)
    const rawV2 = window.localStorage.getItem(STORAGE_KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as string[];
      if (Array.isArray(parsed)) {
        const visible = new Set<ColumnKey>();
        for (const k of parsed) {
          if (validKeys.has(k as ColumnKey)) visible.add(k as ColumnKey);
        }
        for (const c of COLUMNS) if (c.always) visible.add(c.key);
        return { visible, order: [...DEFAULT_MIDDLE_ORDER] };
      }
    }
  } catch {
    // ignore
  }
  return defaultConfig();
}

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
}: Props) {
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<"all" | Mode>("all");
  const [purposeFilter, setPurposeFilter] = useState<"all" | Purpose>("all");
  const [depthFilter, setDepthFilter] = useState<"all" | Depth>("all");
  const [clusterFilter, setClusterFilter] = useState<"all" | TagCluster>(
    "all",
  );
  const [passionFilter, setPassionFilter] = useState<string>("all");
  const [circleFilter, setCircleFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(
    () => new Set(COLUMNS.filter((c) => c.default).map((c) => c.key)),
  );
  const [colOrder, setColOrder] = useState<ColumnKey[]>(
    () => [...DEFAULT_MIDDLE_ORDER],
  );
  const [hydrated, setHydrated] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement | null>(null);

  // DnD-Sensoren — Pointer mit kleinem activation-distance damit normale
  // Klicks (z. B. Checkbox-Toggle, Sort-Klick) nicht versehentlich
  // einen Drag starten.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Hydrate column-config nach Mount damit SSR/Client matchen
  useEffect(() => {
    const cfg = loadConfig();
    setVisibleCols(cfg.visible);
    setColOrder(cfg.order);
    setHydrated(true);
  }, []);

  // Persist on change
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          visible: Array.from(visibleCols),
          order: colOrder,
        }),
      );
    } catch {
      // ignore
    }
  }, [visibleCols, colOrder, hydrated]);

  // Click-outside fuer Cols-Popover
  useEffect(() => {
    if (!colsOpen) return;
    function onDoc(e: MouseEvent) {
      if (!colsRef.current) return;
      if (!colsRef.current.contains(e.target as Node)) setColsOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [colsOpen]);

  function toggleColumn(key: ColumnKey) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Always-Columns nicht entfernbar
        const def = COLUMNS.find((c) => c.key === key);
        if (def?.always) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function reorderColumns(activeId: ColumnKey, overId: ColumnKey) {
    if (activeId === overId) return;
    setColOrder((prev) => {
      const from = prev.indexOf(activeId);
      const to = prev.indexOf(overId);
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  }

  function onHeaderDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    reorderColumns(active.id as ColumnKey, over.id as ColumnKey);
  }

  function onPopoverDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    reorderColumns(active.id as ColumnKey, over.id as ColumnKey);
  }

  // activeColumns = pinned-start + (ordered middle ∩ visible) + pinned-end
  const colsByKey = useMemo(() => {
    const m = new Map<ColumnKey, ColumnDef>();
    for (const c of COLUMNS) m.set(c.key, c);
    return m;
  }, []);
  const pinnedStart = COLUMNS.filter((c) => c.pinned === "start");
  const pinnedEnd = COLUMNS.filter((c) => c.pinned === "end");
  const orderedMiddle = colOrder
    .map((k) => colsByKey.get(k))
    .filter((c): c is ColumnDef => Boolean(c));
  const activeColumns = [
    ...pinnedStart.filter((c) => visibleCols.has(c.key)),
    ...orderedMiddle.filter((c) => visibleCols.has(c.key)),
    ...pinnedEnd.filter((c) => visibleCols.has(c.key)),
  ];
  // Header-Sortable bekommt nur die sichtbaren Middle-Keys — Pinned-Header
  // sind nicht draggable und tauchen separat als statische Cells auf.
  const draggableMiddleVisible = orderedMiddle.filter((c) =>
    visibleCols.has(c.key),
  );

  const activeFilterCount =
    (modeFilter !== "all" ? 1 : 0) +
    (purposeFilter !== "all" ? 1 : 0) +
    (depthFilter !== "all" ? 1 : 0) +
    (clusterFilter !== "all" ? 1 : 0) +
    (passionFilter !== "all" ? 1 : 0) +
    (circleFilter !== "all" ? 1 : 0) +
    (locationFilter !== "all" ? 1 : 0) +
    (channelFilter !== "all" ? 1 : 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const p = r.person;
      if (modeFilter !== "all" && p.mode !== modeFilter) return false;
      if (purposeFilter !== "all" && p.purpose !== purposeFilter) return false;
      if (depthFilter !== "all" && p.depth !== depthFilter) return false;
      if (clusterFilter !== "all" && !r.clusters.includes(clusterFilter))
        return false;
      if (passionFilter !== "all" && !r.passions.includes(passionFilter))
        return false;
      if (circleFilter !== "all" && !r.circleIds.includes(circleFilter))
        return false;

      // Location-Filter — match gegen current/home/met_location case-insensitive
      if (locationFilter !== "all") {
        const cands = [
          p.current_location?.toLowerCase(),
          p.home_location?.toLowerCase(),
          p.met_location?.toLowerCase(),
        ].filter((x): x is string => Boolean(x));
        if (!cands.includes(locationFilter)) return false;
      }

      // Channel-Filter
      if (channelFilter === "has_phone" && (p.phones?.length ?? 0) === 0)
        return false;
      if (channelFilter === "has_email" && (p.emails?.length ?? 0) === 0)
        return false;
      if (channelFilter === "has_linkedin" && !p.linkedin_url) return false;

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
        p.how_we_met,
        p.met_location,
        p.current_location,
        p.home_location,
        ...allTagNames,
        ...r.passions,
        ...circleNames,
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
    passionFilter,
    circleFilter,
    locationFilter,
    channelFilter,
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

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function resetFilters() {
    setModeFilter("all");
    setPurposeFilter("all");
    setDepthFilter("all");
    setClusterFilter("all");
    setPassionFilter("all");
    setCircleFilter("all");
    setLocationFilter("all");
    setChannelFilter("all");
  }

  const gridTemplate = activeColumns.map((c) => c.gridCol).join(" ");

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
          label="Modus"
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
          label="Zweck"
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
          label="Tiefe"
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
          {/* Column-Toggle */}
          <div className="relative" ref={colsRef}>
            <button
              type="button"
              onClick={() => setColsOpen((v) => !v)}
              className="inline-flex h-9 items-center gap-1.5 rounded border border-rule bg-paper px-3 text-xs text-ink-2 transition hover:border-action hover:text-action"
              title="Spalten ein-/ausblenden"
            >
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
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18M15 3v18" />
              </svg>
              Spalten
            </button>
            {colsOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded border border-rule bg-paper p-1 shadow-[0_4px_14px_rgba(20,17,13,0.08)]">
                <div className="t-label border-b border-rule-soft px-3 py-2">
                  Spalten ({activeColumns.length}/{COLUMNS.length})
                </div>
                <ul className="max-h-80 overflow-y-auto py-1">
                  {pinnedStart.map((c) => (
                    <PopoverPinnedRow
                      key={c.key}
                      column={c}
                      checked={visibleCols.has(c.key)}
                    />
                  ))}
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onPopoverDragEnd}
                  >
                    <SortableContext
                      items={colOrder}
                      strategy={verticalListSortingStrategy}
                    >
                      {orderedMiddle.map((c) => (
                        <PopoverSortableRow
                          key={c.key}
                          column={c}
                          checked={visibleCols.has(c.key)}
                          onToggle={() => toggleColumn(c.key)}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                  {pinnedEnd.map((c) => (
                    <PopoverPinnedRow
                      key={c.key}
                      column={c}
                      checked={visibleCols.has(c.key)}
                    />
                  ))}
                </ul>
                <div className="border-t border-rule-soft px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-ink-4">
                  Tipp · Greifen & ziehen zum Sortieren
                </div>
              </div>
            )}
          </div>

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

      {/* Table */}
      <div className="overflow-x-auto rounded border border-rule bg-paper">
        <div className="min-w-max">
          {/* Header — pinned-start, draggable middle, pinned-end. Drag
              läuft über einen eigenen DndContext mit horizontaler Strategie. */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onHeaderDragEnd}
          >
            <div
              className="grid gap-3 border-b border-rule bg-paper-2 px-4 py-2.5 text-xs"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {pinnedStart
                .filter((c) => visibleCols.has(c.key))
                .map((c) => (
                  <HeaderCell
                    key={c.key}
                    column={c}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={(k) => toggleSort(k)}
                  />
                ))}
              <SortableContext
                items={draggableMiddleVisible.map((c) => c.key)}
                strategy={horizontalListSortingStrategy}
              >
                {draggableMiddleVisible.map((c) => (
                  <SortableHeaderCell
                    key={c.key}
                    column={c}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={(k) => toggleSort(k)}
                  />
                ))}
              </SortableContext>
              {pinnedEnd
                .filter((c) => visibleCols.has(c.key))
                .map((c) => (
                  <HeaderCell
                    key={c.key}
                    column={c}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={(k) => toggleSort(k)}
                  />
                ))}
            </div>
          </DndContext>

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
                activeColumns={activeColumns}
                gridTemplate={gridTemplate}
                circles={circles}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ───────── Header Cell ─────────

function HeaderCell({
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  column: ColumnDef;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const alignClass = column.align === "right" ? "text-right" : "text-left";
  if (column.key === "avatar") return <span className="t-label" />;
  if (column.sortKey) {
    return (
      <button
        type="button"
        onClick={() => onSort(column.sortKey!)}
        className={`t-label transition hover:text-ink-1 ${alignClass}`}
      >
        {column.label}{" "}
        {sortKey === column.sortKey && (sortDir === "asc" ? "↑" : "↓")}
      </button>
    );
  }
  return <span className={`t-label ${alignClass}`}>{column.label}</span>;
}

// ───────── Sortable Header Cell ─────────

function SortableHeaderCell({
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  column: ColumnDef;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: column.key });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? "grabbing" : undefined,
  };
  const alignClass = column.align === "right" ? "justify-end" : "justify-start";
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1 ${alignClass}`}
      {...attributes}
    >
      {/* Grip — fasst beim Hover an, klein und unaufdringlich */}
      <button
        type="button"
        className="cursor-grab text-ink-4 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
        title="Spalte verschieben"
        {...listeners}
        aria-label={`${column.label} verschieben`}
      >
        <svg
          width="10"
          height="14"
          viewBox="0 0 10 14"
          fill="currentColor"
          aria-hidden
        >
          <circle cx="2.5" cy="3" r="1" />
          <circle cx="7.5" cy="3" r="1" />
          <circle cx="2.5" cy="7" r="1" />
          <circle cx="7.5" cy="7" r="1" />
          <circle cx="2.5" cy="11" r="1" />
          <circle cx="7.5" cy="11" r="1" />
        </svg>
      </button>
      {column.sortKey ? (
        <button
          type="button"
          onClick={() => onSort(column.sortKey!)}
          className="t-label transition hover:text-ink-1"
        >
          {column.label}{" "}
          {sortKey === column.sortKey && (sortDir === "asc" ? "↑" : "↓")}
        </button>
      ) : (
        <span className="t-label">{column.label}</span>
      )}
    </div>
  );
}

// ───────── Popover Rows ─────────

function PopoverPinnedRow({
  column,
  checked,
}: {
  column: ColumnDef;
  checked: boolean;
}) {
  return (
    <li>
      <label className="flex cursor-not-allowed items-center gap-2 px-3 py-1.5 text-xs opacity-60">
        <span className="w-3 text-ink-4" aria-hidden />
        <input
          type="checkbox"
          checked={checked}
          disabled
          className="h-3.5 w-3.5 accent-[var(--action)]"
          readOnly
        />
        <span className="flex-1 text-ink-1">{column.label}</span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-4">
          fix
        </span>
      </label>
    </li>
  );
}

function PopoverSortableRow({
  column,
  checked,
  onToggle,
}: {
  column: ColumnDef;
  checked: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: column.key });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    background: isDragging ? "var(--paper-2)" : undefined,
  };
  return (
    <li ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs transition hover:bg-paper-2">
        <button
          type="button"
          className="cursor-grab text-ink-4 transition hover:text-ink-2 active:cursor-grabbing"
          title="Reihenfolge ändern"
          aria-label={`${column.label} verschieben`}
          {...attributes}
          {...listeners}
        >
          <svg
            width="10"
            height="14"
            viewBox="0 0 10 14"
            fill="currentColor"
            aria-hidden
          >
            <circle cx="2.5" cy="3" r="1" />
            <circle cx="7.5" cy="3" r="1" />
            <circle cx="2.5" cy="7" r="1" />
            <circle cx="7.5" cy="7" r="1" />
            <circle cx="2.5" cy="11" r="1" />
            <circle cx="7.5" cy="11" r="1" />
          </svg>
        </button>
        <label className="flex flex-1 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="h-3.5 w-3.5 accent-[var(--action)]"
          />
          <span className="flex-1 text-ink-1">{column.label}</span>
        </label>
      </div>
    </li>
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
}: {
  row: Row;
  activeColumns: ColumnDef[];
  gridTemplate: string;
  circles: CircleRow[];
}) {
  const person = row.person;
  return (
    <div
      className="grid items-start gap-3 border-b border-rule-soft px-4 py-3 transition last:border-0 hover:bg-paper-2"
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {activeColumns.map((c) => (
        <Cell
          key={c.key}
          column={c}
          person={person}
          row={row}
          circles={circles}
        />
      ))}
    </div>
  );
}

function Cell({
  column,
  person,
  row,
  circles,
}: {
  column: ColumnDef;
  person: Person;
  row: Row;
  circles: CircleRow[];
}) {
  switch (column.key) {
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
    case "reminders":
      return <TagClusterCell tags={row.tagsByCluster.reminders ?? []} cluster="reminders" />;
    case "interests":
      return <TagClusterCell tags={row.tagsByCluster.interests ?? []} cluster="interests" />;
    case "potential":
      return <TagClusterCell tags={row.tagsByCluster.potential ?? []} cluster="potential" />;
    case "origin":
      return <TagClusterCell tags={row.tagsByCluster.origin ?? []} cluster="origin" />;
    case "passions":
      return <PassionsCell names={row.passions} />;
    case "circles":
      return <CirclesCell circleIds={row.circleIds} circles={circles} />;
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
// vertikal wenn die Spalte zu eng ist — der Container hat align-items
// start damit die Row trotzdem oben anliegt.
function PillStack({
  values,
  bg,
  fg,
  max = 6,
}: {
  values: string[];
  bg: string;
  fg: string;
  max?: number;
}) {
  if (values.length === 0)
    return <span className="text-[11px] italic text-ink-4">—</span>;
  const visible = values.slice(0, max);
  const extra = values.length - visible.length;
  return (
    <span className="flex flex-wrap items-start gap-1">
      {visible.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className="inline-flex items-center rounded-full px-1.5 py-px text-[10px] leading-snug"
          style={{ background: bg, color: fg }}
        >
          {v}
        </span>
      ))}
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
}: {
  tags: string[];
  cluster: TagCluster;
}) {
  const colors = TAG_CLUSTER_COLORS[cluster];
  return <PillStack values={tags} bg={colors.bg} fg={colors.fg} />;
}

function PassionsCell({ names }: { names: string[] }) {
  // Names sind lower-cased aus der Server-Aggregation. Capitalize fürs UI.
  const display = names.map((n) =>
    n
      .split(/\s+/)
      .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" "),
  );
  return (
    <PillStack values={display} bg={PASSION_COLOR.bg} fg={PASSION_COLOR.fg} />
  );
}

function CirclesCell({
  circleIds,
  circles,
}: {
  circleIds: string[];
  circles: CircleRow[];
}) {
  const names = circleIds
    .map((id) => circles.find((c) => c.id === id)?.name)
    .filter((n): n is string => !!n);
  return (
    <PillStack values={names} bg={CIRCLE_COLOR.bg} fg={CIRCLE_COLOR.fg} />
  );
}
