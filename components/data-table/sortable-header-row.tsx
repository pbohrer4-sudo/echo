"use client";

// Generic Sortable-Header-Row (Attio-Pattern).
//
// Rendert die gesamte Tabellen-Kopfzeile aus einer DataTableColumn-Liste
// und einer useColumnConfig-API. Pinned-Spalten werden statisch
// ausgegeben, die middle-Spalten innerhalb einer DndContext +
// SortableContext mit horizontaler Strategie — drag-bar via Grip-Icon
// das nur on-hover sichtbar wird.

import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import type { ColumnConfigApi, DataTableColumn, SortDir } from "@/hooks/use-column-config";
import { GripIcon } from "./grip-icon";

interface Props<K extends string, S extends string> {
  api: ColumnConfigApi<K, S>;
  // Consumer kann pro Pinned-Column ein Custom-Element für den Header
  // mitgeben (z. B. eine Select-All-Checkbox). Wenn gesetzt, ersetzt es
  // die Default-Label-Darstellung. Nur pinned-Spalten — middle-Spalten
  // bleiben drag-bar mit Default-Header.
  customHeaderCells?: Partial<Record<K, ReactNode>>;
}

export function SortableHeaderRow<K extends string, S extends string>({
  api,
  customHeaderCells,
}: Props<K, S>) {
  const {
    activeColumns,
    pinnedStart,
    pinnedEnd,
    draggableMiddleVisible,
    visibleCols,
    sortKey,
    sortDir,
    gridTemplate,
    toggleSort,
    reorderColumns,
    sensors,
  } = api;

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    reorderColumns(active.id as K, over.id as K);
  }

  // Wir referenzieren activeColumns nur als deps-Trigger fürs Re-Render
  // — die eigentliche Reihenfolge oben bauen wir aus pinned + middle.
  void activeColumns;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <div
        className="grid gap-3 border-b border-rule bg-paper-2 px-4 py-2.5 text-xs"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {pinnedStart
          .filter((c) => visibleCols.has(c.key))
          .map((c) => (
            <StaticHeaderCell
              key={c.key}
              column={c}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              custom={customHeaderCells?.[c.key]}
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
              onSort={toggleSort}
            />
          ))}
        </SortableContext>
        {pinnedEnd
          .filter((c) => visibleCols.has(c.key))
          .map((c) => (
            <StaticHeaderCell
              key={c.key}
              column={c}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              custom={customHeaderCells?.[c.key]}
            />
          ))}
      </div>
    </DndContext>
  );
}

function StaticHeaderCell<K extends string, S extends string>({
  column,
  sortKey,
  sortDir,
  onSort,
  custom,
}: {
  column: DataTableColumn<K, S>;
  sortKey: S | undefined;
  sortDir: SortDir;
  onSort: (k: S) => void;
  custom?: ReactNode;
}) {
  if (custom !== undefined) return <>{custom}</>;
  const alignClass = column.align === "right" ? "text-right" : "text-left";
  if (column.key === "avatar") return <span className="t-label" />;
  if (column.sortKey) {
    const active = sortKey === column.sortKey;
    return (
      <button
        type="button"
        onClick={() => onSort(column.sortKey!)}
        className={`t-label transition hover:text-ink-1 ${alignClass}`}
      >
        {column.label}
        {active && <span aria-hidden>{sortDir === "asc" ? " ↑" : " ↓"}</span>}
      </button>
    );
  }
  return <span className={`t-label ${alignClass}`}>{column.label}</span>;
}

function SortableHeaderCell<K extends string, S extends string>({
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  column: DataTableColumn<K, S>;
  sortKey: S | undefined;
  sortDir: SortDir;
  onSort: (k: S) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.key });
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
      <button
        type="button"
        className="cursor-grab text-ink-4 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
        title="Spalte verschieben"
        aria-label={`${column.label} verschieben`}
        {...listeners}
      >
        <GripIcon />
      </button>
      {column.sortKey ? (
        <button
          type="button"
          onClick={() => onSort(column.sortKey!)}
          className="t-label transition hover:text-ink-1"
        >
          {column.label}
          {sortKey === column.sortKey && (
            <span aria-hidden>{sortDir === "asc" ? " ↑" : " ↓"}</span>
          )}
        </button>
      ) : (
        <span className="t-label">{column.label}</span>
      )}
    </div>
  );
}
