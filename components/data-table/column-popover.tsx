"use client";

// Generic Column-Popover (Attio-Pattern).
//
// Toggle-Button öffnet ein Floating-Panel mit allen Spalten — pinned-
// Spalten zeigen ein „fix"-Label und sind nicht drag-bar, middle-
// Spalten lassen sich per Grip-Icon vertikal reordern und per Checkbox
// ein-/ausblenden.

import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import type { ColumnConfigApi, DataTableColumn } from "@/hooks/use-column-config";
import { GripIcon } from "./grip-icon";

interface Props<K extends string, S extends string> {
  api: ColumnConfigApi<K, S>;
}

export function ColumnPopover<K extends string, S extends string>({
  api,
}: Props<K, S>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    api.reorderColumns(active.id as K, over.id as K);
  }

  const totalCount = api.activeColumns.length;
  const allCount =
    api.pinnedStart.length + api.colOrder.length + api.pinnedEnd.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded border border-rule bg-paper p-1 shadow-[0_4px_14px_rgba(20,17,13,0.08)]">
          <div className="t-label border-b border-rule-soft px-3 py-2">
            Spalten ({totalCount}/{allCount})
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {api.pinnedStart.map((c) => (
              <PinnedRow key={c.key} column={c} checked={api.visibleCols.has(c.key)} />
            ))}
            <DndContext
              sensors={api.sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={api.colOrder}
                strategy={verticalListSortingStrategy}
              >
                {api.colOrder.map((k) => {
                  const col = [
                    ...api.pinnedStart,
                    ...api.pinnedEnd,
                  ].find((c) => c.key === k) ?? null;
                  // colOrder enthält nur middle-Spalten. Wir holen die Def
                  // anhand des Keys aus der draggable-Liste.
                  const def = api.draggableMiddleVisible.find((c) => c.key === k)
                    ?? api.activeColumns.find((c) => c.key === k);
                  // Wenn der Key nicht in aktiver Liste ist, lookup über
                  // alle columns (visible=false fall):
                  const fromFull = def ?? col;
                  // Fallback — sollte nie passieren wenn colOrder konsistent ist.
                  if (!fromFull) return null;
                  return (
                    <SortableRow
                      key={k}
                      column={fromFull}
                      checked={api.visibleCols.has(k)}
                      onToggle={() => api.toggleColumn(k)}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
            {api.pinnedEnd.map((c) => (
              <PinnedRow key={c.key} column={c} checked={api.visibleCols.has(c.key)} />
            ))}
          </ul>
          <div className="border-t border-rule-soft px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-ink-4">
            Tipp · Greifen & ziehen zum Sortieren
          </div>
        </div>
      )}
    </div>
  );
}

function PinnedRow<K extends string, S extends string>({
  column,
  checked,
}: {
  column: DataTableColumn<K, S>;
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
          readOnly
          className="h-3.5 w-3.5 accent-[var(--action)]"
        />
        <span className="flex-1 text-ink-1">{column.label}</span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-4">
          fix
        </span>
      </label>
    </li>
  );
}

function SortableRow<K extends string, S extends string>({
  column,
  checked,
  onToggle,
}: {
  column: DataTableColumn<K, S>;
  checked: boolean;
  onToggle: () => void;
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
          <GripIcon />
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
