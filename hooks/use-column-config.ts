"use client";

// Reusable Column-Config-Hook (Attio-Pattern).
//
// Vereinheitlicht Sichtbarkeit, Reihenfolge, Pinning, Sortierung und
// localStorage-Persistierung für jede Daten-Tabelle in der App. Mit
// Hilfe von @dnd-kit kommt drag-and-drop sowohl im Popover als auch
// auf den Header-Zellen — siehe components/data-table für die UI-Glue.
//
// Generisch über zwei String-Literal-Unions: K = ColumnKey, S = SortKey.
// Wenn eine Tabelle nichts sortierbares hat, kann S = never sein und
// die Sort-Felder werden ignoriert.

import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates, arrayMove } from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export interface DataTableColumn<K extends string, S extends string = string> {
  key: K;
  label: string;
  always?: boolean;     // nicht ein-/ausblendbar
  default: boolean;     // initial sichtbar wenn kein localStorage da
  sortKey?: S;          // wenn gesetzt, ist die Spalte sortierbar
  gridCol: string;      // CSS gridTemplateColumns-Wert
  align?: "left" | "right";
  pinned?: "start" | "end"; // pinned-Spalten sind nicht reorder-bar
}

interface StoredConfig {
  visible?: string[];
  order?: string[];
}

interface Opts<K extends string, S extends string> {
  columns: DataTableColumn<K, S>[];
  storageKey: string;
  defaultSortKey?: S;
  defaultSortDir?: SortDir;
}

export interface ColumnConfigApi<K extends string, S extends string> {
  // Status
  hydrated: boolean;
  visibleCols: Set<K>;
  colOrder: K[];
  sortKey: S | undefined;
  sortDir: SortDir;

  // Abgeleitete Listen
  activeColumns: DataTableColumn<K, S>[];
  pinnedStart: DataTableColumn<K, S>[];
  pinnedEnd: DataTableColumn<K, S>[];
  draggableMiddleVisible: DataTableColumn<K, S>[];
  gridTemplate: string;

  // Mutationen
  toggleColumn: (key: K) => void;
  reorderColumns: (activeId: K, overId: K) => void;
  toggleSort: (key: S) => void;
  resetColumns: () => void;

  // DnD-Kit Sensoren — kann an DndContext durchgereicht werden
  sensors: ReturnType<typeof useSensors>;
}

export function useColumnConfig<K extends string, S extends string = string>({
  columns,
  storageKey,
  defaultSortKey,
  defaultSortDir = "asc",
}: Opts<K, S>): ColumnConfigApi<K, S> {
  // Konstante Helfer aus columns
  const defaultMiddleOrder = useMemo<K[]>(
    () => columns.filter((c) => !c.pinned).map((c) => c.key),
    [columns],
  );
  const validKeys = useMemo(() => new Set(columns.map((c) => c.key)), [columns]);
  const defaultVisible = useMemo<Set<K>>(
    () => new Set(columns.filter((c) => c.default).map((c) => c.key)),
    [columns],
  );

  const [hydrated, setHydrated] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<K>>(defaultVisible);
  const [colOrder, setColOrder] = useState<K[]>(defaultMiddleOrder);
  const [sortKey, setSortKey] = useState<S | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Hydrate aus localStorage
  useEffect(() => {
    if (typeof window === "undefined") {
      setHydrated(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredConfig;
        const vis = new Set<K>();
        for (const k of parsed.visible ?? []) {
          if (validKeys.has(k as K)) vis.add(k as K);
        }
        for (const c of columns) if (c.always) vis.add(c.key);
        setVisibleCols(vis.size > 0 ? vis : defaultVisible);

        const seen = new Set<K>();
        const order: K[] = [];
        for (const k of parsed.order ?? []) {
          if (
            validKeys.has(k as K) &&
            !seen.has(k as K) &&
            defaultMiddleOrder.includes(k as K)
          ) {
            order.push(k as K);
            seen.add(k as K);
          }
        }
        for (const k of defaultMiddleOrder) {
          if (!seen.has(k)) order.push(k);
        }
        setColOrder(order);
      }
    } catch {
      // ignore — Default-Config bleibt
    }
    setHydrated(true);
  }, [storageKey, validKeys, columns, defaultMiddleOrder, defaultVisible]);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          visible: Array.from(visibleCols),
          order: colOrder,
        }),
      );
    } catch {
      // ignore
    }
  }, [storageKey, visibleCols, colOrder, hydrated]);

  const toggleColumn = useCallback(
    (key: K) => {
      setVisibleCols((prev) => {
        const def = columns.find((c) => c.key === key);
        if (def?.always) return prev;
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [columns],
  );

  const reorderColumns = useCallback((activeId: K, overId: K) => {
    if (activeId === overId) return;
    setColOrder((prev) => {
      const from = prev.indexOf(activeId);
      const to = prev.indexOf(overId);
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  }, []);

  const toggleSort = useCallback((key: S) => {
    setSortKey((prev) => {
      if (prev === key) return prev;
      return key;
    });
    setSortDir((prev) => {
      // Wenn gleiche Spalte: Richtung wechseln. Sonst auf asc reset.
      if (sortKey === key) return prev === "asc" ? "desc" : "asc";
      return "asc";
    });
  }, [sortKey]);

  const resetColumns = useCallback(() => {
    setVisibleCols(defaultVisible);
    setColOrder(defaultMiddleOrder);
  }, [defaultMiddleOrder, defaultVisible]);

  // Abgeleitete Listen
  const colsByKey = useMemo(() => {
    const m = new Map<K, DataTableColumn<K, S>>();
    for (const c of columns) m.set(c.key, c);
    return m;
  }, [columns]);

  const pinnedStart = useMemo(
    () => columns.filter((c) => c.pinned === "start"),
    [columns],
  );
  const pinnedEnd = useMemo(
    () => columns.filter((c) => c.pinned === "end"),
    [columns],
  );
  const orderedMiddle = useMemo(
    () =>
      colOrder
        .map((k) => colsByKey.get(k))
        .filter((c): c is DataTableColumn<K, S> => Boolean(c)),
    [colOrder, colsByKey],
  );
  const activeColumns = useMemo(
    () => [
      ...pinnedStart.filter((c) => visibleCols.has(c.key)),
      ...orderedMiddle.filter((c) => visibleCols.has(c.key)),
      ...pinnedEnd.filter((c) => visibleCols.has(c.key)),
    ],
    [pinnedStart, orderedMiddle, pinnedEnd, visibleCols],
  );
  const draggableMiddleVisible = useMemo(
    () => orderedMiddle.filter((c) => visibleCols.has(c.key)),
    [orderedMiddle, visibleCols],
  );
  const gridTemplate = useMemo(
    () => activeColumns.map((c) => c.gridCol).join(" "),
    [activeColumns],
  );

  return {
    hydrated,
    visibleCols,
    colOrder,
    sortKey,
    sortDir,
    activeColumns,
    pinnedStart,
    pinnedEnd,
    draggableMiddleVisible,
    gridTemplate,
    toggleColumn,
    reorderColumns,
    toggleSort,
    resetColumns,
    sensors,
  };
}
