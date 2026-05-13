"use client";

// People-Tabelle (Phase C5 v4): Filter-Dropdowns in einer Toolbar
// statt Pills in mehreren Reihen. Filter: Modus, Zweck, Cluster,
// Passion, Circle. Plus Search + Inline-Actions pro Row.

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  MODE_LABELS,
  PURPOSE_LABELS,
  TAG_CLUSTER_COLORS,
  TAG_CLUSTER_LABELS,
  type CircleRow,
  type Mode,
  type Person,
  type Purpose,
  type TagCluster,
} from "@/lib/types";

type SortKey = "name" | "company" | "last_contact_at";
type SortDir = "asc" | "desc";

interface Row {
  person: Person;
  clusters: string[];
  passions: string[];   // lower-cased names
  circleIds: string[];
}

interface Props {
  rows: Row[];
  circles: CircleRow[];
  passions: string[];   // distinct lower-cased names, alphabetically
  totalCount?: number;
}

const CLUSTER_ORDER: TagCluster[] = [
  "reminders",
  "interests",
  "potential",
  "origin",
];

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

export function PeopleTable({
  rows,
  circles,
  passions,
  totalCount,
}: Props) {
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<"all" | Mode>("all");
  const [purposeFilter, setPurposeFilter] = useState<"all" | Purpose>("all");
  const [clusterFilter, setClusterFilter] = useState<"all" | TagCluster>(
    "all",
  );
  const [passionFilter, setPassionFilter] = useState<string>("all");
  const [circleFilter, setCircleFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const activeFilterCount =
    (modeFilter !== "all" ? 1 : 0) +
    (purposeFilter !== "all" ? 1 : 0) +
    (clusterFilter !== "all" ? 1 : 0) +
    (passionFilter !== "all" ? 1 : 0) +
    (circleFilter !== "all" ? 1 : 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const p = r.person;
      if (modeFilter !== "all" && p.mode !== modeFilter) return false;
      if (purposeFilter !== "all" && p.purpose !== purposeFilter) return false;
      if (clusterFilter !== "all" && !r.clusters.includes(clusterFilter))
        return false;
      if (passionFilter !== "all" && !r.passions.includes(passionFilter))
        return false;
      if (circleFilter !== "all" && !r.circleIds.includes(circleFilter))
        return false;
      if (!q) return true;
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
  }, [
    rows,
    search,
    modeFilter,
    purposeFilter,
    clusterFilter,
    passionFilter,
    circleFilter,
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
    setClusterFilter("all");
    setPassionFilter("all");
    setCircleFilter("all");
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: Search + Filter-Dropdowns + Actions */}
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
              ...passions.map((p) => ({
                value: p,
                label: titleCase(p),
              })),
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
              ...circles.map((c) => ({
                value: c.id,
                label: c.name,
              })),
            ]}
          />
        )}

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

      {/* Header */}
      <div className="overflow-hidden rounded border border-rule bg-paper">
        <div className="grid grid-cols-[40px_minmax(180px,1.6fr)_minmax(140px,1fr)_100px_100px_110px_auto] gap-3 border-b border-rule bg-paper-2 px-4 py-2.5 text-xs">
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
            Firma{" "}
            {sortKey === "company" && (sortDir === "asc" ? "↑" : "↓")}
          </button>
          <span className="t-label">Zweck</span>
          <span className="t-label">Modus</span>
          <button
            type="button"
            onClick={() => toggleSort("last_contact_at")}
            className="t-label text-left transition hover:text-ink-1"
          >
            Letzter Kontakt{" "}
            {sortKey === "last_contact_at" && (sortDir === "asc" ? "↑" : "↓")}
          </button>
          <span className="t-label text-right">Aktionen</span>
        </div>

        {sorted.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm italic text-ink-3">
            {totalCount === 0
              ? "Noch keine Personen — leg die erste an."
              : "Keine Treffer für diese Filter."}
          </div>
        ) : (
          sorted.map((r) => <PersonTableRow key={r.person.id} person={r.person} />)
        )}
      </div>
    </div>
  );
}

// Native-Select-Dropdown — barrierearm + responsive ohne Library.
// "label" steht als Text vor dem Wert. Optional highlight-Tönung
// für Cluster.
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

// Eine Zeile in der Personen-Tabelle. Inline-Actions am Ende.
function PersonTableRow({ person }: { person: Person }) {
  const phone = primaryPhone(person);
  const email = primaryEmail(person);
  const phoneDigits = phone ? normalizeForWaMe(phone) : "";
  const hasUsablePhone = phoneDigits.length >= 7;

  return (
    <div className="grid grid-cols-[40px_minmax(180px,1.6fr)_minmax(140px,1fr)_100px_100px_110px_auto] items-center gap-3 border-b border-rule-soft px-4 py-3 transition last:border-0 hover:bg-paper-2">
      <Link
        href={`/people/${person.id}`}
        className="flex items-center justify-center"
      >
        <span className="avatar" aria-hidden>
          {initials(person.name)}
        </span>
      </Link>
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
      <Link href={`/people/${person.id}`} className="min-w-0">
        <span className="block truncate text-xs text-ink-3">
          {[person.company, person.role].filter(Boolean).join(" · ") || "—"}
        </span>
      </Link>
      <span className="text-xs text-ink-2">
        {person.purpose ? PURPOSE_LABELS[person.purpose] : "—"}
      </span>
      <span className="text-xs text-ink-2">{MODE_LABELS[person.mode]}</span>
      <span className="font-mono text-[11px] text-ink-3">
        {formatDate(person.last_contact_at)}
      </span>
      <div className="flex items-center gap-1">
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
          href={hasUsablePhone ? `https://wa.me/${phoneDigits}` : undefined}
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
    </div>
  );
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
