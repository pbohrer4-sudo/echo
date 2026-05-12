"use client";

// Quick-Add-Form (Phase C2, Briefing 5.1).
//
// 4 Pflicht-Felder als Hero, 7 weitere im Advanced-Toggle.
// Ziel: in unter 30 Sekunden eine Person anlegen. Restdaten sammelt
// ECHO über die Zeit per Suggestions, oder Patrick füllt nach.

import Link from "next/link";
import { useRef, useState } from "react";
import {
  DEPTH_LABELS,
  PURPOSE_LABELS,
  type Depth,
  type Purpose,
} from "@/lib/types";
import { StickySaveBar } from "@/components/sticky-save-bar";
import { createPersonQuick } from "./quick-add-actions";

const PURPOSE_HINTS: Record<Purpose, string> = {
  personal: "Privater Kontakt",
  family: "Familie / fester Kreis",
  business_active: "Aktive Business-Beziehung",
  business_latent: "Business, aktuell ruhig",
  aspirational: "Möchte ich aktiv aufbauen",
};

const DEPTH_HINTS: Record<Depth, string> = {
  inner_5: "≥ 24 Interaktionen / Jahr",
  trusted_15: "≥ 12",
  active_50: "≥ 4",
  network_150: "≥ 2",
  periphery_500: "≥ 1",
};

const inputClass =
  "h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";

export function QuickAddForm({ error }: { error?: string }) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [purpose, setPurpose] = useState<Purpose | "">("");
  const [depth, setDepth] = useState<Depth | "auto">("auto");

  return (
    <form ref={formRef} action={createPersonQuick} className="space-y-8">
      <StickySaveBar formRef={formRef} cancelHref="/people" />

      {/* Hidden inputs für Radio-Group-State (HTML5 Radio in einem Form
          würde funktionieren, aber wir wollen Custom-Styling). */}
      <input type="hidden" name="purpose" value={purpose} />
      <input type="hidden" name="depth" value={depth} />

      {/* — Pflichtfeld 1: Name — */}
      <Field label="Name" required>
        <input
          name="name"
          type="text"
          required
          autoFocus
          autoComplete="name"
          placeholder="Vor- und Nachname"
          className={inputClass}
        />
      </Field>

      {/* — Pflichtfeld 2: Wie wir uns kennengelernt haben (Goldfeld) — */}
      <Field
        label="Wie wir uns kennengelernt haben"
        required
        hint="1-3 Sätze. Ort, Anlass, gemeinsame Bekannte. ECHO extrahiert daraus später Details."
      >
        <textarea
          name="how_we_met"
          required
          rows={3}
          placeholder="z.B. „Auf der Bauma 2024 in München kennengelernt, über Max. Wir saßen am Abendessen am selben Tisch."
          className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
        />
      </Field>

      {/* — Pflichtfeld 3: Zweck — */}
      <Field label="Zweck" required hint="Wo gehört diese Person in dein Leben?">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(Object.keys(PURPOSE_LABELS) as Purpose[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPurpose(p)}
              className={`rounded border px-3 py-2 text-left transition ${
                purpose === p
                  ? "border-action bg-action-soft"
                  : "border-rule bg-paper hover:border-action/40 hover:bg-paper-2"
              }`}
            >
              <span className="block text-sm font-medium text-ink-1">
                {PURPOSE_LABELS[p]}
              </span>
              <span className="block text-[11px] text-ink-3">
                {PURPOSE_HINTS[p]}
              </span>
            </button>
          ))}
        </div>
      </Field>

      {/* — Pflichtfeld 4: Tiefe — */}
      <Field
        label="Tiefe"
        required
        hint='„AI entscheidet" wenn du es nicht weißt — Echo berechnet aus Interaktionen.'
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setDepth("auto")}
            className={`rounded border px-3 py-2 text-left transition ${
              depth === "auto"
                ? "border-action bg-action-soft"
                : "border-dashed border-rule bg-paper hover:border-action/40"
            }`}
          >
            <span className="block text-sm font-medium text-ink-1">
              AI entscheidet
            </span>
            <span className="block text-[11px] text-ink-3">
              Aus Interaktions-Häufigkeit
            </span>
          </button>
          {(Object.keys(DEPTH_LABELS) as Depth[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDepth(d)}
              className={`rounded border px-3 py-2 text-left transition ${
                depth === d
                  ? "border-action bg-action-soft"
                  : "border-rule bg-paper hover:border-action/40 hover:bg-paper-2"
              }`}
            >
              <span className="block text-sm font-medium text-ink-1">
                {DEPTH_LABELS[d]}
              </span>
              <span className="block text-[11px] text-ink-3">
                {DEPTH_HINTS[d]}
              </span>
            </button>
          ))}
        </div>
      </Field>

      {/* — Advanced-Toggle — */}
      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="inline-flex items-center gap-2 text-xs text-ink-3 transition hover:text-action"
          aria-expanded={advancedOpen}
        >
          <span
            className={`inline-block transition ${
              advancedOpen ? "rotate-90" : ""
            }`}
            aria-hidden
          >
            ▶
          </span>
          {advancedOpen ? "Weniger Details" : "Mehr Details (optional)"}
        </button>
      </div>

      {advancedOpen && (
        <div className="space-y-5 rounded border border-rule-soft bg-paper-2 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Firma">
              <input
                name="company"
                type="text"
                placeholder="z.B. Siemens"
                className={inputClass}
              />
            </Field>
            <Field label="Rolle">
              <input
                name="role"
                type="text"
                placeholder="z.B. Head of Sales"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Telefon">
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+49 …"
                className={inputClass}
              />
            </Field>
            <Field label="Email">
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="name@…"
                className={inputClass}
              />
            </Field>
          </div>
          <Field
            label="Tags"
            hint="Komma-separiert. Max 7. Cluster (Kontext/Thema/Wert/Trigger) wird später re-klassifiziert."
          >
            <input
              name="tags"
              type="text"
              placeholder="z.B. tennis, münchen, kunde"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Datum des Treffens">
              <input
                name="met_date"
                type="date"
                className={inputClass}
              />
            </Field>
            <Field label="Ort des Treffens">
              <input
                name="met_location"
                type="text"
                placeholder="z.B. München, Bauma 2024"
                className={inputClass}
              />
            </Field>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
          Fehler: {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href="/people"
          className="rounded border border-rule px-4 py-2 text-sm text-ink-2 transition hover:border-ink-3 hover:text-ink-1"
        >
          Abbrechen
        </Link>
        <button
          type="submit"
          className="rounded border border-action bg-action px-4 py-2 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
        >
          Anlegen
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="t-label">
        {label}
        {required && <span className="ml-1 text-action">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-ink-4">{hint}</span>}
    </label>
  );
}
