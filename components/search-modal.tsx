"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import type { SearchHit, SearchResults } from "@/lib/search";

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  person: "Person",
  organization: "Organisation",
  note: "Notiz",
  interaction: "Interaktion",
};

const KIND_GLYPH: Record<SearchHit["kind"], string> = {
  person: "👤",
  organization: "🏢",
  note: "📝",
  interaction: "💬",
};

// Persisted history. Two separate buckets so the user can re-run a
// query (text-only) OR jump straight to a previously-opened item
// (cached hit metadata).
const RECENT_QUERIES_KEY = "echo:search:recent-queries";
const RECENT_HITS_KEY = "echo:search:recent-hits";
const MAX_QUERIES = 6;
const MAX_HITS = 8;

interface RecentHit extends SearchHit {
  ts: number;
}

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota
  }
}

// Global Cmd+K / Ctrl+K search. Renders via portal so it overlays
// the entire app regardless of layout containers.
export function SearchModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [recentHits, setRecentHits] = useState<RecentHit[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    setRecentQueries(loadJson<string[]>(RECENT_QUERIES_KEY, []));
    setRecentHits(loadJson<RecentHit[]>(RECENT_HITS_KEY, []));
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults(null);
    setActive(0);
  }, []);

  // Cmd+K / Ctrl+K toggles. Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        handleClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  // Listen for the manual trigger from the sidebar button.
  useEffect(() => {
    function onTrigger() {
      setOpen(true);
    }
    window.addEventListener("echo:open-search", onTrigger);
    return () => window.removeEventListener("echo:open-search", onTrigger);
  }, []);

  // Autofocus when opening.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 10);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Debounced search — 200ms feels snappy without hammering Postgres.
  // Successful results add the query to recent-queries (de-duped).
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const requested = query;
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(requested)}`,
        );
        if (!res.ok) {
          setResults({ query: requested, total: 0, hits: [] });
          return;
        }
        const data = (await res.json()) as SearchResults;
        setResults(data);
        setActive(0);
        // Only persist queries that actually returned something —
        // empty searches don't deserve a slot in recent.
        if (data.hits.length > 0) {
          setRecentQueries((prev) => {
            const trimmed = requested.trim();
            const next = [
              trimmed,
              ...prev.filter(
                (p) => p.toLowerCase() !== trimmed.toLowerCase(),
              ),
            ].slice(0, MAX_QUERIES);
            saveJson(RECENT_QUERIES_KEY, next);
            return next;
          });
        }
      } catch {
        setResults({ query: requested, total: 0, hits: [] });
      } finally {
        setLoading(false);
      }
    }, 200);
  }, [query, open]);

  function recordHit(hit: SearchHit) {
    setRecentHits((prev) => {
      const stamped: RecentHit = { ...hit, ts: Date.now() };
      const next = [
        stamped,
        ...prev.filter(
          (p) => !(p.kind === hit.kind && p.id === hit.id),
        ),
      ].slice(0, MAX_HITS);
      saveJson(RECENT_HITS_KEY, next);
      return next;
    });
  }

  function pick(hit: SearchHit) {
    recordHit(hit);
    handleClose();
    router.push(hit.href);
  }

  function clearRecent() {
    setRecentQueries([]);
    setRecentHits([]);
    saveJson(RECENT_QUERIES_KEY, []);
    saveJson(RECENT_HITS_KEY, []);
  }

  // What gets keyboard-navigated depends on which panel is showing:
  // results when a query is typed, otherwise the recent-hits list.
  const navigable: SearchHit[] = useMemo(() => {
    if (results && query.trim().length >= 2) return results.hits;
    return recentHits;
  }, [results, query, recentHits]);

  function onKeyInInput(e: React.KeyboardEvent) {
    if (navigable.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, navigable.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(navigable[active]);
    }
  }

  if (!mounted || !open) return null;

  const showRecent =
    query.trim().length < 2 &&
    (recentQueries.length > 0 || recentHits.length > 0);

  const showHelpEmpty =
    query.trim().length < 2 &&
    recentQueries.length === 0 &&
    recentHits.length === 0;

  const node = (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-ink-1/30 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-rule bg-paper shadow-[0_24px_60px_rgba(20,17,13,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-label="Suche"
      >
        <div className="flex items-center gap-2 border-b border-rule px-4 py-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-ink-3"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyInInput}
            placeholder="Personen, Organisationen, Notizen, Interaktionen…"
            className="flex-1 bg-transparent text-sm text-ink-1 placeholder:text-ink-4 focus:outline-none"
          />
          {loading && (
            <span className="t-label" aria-hidden>
              …
            </span>
          )}
          <kbd className="rounded border border-rule bg-paper-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-4">
            Esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {showHelpEmpty && (
            <div className="px-4 py-6 text-center">
              <p className="t-label mb-2">Globale Suche</p>
              <p className="text-xs text-ink-3">
                Mindestens 2 Zeichen tippen — sucht parallel in Personen,
                Organisationen, Notizen und Interaktionen.
              </p>
              <p className="mt-3 font-mono text-[10px] text-ink-4">
                ⌘K oder Ctrl+K öffnet · ↑↓ navigieren · ↵ öffnen
              </p>
            </div>
          )}

          {showRecent && (
            <div>
              {recentQueries.length > 0 && (
                <div className="border-b border-rule-soft px-4 py-3">
                  <p className="t-label mb-2">Zuletzt gesucht</p>
                  <div className="flex flex-wrap gap-1.5">
                    {recentQueries.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => {
                          setQuery(q);
                          inputRef.current?.focus();
                        }}
                        className="rounded-full border border-rule bg-paper-2 px-2.5 py-1 text-xs text-ink-2 transition hover:border-action hover:text-action"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {recentHits.length > 0 && (
                <div>
                  <div className="flex items-center justify-between border-b border-rule-soft bg-paper-2 px-4 py-1.5">
                    <span className="t-label">Zuletzt besucht</span>
                    <button
                      type="button"
                      onClick={clearRecent}
                      className="font-mono text-[9px] uppercase tracking-wider text-ink-4 transition hover:text-ink-1"
                    >
                      Verlauf leeren
                    </button>
                  </div>
                  <ul>
                    {recentHits.map((hit, i) => (
                      <li key={`recent-${hit.kind}-${hit.id}`}>
                        <button
                          type="button"
                          onClick={() => pick(hit)}
                          onMouseEnter={() => setActive(i)}
                          className={`flex w-full items-start gap-3 border-b border-rule-soft px-4 py-2.5 text-left transition last:border-0 ${
                            i === active ? "bg-paper-2" : "hover:bg-paper-2"
                          }`}
                        >
                          <span className="text-base leading-none" aria-hidden>
                            {KIND_GLYPH[hit.kind]}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium text-ink-1">
                                {hit.title}
                              </span>
                              <span className="t-label">
                                {KIND_LABEL[hit.kind]}
                              </span>
                            </span>
                            {hit.subtitle && (
                              <span className="block truncate text-xs text-ink-3">
                                {hit.subtitle}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {results && results.hits.length === 0 && !loading && (
            <p className="px-4 py-6 text-center text-xs text-ink-3">
              Keine Treffer für „{results.query}"
            </p>
          )}

          {results && results.hits.length > 0 && (
            <ul>
              {results.hits.map((hit, i) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <button
                    type="button"
                    onClick={() => pick(hit)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-start gap-3 border-b border-rule-soft px-4 py-2.5 text-left transition last:border-0 ${
                      i === active ? "bg-paper-2" : "hover:bg-paper-2"
                    }`}
                  >
                    <span className="text-base leading-none" aria-hidden>
                      {KIND_GLYPH[hit.kind]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink-1">
                          {hit.title}
                        </span>
                        <span className="t-label">{KIND_LABEL[hit.kind]}</span>
                      </span>
                      {hit.subtitle && (
                        <span className="block truncate text-xs text-ink-3">
                          {hit.subtitle}
                        </span>
                      )}
                      {hit.snippet && (
                        <span className="block truncate font-mono text-[10px] text-ink-4">
                          {hit.snippet}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

// Tiny helper exposed to other components: dispatch the open event
// from a button click, e.g. the sidebar trigger.
export function openSearch() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("echo:open-search"));
}
