"use client";

// Organisationen-Tabelle (Attio-Pattern v1).
//
// Wie people-table: Spalten ein-/ausblenden, sortieren, drag-and-drop
// reordern. Name links gepinnt, Personenzahl rechts. Andere Spalten
// (Branche, HQ, Domain, Größe, Tags) frei sortierbar.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { OrgWithCount } from "@/lib/organizations";
import { InlineTagEditor } from "./inline-tag-editor";
import { bulkDeleteOrganizationsAction } from "./bulk-actions";
import {
  useColumnConfig,
  type DataTableColumn,
  type SortDir,
} from "@/hooks/use-column-config";
import { ColumnPopover } from "@/components/data-table/column-popover";
import { SortableHeaderRow } from "@/components/data-table/sortable-header-row";

type SortKey = "name" | "industry" | "hq" | "people_count" | "domain";
type ColumnKey =
  | "select"
  | "name"
  | "industry"
  | "hq"
  | "domain"
  | "size"
  | "tags"
  | "people_count";

type ColumnDef = DataTableColumn<ColumnKey, SortKey>;

const COLUMNS: ColumnDef[] = [
  { key: "select", label: "", always: true, default: true, gridCol: "32px", pinned: "start" },
  { key: "name", label: "Name", always: true, default: true, sortKey: "name", gridCol: "minmax(0,1.6fr)", pinned: "start" },
  { key: "industry", label: "Branche", default: true, sortKey: "industry", gridCol: "minmax(0,1.2fr)" },
  { key: "hq", label: "HQ", default: true, sortKey: "hq", gridCol: "minmax(0,1fr)" },
  { key: "domain", label: "Domain", default: false, sortKey: "domain", gridCol: "minmax(0,1.2fr)" },
  { key: "size", label: "Größe", default: false, gridCol: "100px" },
  { key: "tags", label: "Tags", default: true, gridCol: "minmax(0,1.4fr)" },
  { key: "people_count", label: "Personen", always: true, default: true, sortKey: "people_count", gridCol: "100px", align: "right", pinned: "end" },
];

const STORAGE_KEY = "echo:organizations:columns:v1";

function compare(
  a: string | number | null,
  b: string | number | null,
  dir: SortDir,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const cmp =
    typeof a === "number" ? a - (b as number) : a.localeCompare(b as string);
  return dir === "asc" ? cmp : -cmp;
}

export function OrganizationsTable({
  orgs,
  activeTag = null,
  totalCount,
  allTags = [],
}: {
  orgs: OrgWithCount[];
  activeTag?: string | null;
  totalCount?: number;
  allTags?: string[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, startBulkTransition] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);

  const cols = useColumnConfig<ColumnKey, SortKey>({
    columns: COLUMNS,
    storageKey: STORAGE_KEY,
    defaultSortKey: "name",
    defaultSortDir: "asc",
  });
  const sortKey = cols.sortKey ?? "name";
  const sortDir = cols.sortDir;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((o) => {
      const haystack = [o.name, o.industry, o.hq, o.domain, o.size, ...(o.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [orgs, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av =
        sortKey === "people_count"
          ? a.people_count
          : ((a[sortKey as keyof OrgWithCount] as string | null) ?? null);
      const bv =
        sortKey === "people_count"
          ? b.people_count
          : ((b[sortKey as keyof OrgWithCount] as string | null) ?? null);
      return compare(av, bv, sortDir);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  return (
    <div className="space-y-4">
      {activeTag && (
        <div className="flex items-center gap-2 text-sm">
          <span className="t-label">Tag-Filter</span>
          <span
            className="tag"
            style={{ borderColor: "var(--action)", color: "var(--action)" }}
          >
            <span className="dot" style={{ background: "var(--action)" }} />
            {activeTag}
          </span>
          <Link
            href="/organizations"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 transition hover:text-ink-1"
          >
            × Filter entfernen
          </Link>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-9 min-w-72 flex-1 items-center gap-2 rounded border border-rule bg-paper px-3">
          <span className="t-label" aria-hidden>
            Suche
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, Branche, HQ, Tags…"
            className="flex-1 bg-transparent text-sm text-ink-1 outline-none placeholder:text-ink-4"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ColumnPopover api={cols} />
          <Link
            href="/organizations/new"
            className="inline-flex h-9 items-center rounded border border-action bg-action px-4 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
          >
            + Organisation
          </Link>
        </div>
      </div>

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
                  !confirm(
                    `${ids.length} Organisation${ids.length > 1 ? "en" : ""} löschen?`,
                  )
                ) {
                  return;
                }
                setBulkError(null);
                startBulkTransition(async () => {
                  const res = await bulkDeleteOrganizationsAction(ids);
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
      <div className="overflow-hidden rounded border border-rule bg-paper">
        <SortableHeaderRow
          api={cols}
          customHeaderCells={{
            select: (
              <OrgSelectAllCheckbox
                visibleIds={sorted.map((o) => o.id)}
                selected={selected}
                onChange={setSelected}
              />
            ),
          }}
        />

        {sorted.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-ink-3">
            {orgs.length === 0
              ? "Noch keine Organisationen — leg die erste an."
              : "Keine Treffer für diese Suche."}
          </div>
        ) : (
          sorted.map((o) => {
            const isSelected = selected.has(o.id);
            return (
              <div
                key={o.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/organizations/${o.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/organizations/${o.id}`);
                  }
                }}
                className={`grid cursor-pointer gap-3 border-b border-rule-soft px-4 py-3 transition-colors last:border-b-0 focus:outline-none ${
                  isSelected
                    ? "bg-action-soft"
                    : "hover:bg-paper-2 focus:bg-paper-2"
                }`}
                style={{ gridTemplateColumns: cols.gridTemplate }}
              >
                {cols.activeColumns.map((c) => (
                  <OrgCell
                    key={c.key}
                    column={c}
                    org={o}
                    allTags={allTags}
                    selected={isSelected}
                    onToggleSelect={() => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(o.id)) next.delete(o.id);
                        else next.add(o.id);
                        return next;
                      });
                    }}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>

      <p className="t-label">
        {sorted.length} von {totalCount ?? orgs.length}
        {activeTag && ` · gefiltert nach „${activeTag}"`}
      </p>
    </div>
  );
}

function OrgSelectAllCheckbox({
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
    <span className="flex items-center justify-center self-center">
      <input
        type="checkbox"
        checked={allSelected}
        ref={(el) => {
          if (el) el.indeterminate = someSelected;
        }}
        onChange={() => {
          if (allSelected || someSelected) {
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

function OrgCell({
  column,
  org,
  allTags,
  selected,
  onToggleSelect,
}: {
  column: ColumnDef;
  org: OrgWithCount;
  allTags: string[];
  selected: boolean;
  onToggleSelect: () => void;
}) {
  switch (column.key) {
    case "select":
      return (
        <span
          className="flex items-center justify-center self-center"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="h-3.5 w-3.5 accent-[var(--action)]"
            aria-label={`${org.name} auswählen`}
          />
        </span>
      );
    case "name":
      return (
        <span className="min-w-0 self-center">
          <span className="block truncate font-medium text-ink-1">
            {org.name}
          </span>
          {org.domain && (
            <span className="block truncate font-mono text-[10px] tracking-wider text-ink-4">
              {org.domain}
            </span>
          )}
        </span>
      );
    case "industry":
      return (
        <span className="self-center truncate text-sm text-ink-2">
          {org.industry ?? "—"}
        </span>
      );
    case "hq":
      return (
        <span className="self-center truncate text-sm text-ink-2">
          {org.hq ?? "—"}
        </span>
      );
    case "domain":
      return (
        <span className="self-center truncate font-mono text-xs text-ink-3">
          {org.domain ?? "—"}
        </span>
      );
    case "size":
      return (
        <span className="self-center text-sm text-ink-2">
          {org.size ?? "—"}
        </span>
      );
    case "tags":
      return (
        <span
          className="self-center"
          // Stop-propagation damit Tag-Editor-Klicks die Row nicht navigieren
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <InlineTagEditor
            orgId={org.id}
            initialTags={org.tags ?? []}
            existingTags={allTags}
          />
        </span>
      );
    case "people_count":
      return (
        <span className="self-center text-right font-mono text-xs tracking-wider text-ink-2">
          {org.people_count}
        </span>
      );
    default:
      return <span />;
  }
}
