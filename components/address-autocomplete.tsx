"use client";

import { useEffect, useRef, useState } from "react";
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
export function AddressAutocomplete({
  value,
  onChange,
}: {
  value: AddressEntry;
  onChange: (next: AddressEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close suggestion panel when user clicks outside.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function setStreet(street: string) {
    onChange({ ...value, street: street || null });
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (street.trim().length < 4) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/address-search?q=${encodeURIComponent(street)}`,
        );
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const { results } = (await res.json()) as { results: Suggestion[] };
        setSuggestions(results ?? []);
        setOpen((results ?? []).length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
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

  return (
    <div className="space-y-2" ref={containerRef}>
      <div className="relative">
        <input
          value={value.street ?? ""}
          onChange={(e) => setStreet(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Straße + Hausnummer"
          className={inputClass}
        />
        {loading && (
          <span className="t-label absolute right-3 top-1/2 -translate-y-1/2">
            …
          </span>
        )}
        {open && suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded border border-rule bg-paper shadow-[0_4px_14px_rgba(20,17,13,0.06)]">
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
      <div className="grid grid-cols-[120px_1fr] gap-2">
        <input
          value={value.postal_code ?? ""}
          onChange={(e) =>
            onChange({ ...value, postal_code: e.target.value || null })
          }
          placeholder="PLZ"
          className={inputClass}
        />
        <input
          value={value.city ?? ""}
          onChange={(e) =>
            onChange({ ...value, city: e.target.value || null })
          }
          placeholder="Stadt"
          className={inputClass}
        />
      </div>
      <input
        value={value.country ?? ""}
        onChange={(e) =>
          onChange({ ...value, country: e.target.value || null })
        }
        placeholder="Land"
        className={inputClass}
      />
    </div>
  );
}
