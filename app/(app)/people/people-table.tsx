"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Person, Scope } from "@/lib/types";
import { StrengthMeter } from "@/components/strength-meter";

type SortKey = "name" | "company" | "last_interaction_at" | "scope";
type SortDir = "asc" | "desc";
type ScopeFilter = "all" | Scope;

const SCOPE_LABEL: Record<Scope, string> = {
  work: "Beruflich",
  personal: "Privat",
  both: "Beides",
};

// Spalten-Registry. Avatar + Name sind immer da (Avatar als Anker,
// Name als Klick-Ziel). Alles andere ist togglebar via Popover. Reihen-
// folge unten = Reihenfolge im Header. Defaults entsprechen der
// vorherigen Ansicht damit Bestandsuser nichts vermissen.
type ColumnKey =
  | "company"
  | "role"
  | "scope"
  | "tags"
  | "stakeholder"
  | "priority"
  | "strength"
  | "industry"
  | "cta"
  | "cadence"
  | "last_interaction";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  gridSize: string;
  default: boolean;
  sortKey?: SortKey;
  align?: "right";
}

const COLUMNS: ColumnDef[] = [
  { key: "company", label: "Firma", gridSize: "minmax(0,1.2fr)", default: true, sortKey: "company" },
  { key: "role", label: "Rolle", gridSize: "minmax(0,1fr)", default: false },
  { key: "scope", label: "Scope", gridSize: "minmax(0,0.8fr)", default: true, sortKey: "scope" },
  { key: "tags", label: "Tags", gridSize: "minmax(0,1.4fr)", default: true },
  { key: "stakeholder", label: "Stakeholder", gridSize: "minmax(0,1fr)", default: false },
  { key: "priority", label: "Prio", gridSize: "60px", default: false },
  { key: "strength", label: "Stärke", gridSize: "70px", default: true },
  { key: "industry", label: "Industrie", gridSize: "minmax(0,1fr)", default: false },
  { key: "cta", label: "CTA", gridSize: "minmax(0,1.2fr)", default: false },
  { key: "cadence", label: "Cadence", gridSize: "80px", default: false },
  { key: "last_interaction", label: "Letzte Interaktion", gridSize: "120px", default: true, sortKey: "last_interaction_at", align: "right" },
];

const COLUMNS_STORAGE_KEY = "echo:people:columns:v1";

function loadVisibleColumns(): Set<ColumnKey> {
  if (typeof window === "undefined") {
    return new Set(COLUMNS.filter((c) => c.default).map((c) => c.key));
  }
  try {
    const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
    if (!raw) {
      return new Set(COLUMNS.filter((c) => c.default).map((c) => c.key));
    }
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) {
      return new Set(COLUMNS.filter((c) => c.default).map((c) => c.key));
    }
    const valid = new Set<ColumnKey>();
    for (const k of parsed) {
      if (COLUMNS.some((c) => c.key === k)) valid.add(k as ColumnKey);
    }
    return valid;
  } catch {
    return new Set(COLUMNS.filter((c) => c.default).map((c) => c.key));
  }
}

function saveVisibleColumns(set: Set<ColumnKey>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      COLUMNS_STORAGE_KEY,
      JSON.stringify(Array.from(set)),
    );
  } catch {}
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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
  a: string | number | null,
  b: string | number | null,
  dir: SortDir,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const cmp =
    typeof a === "number"
      ? a - (b as number)
      : a.localeCompare(b as string);
  return dir === "asc" ? cmp : -cmp;
}

export function PeopleTable({
  people,
  activeTag = null,
  totalCount,
}: {
  people: Person[];
  activeTag?: string | null;
  totalCount?: number;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [stakeholderFilter, setStakeholderFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Hydrate-after-mount, damit SSR und Client-Render auf den Defaults
  // matchen und localStorage später die User-Auswahl reinzieht.
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    () => new Set(COLUMNS.filter((c) => c.default).map((c) => c.key)),
  );
  const [columnsHydrated, setColumnsHydrated] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsBtnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleColumns(loadVisibleColumns());
    setColumnsHydrated(true);
  }, []);

  useEffect(() => {
    if (!columnsHydrated) return;
    saveVisibleColumns(visibleColumns);
  }, [visibleColumns, columnsHydrated]);

  // Click-outside fürs Popover.
  useEffect(() => {
    if (!columnsOpen) return;
    function onDoc(e: MouseEvent) {
      if (!columnsBtnRef.current) return;
      if (!columnsBtnRef.current.contains(e.target as Node)) {
        setColumnsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [columnsOpen]);

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Build the stakeholder-type filter options from what's actually in
  // the dataset — manual taxonomy + any custom values the user added.
  const stakeholderOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of people) {
      for (const t of p.stakeholder_types ?? []) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [people]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (scopeFilter !== "all" && p.scope !== scopeFilter) return false;
      if (
        stakeholderFilter !== "all" &&
        !(p.stakeholder_types ?? []).includes(stakeholderFilter)
      )
        return false;
      if (priorityFilter !== "all") {
        if (priorityFilter === "—" && p.priority) return false;
        if (priorityFilter !== "—" && p.priority !== priorityFilter) return false;
      }
      if (!q) return true;
      // Search across everything that helps the user find a person:
      // name, company, role, tags, stakeholder typings, classification,
      // CTA, interests, geographies (place names + kinds).
      const subTypeValues = Object.values(p.stakeholder_sub_types ?? {}).flat();
      const geoValues = (p.geographies ?? []).flatMap((g) => [
        g.kind,
        g.place,
      ]);
      const haystack = [
        p.name,
        p.company,
        p.role,
        p.industry,
        p.job_function,
        p.cta,
        p.notes,
        p.notes_summary,
        ...(p.tags ?? []),
        ...(p.stakeholder_types ?? []),
        ...subTypeValues,
        ...(p.interests ?? []),
        ...geoValues,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [people, search, scopeFilter, stakeholderFilter, priorityFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey] as string | null;
      const bv = b[sortKey] as string | null;
      return compareNullable(av, bv, sortDir);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // Build the grid-template-columns string from the currently visible
  // column set. Avatar + Name are always present, in that order.
  const visibleColDefs = COLUMNS.filter((c) => visibleColumns.has(c.key));
  const gridTemplate =
    `28px minmax(0,1.6fr) ` +
    visibleColDefs.map((c) => c.gridSize).join(" ");

  return (
    <div className="space-y-4">
      {activeTag && (
        <div className="flex items-center gap-2 text-sm">
          <span className="t-label">Tag-Filter</span>
          <span
            className="tag"
            style={{
              borderColor: "var(--action)",
              color: "var(--action)",
            }}
          >
            <span className="dot" style={{ background: "var(--action)" }} />
            {activeTag}
          </span>
          <Link
            href="/people"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 transition hover:text-ink-1"
          >
            × Filter entfernen
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-9 min-w-72 flex-1 items-center gap-2 rounded border border-rule bg-paper px-3">
          <span className="t-label" aria-hidden>
            Suche
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, Firma, Stakeholder, Industrie, Interessen, Orte…"
            className="flex-1 bg-transparent text-sm text-ink-1 outline-none placeholder:text-ink-4"
          />
        </div>
        <div className="flex h-9 rounded border border-rule bg-paper p-0.5 text-xs">
          {(["all", "work", "personal", "both"] as ScopeFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScopeFilter(s)}
              className={`rounded px-3 transition-colors ${
                scopeFilter === s
                  ? "bg-paper-2 text-ink-1"
                  : "text-ink-3 hover:text-ink-1"
              }`}
            >
              {s === "all" ? "Alle" : SCOPE_LABEL[s as Scope]}
            </button>
          ))}
        </div>
        <div className="relative" ref={columnsBtnRef}>
          <button
            type="button"
            onClick={() => setColumnsOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={columnsOpen}
            className="inline-flex h-9 items-center gap-1.5 rounded border border-rule px-3 text-xs text-ink-2 transition hover:border-action hover:text-action"
          >
            Spalten
            <span aria-hidden className="text-[10px]">▾</span>
          </button>
          {columnsOpen && (
            <div
              role="menu"
              className="absolute right-0 top-10 z-30 w-56 space-y-1 rounded border border-rule bg-paper p-2 shadow-[0_8px_24px_rgba(20,17,13,0.08)]"
            >
              <p className="t-label px-2 pt-1">Sichtbare Spalten</p>
              {COLUMNS.map((c) => (
                <label
                  key={c.key}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-ink-1 hover:bg-paper-2"
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns.has(c.key)}
                    onChange={() => toggleColumn(c.key)}
                    className="h-3.5 w-3.5 rounded border-rule accent-action"
                  />
                  <span>{c.label}</span>
                </label>
              ))}
              <div className="flex items-center justify-between border-t border-rule pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setVisibleColumns(
                      new Set(
                        COLUMNS.filter((c) => c.default).map((c) => c.key),
                      ),
                    )
                  }
                  className="px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 transition hover:text-ink-1"
                >
                  zurücksetzen
                </button>
                <button
                  type="button"
                  onClick={() => setColumnsOpen(false)}
                  className="rounded border border-rule px-2 py-1 text-[10px] text-ink-2 transition hover:border-action hover:text-action"
                >
                  Schließen
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
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

      <div className="flex flex-wrap items-center gap-3 text-xs">
        {stakeholderOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="t-label mr-1">Stakeholder</span>
            <button
              type="button"
              onClick={() => setStakeholderFilter("all")}
              className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition ${
                stakeholderFilter === "all"
                  ? "border-action bg-action-soft text-action"
                  : "border-rule bg-paper text-ink-3 hover:border-ink-3 hover:text-ink-1"
              }`}
            >
              Alle
            </button>
            {stakeholderOptions.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() =>
                  setStakeholderFilter(stakeholderFilter === t ? "all" : t)
                }
                className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition ${
                  stakeholderFilter === t
                    ? "border-action bg-action-soft text-action"
                    : "border-rule bg-paper text-ink-3 hover:border-ink-3 hover:text-ink-1"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="t-label mr-1">Priorität</span>
          {(["all", "A", "B", "C", "—"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriorityFilter(p)}
              className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition ${
                priorityFilter === p
                  ? "border-action bg-action-soft text-action"
                  : "border-rule bg-paper text-ink-3 hover:border-ink-3 hover:text-ink-1"
              }`}
            >
              {p === "all" ? "Alle" : p === "—" ? "Keine" : p}
            </button>
          ))}
        </div>

        {(stakeholderFilter !== "all" || priorityFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setStakeholderFilter("all");
              setPriorityFilter("all");
            }}
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 transition hover:text-ink-1"
          >
            × alle Filter zurücksetzen
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded border border-rule bg-paper">
        <div
          className="grid gap-4 border-b border-rule bg-paper-2 px-4 py-2.5"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <span className="t-label" />
          <SortHeader
            label="Name"
            active={sortKey === "name"}
            dir={sortDir}
            onClick={() => toggleSort("name")}
          />
          {visibleColDefs.map((c) =>
            c.sortKey ? (
              <SortHeader
                key={c.key}
                label={c.label}
                active={sortKey === c.sortKey}
                dir={sortDir}
                onClick={() => toggleSort(c.sortKey!)}
                align={c.align}
              />
            ) : (
              <span
                key={c.key}
                className={`t-label ${c.align === "right" ? "text-right" : ""}`}
              >
                {c.label}
              </span>
            ),
          )}
        </div>

        {sorted.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-ink-3">
            {people.length === 0
              ? "Noch keine Personen — leg die erste an."
              : "Keine Treffer für diesen Filter."}
          </div>
        ) : (
          sorted.map((p) => (
            <div
              key={p.id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(`/people/${p.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/people/${p.id}`);
                }
              }}
              className="grid cursor-pointer gap-4 border-b border-rule-soft px-4 py-3 transition-colors hover:bg-paper-2 last:border-b-0 focus:bg-paper-2 focus:outline-none"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <span className="avatar self-center" aria-hidden>
                {initials(p.name)}
              </span>
              <span className="min-w-0 self-center">
                <span className="block truncate font-medium text-ink-1">
                  {p.name}
                </span>
                {p.role && (
                  <span className="block truncate font-mono text-[10px] tracking-wider text-ink-4">
                    {p.role}
                  </span>
                )}
              </span>
              {visibleColDefs.map((c) => (
                <Cell key={c.key} col={c} person={p} />
              ))}
            </div>
          ))
        )}
      </div>

      <p className="t-label">
        {sorted.length} von {totalCount ?? people.length}
        {activeTag && ` · gefiltert nach „${activeTag}"`}
      </p>
    </div>
  );
}

// Single-cell renderer keyed off the column. Switch is exhaustive
// over ColumnKey — adding a new column here means the table picks it
// up automatically.
function Cell({ col, person }: { col: ColumnDef; person: Person }) {
  const align = col.align === "right" ? "text-right" : "";

  switch (col.key) {
    case "company":
      return (
        <span className={`self-center truncate text-sm text-ink-2 ${align}`}>
          {person.company ? (
            person.organization_id ? (
              <Link
                href={`/organizations/${person.organization_id}`}
                onClick={(e) => e.stopPropagation()}
                className="transition hover:text-action"
              >
                {person.company}
              </Link>
            ) : (
              person.company
            )
          ) : (
            "—"
          )}
        </span>
      );
    case "role":
      return (
        <span className="self-center truncate text-sm text-ink-2">
          {person.role ?? "—"}
        </span>
      );
    case "scope":
      return (
        <span className="self-center font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
          {SCOPE_LABEL[person.scope]}
        </span>
      );
    case "tags":
      return (
        <span className="flex flex-wrap gap-1 self-center">
          {(person.tags ?? []).slice(0, 3).map((t) => (
            <Link
              key={t}
              href={`/people?tag=${encodeURIComponent(t)}`}
              onClick={(e) => e.stopPropagation()}
              className="tag transition hover:border-action hover:text-action"
            >
              <span className="dot" />
              {t}
            </Link>
          ))}
        </span>
      );
    case "stakeholder":
      return (
        <span className="flex flex-wrap gap-1 self-center font-mono text-[9px] uppercase tracking-wider text-ink-3">
          {(person.stakeholder_types ?? []).slice(0, 2).map((s) => (
            <span key={s} className="tag">
              {s}
            </span>
          )) || "—"}
        </span>
      );
    case "priority":
      return (
        <span className="self-center text-center font-mono text-[11px] font-medium tracking-wider text-ink-1">
          {person.priority ?? "—"}
        </span>
      );
    case "strength":
      return (
        <span className="self-center">
          {(person.strength_score ?? 0) > 0 ? (
            <StrengthMeter
              value={person.strength_score ?? 0}
              showLabel={false}
            />
          ) : (
            <span className="font-mono text-xs text-ink-4">—</span>
          )}
        </span>
      );
    case "industry":
      return (
        <span className="self-center truncate text-sm text-ink-2">
          {person.industry ?? "—"}
        </span>
      );
    case "cta":
      return (
        <span className="self-center truncate text-sm text-ink-2">
          {person.cta ?? "—"}
        </span>
      );
    case "cadence":
      return (
        <span className="self-center text-center font-mono text-[11px] tracking-wider text-ink-3">
          {person.expected_cadence_days
            ? `${person.expected_cadence_days}d`
            : "—"}
        </span>
      );
    case "last_interaction":
      return (
        <span className="self-center text-right font-mono text-[11px] tracking-wider text-ink-3">
          {formatDate(person.last_interaction_at)}
        </span>
      );
  }
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "right";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`t-label inline-flex items-center gap-1 hover:text-ink-1 ${
        active ? "text-ink-1" : ""
      } ${align === "right" ? "justify-end" : ""}`}
    >
      {label}
      {active && <span aria-hidden>{dir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}
