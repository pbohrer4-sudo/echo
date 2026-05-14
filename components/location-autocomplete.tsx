"use client";

// Location-Autocomplete via OpenStreetMap (Nominatim).
//
// Wraps a regular text input with debounced server-side search. Wenn
// der Nutzer einen Vorschlag wählt, wird der display_name in den
// sichtbaren Input geschrieben UND zusätzliche Hidden-Inputs erzeugen
// das LocationGeo-Objekt für das Form-Submit:
//
//   <input name="{name}"       value="{display_name oder freitext}" />
//   <input name="{name}_geo"  type="hidden" value='{"lat":...,"lng":...}' />
//
// Free-Text-Eingabe (ohne Vorschlag) bleibt erlaubt — der Geo-Hidden
// ist dann leer und der Server speichert nur den String.

import { useEffect, useId, useRef, useState } from "react";
import type { LocationGeo } from "@/lib/types";

interface Props {
  name: string;                       // HTML-name fürs Form
  defaultValue?: string | null;
  defaultGeo?: LocationGeo | null;
  placeholder?: string;
  className?: string;                 // Style fürs sichtbare Input
  onChange?: (value: string, geo: LocationGeo | null) => void;
  required?: boolean;
}

const DEBOUNCE_MS = 400;
const MIN_LENGTH = 2;

export function LocationAutocomplete({
  name,
  defaultValue = "",
  defaultGeo = null,
  placeholder,
  className,
  onChange,
  required,
}: Props) {
  const inputId = useId();
  const [value, setValue] = useState(defaultValue ?? "");
  const [geo, setGeo] = useState<LocationGeo | null>(defaultGeo);
  const [suggestions, setSuggestions] = useState<LocationGeo[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Bei jeder Eingabe debounced suchen.
  useEffect(() => {
    // Wenn der User exakt den display_name aus dem aktuellen geo tippt,
    // brauchen wir nichts suchen — Auswahl steht.
    if (geo && value === geo.display_name) {
      setSuggestions([]);
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length < MIN_LENGTH) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/geo/search?q=${encodeURIComponent(trimmed)}`,
          { credentials: "include" },
        );
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = (await res.json()) as { results?: LocationGeo[] };
        setSuggestions(data.results ?? []);
        setOpen(true);
        setFocusIndex(-1);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [value, geo]);

  // Click-outside schließt das Dropdown.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function selectSuggestion(s: LocationGeo) {
    setValue(s.display_name);
    setGeo(s);
    setOpen(false);
    setSuggestions([]);
    onChange?.(s.display_name, s);
  }

  function handleInputChange(next: string) {
    setValue(next);
    // Sobald der User editiert, verliert die alte geo-Auswahl
    // Gültigkeit (außer er tippt exakt denselben String wieder).
    if (geo && next !== geo.display_name) {
      setGeo(null);
      onChange?.(next, null);
    } else if (!geo) {
      onChange?.(next, null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      if (focusIndex >= 0 && focusIndex < suggestions.length) {
        e.preventDefault();
        selectSuggestion(suggestions[focusIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        id={inputId}
        type="text"
        name={name}
        value={value}
        required={required}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {/* Hidden-Input transportiert das Geo-Objekt mit dem Form-Submit.
          Server-Action parsed das JSON optional — fehlt es, wird's einfach
          weggelassen und nur der display-Wert gespeichert. */}
      <input
        type="hidden"
        name={`${name}_geo`}
        value={geo ? JSON.stringify(geo) : ""}
      />

      {open && (suggestions.length > 0 || loading) && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded border border-rule bg-paper shadow-[0_4px_14px_rgba(20,17,13,0.08)]">
          {loading && suggestions.length === 0 && (
            <li className="px-3 py-2 text-xs italic text-ink-3">Suche…</li>
          )}
          {suggestions.map((s, i) => (
            <li key={s.place_id}>
              <button
                type="button"
                onClick={() => selectSuggestion(s)}
                onMouseEnter={() => setFocusIndex(i)}
                className={`block w-full px-3 py-1.5 text-left text-xs text-ink-1 transition ${
                  focusIndex === i ? "bg-paper-2" : "hover:bg-paper-2"
                }`}
              >
                <span className="block truncate font-medium">
                  {s.display_name.split(",")[0]}
                </span>
                <span className="block truncate font-mono text-[10px] text-ink-4">
                  {s.display_name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {geo && value === geo.display_name && (
        <span
          className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] uppercase tracking-wider text-good"
          title="Geo-Koordinaten hinterlegt"
          aria-hidden
        >
          ✓ geo
        </span>
      )}
    </div>
  );
}
