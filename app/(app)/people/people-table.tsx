"use client";

// People-Tabelle nach 0025-Legacy-Cleanup (Phase F vorgezogen).
//
// Vorgänger-Version (688 Zeilen) hatte 11 togglebare Spalten + 3 Filter
// auf Legacy-Feldern (scope, stakeholder, priority). Mit den Drops aus
// 0025 sind diese Felder weg — Tabelle hier ist auf das verkleinerte
// Modell zugeschnitten. Spalten-Toggling, Cluster-Filter etc. kommen
// in Phase c (Tag-Cluster v3) und Phase C5 (People-Liste-Filter)
// strukturiert zurück.

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Person, Mode, Purpose } from "@/lib/types";
import { MODE_LABELS, PURPOSE_LABELS } from "@/lib/types";

type SortKey = "name" | "company" | "last_contact_at";
type SortDir = "asc" | "desc";
type ModeFilter = "all" | Mode;
type PurposeFilter = "all" | Purpose;

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

export function PeopleTable({
  people,
  activeTag = null,
  totalCount,
}: {
  people: Person[];
  activeTag?: string | null;
  totalCount?: number;
}) {
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [purposeFilter, setPurposeFilter] = useState<PurposeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (modeFilter !== "all" && p.mode !== modeFilter) return false;
      if (purposeFilter !== "all" && p.purpose !== purposeFilter) return false;
      if (!q) return true;
      // Schmale Haystack auf Felder die garantiert da sind nach 0025.
      const haystack = [
        p.name,
        p.company,
        p.role,
        p.notes,
        p.how_we_met,
        p.met_location,
        p.current_location,
        p.home_location,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [people, search, modeFilter, purposeFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortKey === "name") {
        return sortDir === "asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      }
      if (sortKey === "company") {
        return compareNullable(a.company, b.company, sortDir);
      }
      if (sortKey === "last_contact_at") {
        return compareNullable(a.last_contact_at, b.last_contact_at, sortDir);
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

  return (
    <div className="space-y-4">
      {/* Search + Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, Firma, Ort, Notiz …"
          className="h-9 w-full max-w-xs rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
        />

        {/* Mode-Filter */}
        <div className="flex items-center rounded border border-rule bg-paper p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setModeFilter("all")}
            className={`rounded px-3 py-1 transition ${
              modeFilter === "all"
                ? "bg-paper-2 text-ink-1"
                : "text-ink-3 hover:text-ink-1"
            }`}
          >
            Modus alle
          </button>
          {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModeFilter(m)}
              className={`rounded px-3 py-1 transition ${
                modeFilter === m
                  ? "bg-paper-2 text-ink-1"
                  : "text-ink-3 hover:text-ink-1"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Purpose-Filter */}
        <div className="flex items-center rounded border border-rule bg-paper p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setPurposeFilter("all")}
            className={`rounded px-3 py-1 transition ${
              purposeFilter === "all"
                ? "bg-paper-2 text-ink-1"
                : "text-ink-3 hover:text-ink-1"
            }`}
          >
            Zweck alle
          </button>
          {(Object.keys(PURPOSE_LABELS) as Purpose[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPurposeFilter(p)}
              className={`rounded px-3 py-1 transition ${
                purposeFilter === p
                  ? "bg-paper-2 text-ink-1"
                  : "text-ink-3 hover:text-ink-1"
              }`}
            >
              {PURPOSE_LABELS[p]}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
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

      {activeTag && (
        <div className="rounded border border-rule bg-paper-2 px-3 py-2 text-xs text-ink-3">
          Tag-Filter „{activeTag}" — Legacy-Filter weg in 0025, kommt mit
          Phase c als Cluster-Filter zurück.{" "}
          <Link href="/people" className="text-action hover:underline">
            Reset
          </Link>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded border border-rule bg-paper">
        <div className="grid grid-cols-[40px_minmax(180px,1.4fr)_minmax(160px,1fr)_120px_120px_120px] gap-3 border-b border-rule bg-paper-2 px-4 py-2.5 text-xs">
          <span className="t-label" />
          <button
            type="button"
            onClick={() => toggleSort("name")}
            className="t-label text-left transition hover:text-ink-1"
          >
            Name {sortKey === "name" && (sortDir === "asc" ? "↑" : "↓")}
          </button>
          <button
            type="button"
            onClick={() => toggleSort("company")}
            className="t-label text-left transition hover:text-ink-1"
          >
            Firma · Rolle{" "}
            {sortKey === "company" && (sortDir === "asc" ? "↑" : "↓")}
          </button>
          <span className="t-label">Zweck</span>
          <span className="t-label">Modus</span>
          <button
            type="button"
            onClick={() => toggleSort("last_contact_at")}
            className="t-label text-right transition hover:text-ink-1"
          >
            Letzter Kontakt{" "}
            {sortKey === "last_contact_at" && (sortDir === "asc" ? "↑" : "↓")}
          </button>
        </div>

        {sorted.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm italic text-ink-3">
            {totalCount === 0
              ? "Noch keine Personen — leg die erste an."
              : "Keine Treffer für diese Filter."}
          </div>
        ) : (
          sorted.map((p) => (
            <Link
              key={p.id}
              href={`/people/${p.id}`}
              className="grid grid-cols-[40px_minmax(180px,1.4fr)_minmax(160px,1fr)_120px_120px_120px] items-center gap-3 border-b border-rule-soft px-4 py-3 transition last:border-0 hover:bg-paper-2"
            >
              <span className="avatar" aria-hidden>
                {initials(p.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink-1">
                  {p.name}
                </span>
                {p.how_we_met && (
                  <span className="block truncate text-[11px] italic text-ink-4">
                    {p.how_we_met}
                  </span>
                )}
              </span>
              <span className="truncate text-xs text-ink-3">
                {[p.company, p.role].filter(Boolean).join(" · ") || "—"}
              </span>
              <span className="text-xs text-ink-2">
                {p.purpose ? PURPOSE_LABELS[p.purpose] : "—"}
              </span>
              <span className="text-xs text-ink-2">
                {MODE_LABELS[p.mode]}
              </span>
              <span className="text-right font-mono text-[11px] text-ink-3">
                {formatDate(p.last_contact_at)}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
