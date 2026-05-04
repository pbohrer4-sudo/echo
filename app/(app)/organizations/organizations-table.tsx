"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { OrgWithCount } from "@/lib/organizations";

type SortKey = "name" | "industry" | "people_count";
type SortDir = "asc" | "desc";

function compare(
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

export function OrganizationsTable({
  orgs,
  activeTag = null,
  totalCount,
}: {
  orgs: OrgWithCount[];
  activeTag?: string | null;
  totalCount?: number;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((o) => {
      const haystack = [o.name, o.industry, o.hq, o.domain, ...(o.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [orgs, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey] as string | number | null;
      const bv = b[sortKey] as string | number | null;
      return compare(av, bv, sortDir);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir(key === "people_count" ? "desc" : "asc");
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
            href="/organizations"
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
            placeholder="Name, Branche, HQ, Tags…"
            className="flex-1 bg-transparent text-sm text-ink-1 outline-none placeholder:text-ink-4"
          />
        </div>
        <Link
          href="/organizations/new"
          className="inline-flex h-9 items-center rounded border border-action bg-action px-4 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
        >
          + Organisation
        </Link>
      </div>

      <div className="overflow-hidden rounded border border-rule bg-paper">
        <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_80px] gap-4 border-b border-rule bg-paper-2 px-4 py-2.5">
          <SortHeader
            label="Name"
            active={sortKey === "name"}
            dir={sortDir}
            onClick={() => toggleSort("name")}
          />
          <SortHeader
            label="Branche"
            active={sortKey === "industry"}
            dir={sortDir}
            onClick={() => toggleSort("industry")}
          />
          <span className="t-label">HQ</span>
          <span className="t-label">Tags</span>
          <SortHeader
            label="Personen"
            active={sortKey === "people_count"}
            dir={sortDir}
            onClick={() => toggleSort("people_count")}
            align="right"
          />
        </div>

        {sorted.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-ink-3">
            {orgs.length === 0
              ? "Noch keine Organisationen — leg die erste an."
              : "Keine Treffer für diese Suche."}
          </div>
        ) : (
          sorted.map((o) => (
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
              className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_80px] cursor-pointer gap-4 border-b border-rule-soft px-4 py-3 transition-colors hover:bg-paper-2 last:border-b-0 focus:bg-paper-2 focus:outline-none"
            >
              <span className="min-w-0 self-center">
                <span className="block truncate font-medium text-ink-1">
                  {o.name}
                </span>
                {o.domain && (
                  <span className="block truncate font-mono text-[10px] tracking-wider text-ink-4">
                    {o.domain}
                  </span>
                )}
              </span>
              <span className="self-center truncate text-sm text-ink-2">
                {o.industry ?? "—"}
              </span>
              <span className="self-center truncate text-sm text-ink-2">
                {o.hq ?? "—"}
              </span>
              <span className="flex flex-wrap gap-1 self-center">
                {(o.tags ?? []).slice(0, 3).map((t) => (
                  <Link
                    key={t}
                    href={`/organizations?tag=${encodeURIComponent(t)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="tag transition hover:border-action hover:text-action"
                  >
                    <span className="dot" />
                    {t}
                  </Link>
                ))}
              </span>
              <span className="self-center text-right font-mono text-xs tracking-wider text-ink-2">
                {o.people_count}
              </span>
            </div>
          ))
        )}
      </div>

      <p className="t-label">
        {sorted.length} von {totalCount ?? orgs.length}
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
