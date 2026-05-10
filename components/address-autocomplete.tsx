"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AddressEntry } from "@/lib/types";

interface Suggestion {
  display: string;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
}

const inputClass =
  "h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";

// Single address row with autocomplete on the street input. Hits
// /api/address-search (which proxies OSM Nominatim). Picking a suggestion
// fills street, postal_code, city, country in one go; the user can still
// override any field manually.
//
// We compose the search query from whatever fields are populated —
// "Seybothstr. 10 München" matches better than "Seybothstr. 10" alone
// — so typing PLZ/city after the street narrows results.
export function AddressAutocomplete({
  value,
  onChange,
}: {
  value: AddressEntry;
  onChange: (next: AddressEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastQueryRef = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const unmountedRef = useRef(false);

  // Close suggestion panel when user clicks outside.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Cancel any pending fetch / debounce when the component unmounts.
  // Without this, a slow Nominatim response after navigation triggers
  // "setState on unmounted component" warnings.
  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const runSearch = useCallback(
    (query: string) => {
      lastQueryRef.current = query;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      const trimmed = query.trim();
      // 3 chars is the sweet spot — Nominatim accepts it, and it kicks
      // in fast enough that the user feels the autocomplete working.
      if (trimmed.length < 3) {
        setSuggestions([]);
        setOpen(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      debounceRef.current = window.setTimeout(async () => {
        // Cancel any earlier in-flight fetch — saves bandwidth and
        // upstream Nominatim load. The lastQueryRef check below still
        // protects against ordering even if abort doesn't fire in time.
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        try {
          const res = await fetch(
            `/api/address-search?q=${encodeURIComponent(trimmed)}`,
            { signal: ctrl.signal },
          );
          if (unmountedRef.current) return;
          if (lastQueryRef.current !== query) return;
          if (!res.ok) {
            setSuggestions([]);
            setOpen(false);
            return;
          }
          const { results } = (await res.json()) as { results: Suggestion[] };
          if (unmountedRef.current) return;
          setSuggestions(results ?? []);
          setOpen(true);
        } catch (err) {
          if ((err as { name?: string })?.name === "AbortError") return;
          if (unmountedRef.current) return;
          setSuggestions([]);
          setOpen(false);
        } finally {
          if (!unmountedRef.current && lastQueryRef.current === query) {
            setLoading(false);
          }
        }
      }, 300);
    },
    [],
  );

  // Compose the freeform query Nominatim should resolve. Street alone
  // is often ambiguous ("Seybothstr." exists in multiple cities); add
  // PLZ/city/country if the user has typed any.
  function composeQuery(next: AddressEntry): string {
    return [next.street, next.postal_code, next.city, next.country]
      .filter(Boolean)
      .join(" ");
  }

  function patch(partial: Partial<AddressEntry>) {
    const next = { ...value, ...partial };
    onChange(next);
    setTouched(true);
    runSearch(composeQuery(next));
  }

  function pickSuggestion(s: Suggestion) {
    onChange({
      ...value,
      street: s.street ?? value.street,
      postal_code: s.postal_code ?? value.postal_code,
      city: s.city ?? value.city,
      country: s.country ?? value.country,
    });
    setOpen(false);
    setSuggestions([]);
  }

  // Reopen suggestion panel if the user comes back to a populated street
  // — better than making them retype.
  function reopenIfReady() {
    if (suggestions.length > 0) setOpen(true);
    else if ((value.street ?? "").trim().length >= 3 && !loading) {
      runSearch(composeQuery(value));
    }
  }

  const showHint =
    touched &&
    !loading &&
    open === false &&
    suggestions.length === 0 &&
    (value.street ?? "").trim().length >= 3;

  return (
    <div className="space-y-2" ref={containerRef}>
      {/* Street input doubles as the search field — that's where
          OpenStreetMap suggestions appear. Magnifier icon makes the
          search-as-you-type behaviour visible at a glance. */}
      <div className="relative">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          aria-hidden
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-3.5-3.5" />
          </svg>
        </span>
        <input
          value={value.street ?? ""}
          onChange={(e) => patch({ street: e.target.value || null })}
          onFocus={reopenIfReady}
          placeholder="Straße + Hausnummer — Vorschläge füllen PLZ, Stadt, Land"
          className={`${inputClass} pl-9 pr-9`}
        />
        {loading && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3"
            aria-hidden
          >
            <svg
              className="h-3.5 w-3.5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </span>
        )}
        {open && suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded border border-rule bg-paper shadow-[0_4px_14px_rgba(20,17,13,0.06)]">
            <li className="t-label flex items-center justify-between border-b border-rule-soft bg-paper-2 px-3 py-1.5">
              <span>{suggestions.length} Vorschläge</span>
              <span className="font-mono text-[9px] text-ink-4">
                via OpenStreetMap
              </span>
            </li>
            {suggestions.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => pickSuggestion(s)}
                  className="block w-full border-b border-rule-soft px-3 py-2 text-left text-sm text-ink-1 transition-colors last:border-0 hover:bg-paper-2"
                >
                  <span className="block truncate">
                    {[s.street, s.postal_code, s.city]
                      .filter(Boolean)
                      .join(" · ") || s.display}
                  </span>
                  <span className="block truncate font-mono text-[10px] tracking-wider text-ink-4">
                    {s.country}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showHint && (
        <p className="text-[10px] uppercase tracking-wider text-ink-4">
          Keine Vorschläge — gib ggf. Stadt mit dazu (z.B. „Seybothstr. 10
          München")
        </p>
      )}

      <div className="grid grid-cols-[120px_1fr] gap-2">
        <input
          value={value.postal_code ?? ""}
          onChange={(e) => patch({ postal_code: e.target.value || null })}
          placeholder="PLZ"
          className={inputClass}
        />
        <input
          value={value.city ?? ""}
          onChange={(e) => patch({ city: e.target.value || null })}
          placeholder="Stadt"
          className={inputClass}
        />
      </div>
      <input
        value={value.country ?? ""}
        onChange={(e) => patch({ country: e.target.value || null })}
        placeholder="Land"
        className={inputClass}
      />
    </div>
  );
}
