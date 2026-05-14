"use client";

// Geteiltes Telefon-Eingabefeld: separate Vorwahl (+CC) und Haupt-
// nummer, kombiniert beim onChange zu einem einzigen E.164-ähnlichen
// String "+49 173 1234567". Das matched das bisherige Storage-Format
// (PhoneEntry.value) — kein Schema-Change nötig.
//
// Parser ist tolerant: "00491731234567", "+491731234567", "0173 …",
// "49 173 …" — alles wird in {cc, rest} zerlegt, der Default für
// nackte 0xxx-Nummern ist "+49".

import { useEffect, useState } from "react";

interface Props {
  value: string;
  onChange: (next: string) => void;
  // Beide Inputs erben dieselbe Klassen-Liste; entspricht dem
  // gemeinsamen `inputClass` der Repeater/Forms damit die Höhe
  // konsistent bleibt.
  inputClassName?: string;
  placeholderNumber?: string;
  autoFocus?: boolean;
}

interface Parts {
  cc: string;
  rest: string;
}

const DEFAULT_CC = "+49";

export function parsePhone(raw: string | null | undefined): Parts {
  if (!raw) return { cc: DEFAULT_CC, rest: "" };
  let s = raw.trim();
  // 00-Prefix → +
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  // Explizites +CC (1–3 Ziffern) abtrennen
  const withPlus = s.match(/^\+(\d{1,3})[\s\-./()]*(.*)$/);
  if (withPlus) {
    return { cc: `+${withPlus[1]}`, rest: cleanRest(withPlus[2]) };
  }
  // Reine Ziffern ohne +: wenn es mit 0 anfängt, ist's typisch DE-lokal.
  // Den Rest dann mit DEFAULT_CC verheiraten und führende 0 droppen.
  if (/^0\d/.test(s)) {
    return { cc: DEFAULT_CC, rest: cleanRest(s.replace(/^0+/, "")) };
  }
  // Sonst: Rest behalten wie eingegeben, Default-CC oben.
  return { cc: DEFAULT_CC, rest: cleanRest(s) };
}

function cleanRest(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export function combinePhone(cc: string, rest: string): string {
  const ccTrim = cc.trim();
  const restTrim = rest.trim().replace(/^0+/, "");
  if (!restTrim) return "";
  const normalizedCc = ccTrim.startsWith("+")
    ? ccTrim
    : `+${ccTrim.replace(/[^\d]/g, "")}`;
  return `${normalizedCc} ${restTrim}`;
}

export function PhoneInput({
  value,
  onChange,
  inputClassName,
  placeholderNumber = "173 1234567",
  autoFocus,
}: Props) {
  const initial = parsePhone(value);
  const [cc, setCc] = useState(initial.cc);
  const [rest, setRest] = useState(initial.rest);

  // Wenn der parent-State sich extern ändert (z.B. Voice-Apply
  // schiebt Werte rein), die Inputs neu syncen. Wir vergleichen
  // gegen den re-parsed Wert damit wir uns nicht in Endlos-
  // Re-Renders verfangen wenn der parent unsere combine()-Ausgabe
  // 1:1 zurückspielt.
  useEffect(() => {
    const next = parsePhone(value);
    if (next.cc !== cc) setCc(next.cc);
    if (next.rest !== rest) setRest(next.rest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function emit(nextCc: string, nextRest: string) {
    onChange(combinePhone(nextCc, nextRest));
  }

  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-1">
      <input
        type="text"
        value={cc}
        onChange={(e) => {
          // Erzwinge "+" am Anfang, behalte sonst nur Ziffern.
          let v = e.target.value.trim();
          if (v.startsWith("+")) {
            v = `+${v.slice(1).replace(/[^\d]/g, "")}`;
          } else {
            v = `+${v.replace(/[^\d]/g, "")}`;
          }
          // Limit: maximal 3 Ziffern nach dem +.
          if (v.length > 4) v = v.slice(0, 4);
          setCc(v);
          emit(v, rest);
        }}
        placeholder="+49"
        title="Ländervorwahl, z.B. +49 (DE), +43 (AT), +41 (CH)"
        inputMode="tel"
        className={inputClassName}
      />
      <input
        type="tel"
        value={rest}
        onChange={(e) => {
          const v = e.target.value;
          setRest(v);
          emit(cc, v);
        }}
        placeholder={placeholderNumber}
        autoFocus={autoFocus}
        className={inputClassName}
      />
    </div>
  );
}
