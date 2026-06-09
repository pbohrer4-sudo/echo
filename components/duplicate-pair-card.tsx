"use client";

import { useState } from "react";
import Link from "next/link";

// Reusable pair row used by both the people and organizations dedup
// pages. Generic over the side-shape so we can render the right
// metadata (role/company for people, domain/industry for orgs).

interface Side {
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  avatarUrl?: string | null;
}

const CONFIDENCE_TONE: Record<string, string> = {
  high: "border-bad/40 bg-bad/5 text-bad",
  medium: "border-signal/40 bg-signal-soft text-signal",
  low: "border-rule bg-paper-2 text-ink-3",
};
const CONFIDENCE_LABEL: Record<string, string> = {
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
};

export function DuplicatePairCard({
  primary,
  secondary,
  score,
  confidence,
  reasons,
  endpoint,
  initialPrimaryId,
}: {
  primary: Side;
  secondary: Side;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  endpoint: string;
  initialPrimaryId: string;
}) {
  // Which side gets kept. User can flip — we want primary = "the one
  // with more history" by default but the user knows their data best.
  const [primaryId, setPrimaryId] = useState(initialPrimaryId);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  const keptSide = primaryId === primary.id ? primary : secondary;
  const droppedSide = primaryId === primary.id ? secondary : primary;

  async function merge() {
    setMerging(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primary_id: keptSide.id,
          secondary_id: droppedSide.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Merge ${res.status}`);
      }
      // Card disappears from the list. RSC refresh re-fetches dedup
      // rows so the next pair surfaces.
      setHidden(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merge fehlgeschlagen");
    } finally {
      setMerging(false);
    }
  }

  function ignore() {
    setHidden(true);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-rule bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-paper-2 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${CONFIDENCE_TONE[confidence]}`}
          >
            {CONFIDENCE_LABEL[confidence]} · {score}
          </span>
          {reasons.map((r) => (
            <span
              key={r}
              className="rounded-full border border-rule bg-paper px-2 py-0.5 text-[10px] text-ink-3"
            >
              {r}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={ignore}
            disabled={merging}
            className="rounded border border-rule bg-paper px-3 py-1 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1 disabled:opacity-50"
          >
            Ignorieren
          </button>
          <button
            type="button"
            onClick={merge}
            disabled={merging}
            className="rounded border border-action bg-action px-3 py-1 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
          >
            {merging ? "Merge…" : `Merge → behalte ${keptSide.title}`}
          </button>
        </div>
      </div>

      <div className="grid gap-0 sm:grid-cols-2">
        {[primary, secondary].map((side) => {
          const isKept = side.id === primaryId;
          return (
            <div
              key={side.id}
              className={`relative flex items-start gap-3 border-rule p-4 sm:[&:not(:last-child)]:border-r ${
                isKept ? "bg-paper" : "bg-paper-2"
              }`}
            >
              <input
                type="radio"
                checked={isKept}
                onChange={() => setPrimaryId(side.id)}
                disabled={merging}
                className="mt-1 h-4 w-4 accent-[var(--action)]"
                aria-label={`${side.title} behalten`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={side.href}
                    className="truncate text-sm font-medium text-ink-1 transition hover:text-action"
                  >
                    {side.title}
                  </Link>
                  {isKept && (
                    <span className="rounded border border-action/40 bg-action-soft px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-action">
                      behalten
                    </span>
                  )}
                  {!isKept && (
                    <span className="rounded border border-bad/30 bg-bad/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-bad">
                      löschen
                    </span>
                  )}
                </div>
                {side.subtitle && (
                  <p className="mt-0.5 truncate text-xs text-ink-3">
                    {side.subtitle}
                  </p>
                )}
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ink-4">
                  {side.id.slice(0, 8)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="border-t border-bad/30 bg-bad/5 px-4 py-2 text-xs text-bad">
          Fehler: {error}
        </p>
      )}
    </div>
  );
}
