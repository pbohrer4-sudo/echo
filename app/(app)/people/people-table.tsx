"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
            placeholder="Name, Firma, Rolle, Tags…"
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
        <Link
          href="/people/new"
          className="inline-flex h-9 items-center rounded border border-action bg-action px-4 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
        >
          + Person
        </Link>
      </div>

      <div className="overflow-hidden rounded border border-rule bg-paper">
        <div className="grid grid-cols-[28px_minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_120px] gap-4 border-b border-rule bg-paper-2 px-4 py-2.5">
          <span className="t-label" />
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
          <span className="t-label">Tags</span>
          <SortHeader
            label="Letzte Interaktion"
            active={sortKey === "last_interaction_at"}
            dir={sortDir}
            onClick={() => toggleSort("last_interaction_at")}
            align="right"
          />
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
              className="grid grid-cols-[28px_minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_120px] cursor-pointer gap-4 border-b border-rule-soft px-4 py-3 transition-colors hover:bg-paper-2 last:border-b-0 focus:bg-paper-2 focus:outline-none"
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
              <span className="self-center truncate text-sm text-ink-2">
                {p.company ?? "—"}
              </span>
              <span className="self-center font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                {SCOPE_LABEL[p.scope]}
              </span>
              <span className="flex flex-wrap gap-1 self-center">
                {(p.tags ?? []).slice(0, 3).map((t) => (
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
              <span className="self-center text-right font-mono text-[11px] tracking-wider text-ink-3">
                {formatDate(p.last_interaction_at)}
              </span>
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
