"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Person, Scope } from "@/lib/types";

type SortKey = "name" | "company" | "last_interaction_at" | "scope";
type SortDir = "asc" | "desc";
type ScopeFilter = "all" | Scope;

const SCOPE_LABEL: Record<Scope, string> = {
  work: "Beruflich",
  personal: "Privat",
  both: "Beides",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
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
  const cmp = typeof a === "number" ? a - (b as number) : a.localeCompare(b as string);
  return dir === "asc" ? cmp : -cmp;
}

export function PeopleTable({ people }: { people: Person[] }) {
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (scopeFilter !== "all" && p.scope !== scopeFilter) return false;
      if (!q) return true;
      const haystack = [p.name, p.company, p.role, ...(p.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [people, search, scopeFilter]);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suche Name, Firma, Rolle, Tags…"
          className="min-w-64 flex-1 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-[#c8ff3e]"
        />
        <div className="flex rounded-md border border-neutral-800 bg-neutral-950 p-0.5 text-xs">
          {(["all", "work", "personal", "both"] as ScopeFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScopeFilter(s)}
              className={`rounded px-3 py-1 transition-colors ${
                scopeFilter === s
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {s === "all" ? "Alle" : SCOPE_LABEL[s as Scope]}
            </button>
          ))}
        </div>
        <Link
          href="/people/new"
          className="rounded-md bg-[#c8ff3e] px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-[#b6eb2c]"
        >
          + Person
        </Link>
      </div>

      <div className="rounded-md border border-neutral-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-900 text-left text-xs uppercase tracking-wider text-neutral-500">
              <SortHeader
                label="Name"
                active={sortKey === "name"}
                dir={sortDir}
                onClick={() => toggleSort("name")}
              />
              <SortHeader
                label="Firma"
                active={sortKey === "company"}
                dir={sortDir}
                onClick={() => toggleSort("company")}
              />
              <SortHeader
                label="Scope"
                active={sortKey === "scope"}
                dir={sortDir}
                onClick={() => toggleSort("scope")}
              />
              <th className="px-4 py-3 font-normal">Tags</th>
              <SortHeader
                label="Letzte Interaktion"
                active={sortKey === "last_interaction_at"}
                dir={sortDir}
                onClick={() => toggleSort("last_interaction_at")}
              />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-sm text-neutral-500"
                >
                  {people.length === 0
                    ? "Noch keine Personen — leg die erste an."
                    : "Keine Treffer für diesen Filter."}
                </td>
              </tr>
            ) : (
              sorted.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-neutral-900 last:border-0 hover:bg-neutral-900/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/people/${p.id}`}
                      className="font-medium text-neutral-100 hover:text-[#c8ff3e]"
                    >
                      {p.name}
                    </Link>
                    {p.role && (
                      <p className="text-xs text-neutral-500">{p.role}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-300">
                    {p.company ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-400">
                    {SCOPE_LABEL[p.scope]}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(p.tags ?? []).map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-neutral-800 px-2 py-0.5 text-xs text-neutral-400"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-400">
                    {formatDate(p.last_interaction_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        {sorted.length} von {people.length}
      </p>
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-3 font-normal">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-neutral-200 ${
          active ? "text-neutral-200" : ""
        }`}
      >
        {label}
        {active && <span aria-hidden>{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}
