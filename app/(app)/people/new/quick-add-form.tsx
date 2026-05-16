"use client";

// Quick-Add-Form (V3-Erweiterung).
//
// Pflicht: Name. Alles andere optional.
// Voice-Capture vorne: sprich/tippe → /api/extract → Form wird vorbefüllt.
// Controlled inputs damit die VoiceCapture-Übernahme funktioniert.

import Link from "next/link";
import { useRef, useState } from "react";
import { APP_CONFIG } from "@/lib/config";
import {
  DEPTH_LABELS,
  PURPOSE_LABELS,
  type Depth,
  type LocationGeo,
  type Purpose,
} from "@/lib/types";
import { StickySaveBar } from "@/components/sticky-save-bar";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import {
  DraftClusterEditor,
  emptyDraftClusterState,
  type DraftClusterState,
} from "@/components/draft-cluster-editor";
import type { CircleRow } from "@/lib/types";
import { createPersonQuick } from "./quick-add-actions";
import { VoiceCapture, type VoiceExtractedFields } from "./voice-capture";
import { PhoneInput } from "@/components/phone-input";

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

interface FormState {
  name: string;
  how_we_met: string;
  purpose: Purpose | "";
  depth: Depth | "auto";
  company: string;
  role: string;
  phone: string;
  email: string;
  linkedin_url: string;
  website: string;
  met_date: string;
  met_location: string;
  met_location_geo: LocationGeo | null;
  current_location: string;
  current_location_geo: LocationGeo | null;
  home_location: string;
  home_location_geo: LocationGeo | null;
  notes: string;
  birthday: string;
  photo_url: string;
}

const empty: FormState = {
  name: "",
  how_we_met: "",
  purpose: "",
  depth: "auto",
  company: "",
  role: "",
  phone: "",
  email: "",
  linkedin_url: "",
  website: "",
  met_date: "",
  met_location: "",
  met_location_geo: null,
  current_location: "",
  current_location_geo: null,
  home_location: "",
  home_location_geo: null,
  notes: "",
  birthday: "",
  photo_url: "",
};

export function QuickAddForm({
  error,
  existingCircles = [],
}: {
  error?: string;
  existingCircles?: CircleRow[];
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [state, setState] = useState<FormState>(empty);
  const [cluster, setCluster] = useState<DraftClusterState>(
    emptyDraftClusterState(),
  );

  function applyVoice(fields: VoiceExtractedFields) {
    setState((prev) => ({
      ...prev,
      name: fields.name ?? prev.name,
      company: fields.company ?? prev.company,
      role: fields.role ?? prev.role,
      phone: fields.phone ?? prev.phone,
      email: fields.email ?? prev.email,
      linkedin_url: fields.linkedin_url ?? prev.linkedin_url,
      website: fields.website ?? prev.website,
      notes: fields.notes ?? prev.notes,
      birthday: fields.birthday ?? prev.birthday,
      current_location: fields.current_location ?? prev.current_location,
      how_we_met: fields.how_we_met ?? prev.how_we_met,
      met_date: fields.met_date ?? prev.met_date,
      met_location: fields.met_location ?? prev.met_location,
    }));
    // Voice-extracted tags → default-Cluster „interests". Dedupe gegen
    // bestehenden Cluster-State.
    if (fields.tags) {
      const incoming = fields.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (incoming.length > 0) {
        setCluster((prev) => {
          const existing = new Set(
            prev.tags.interests.map((t) => t.toLowerCase()),
          );
          const merged = [...prev.tags.interests];
          for (const t of incoming) {
            if (!existing.has(t.toLowerCase())) merged.push(t);
          }
          return {
            ...prev,
            tags: { ...prev.tags, interests: merged.slice(0, 7) },
          };
        });
      }
    }
    // Wenn Voice was geliefert hat, klappt das Advanced-Toggle auf damit
    // der Nutzer alle Felder sieht.
    setAdvancedOpen(true);
  }

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-6">
      <VoiceCapture onApply={applyVoice} />

      <form ref={formRef} action={createPersonQuick} className="space-y-8">
        <StickySaveBar formRef={formRef} cancelHref="/people" />

        {/* Hidden inputs für state das nicht direkt auf input-Elementen liegt */}
        <input type="hidden" name="purpose" value={state.purpose} />
        <input type="hidden" name="depth" value={state.depth} />

        {/* — Pflichtfeld: Name — */}
        <Field label="Name" required>
          <input
            name="name"
            type="text"
            required
            autoFocus
            autoComplete="name"
            placeholder="Vor- und Nachname"
            value={state.name}
            onChange={(e) => patch("name", e.target.value)}
            className={inputClass}
          />
        </Field>

        {/* — Purpose — */}
        <Field label="Purpose" hint="Wo gehört diese Person in dein Leben?">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.keys(PURPOSE_LABELS) as Purpose[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => patch("purpose", p)}
                className={`rounded border px-3 py-2 text-left transition ${
                  state.purpose === p
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

        {/* — Depth — */}
        <Field
          label="Depth"
          hint={`„AI entscheidet" wenn du es nicht weißt — ${APP_CONFIG.PUBLIC_NAME} berechnet aus Interaktionen.`}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => patch("depth", "auto")}
              className={`rounded border px-3 py-2 text-left transition ${
                state.depth === "auto"
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
                onClick={() => patch("depth", d)}
                className={`rounded border px-3 py-2 text-left transition ${
                  state.depth === d
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

        {/* — Tags + Leidenschaften + Kreise (V3 Cluster-Editor) — */}
        <DraftClusterEditor
          state={cluster}
          onChange={setCluster}
          existingCircles={existingCircles}
        />
        <input
          type="hidden"
          name="cluster_state"
          value={JSON.stringify(cluster)}
        />

        {/* — Wie wir uns kennengelernt haben (Goldfeld) — nach den
            Kreisen damit Patrick erst den groben Kontext (Cluster,
            Passions, Kreise) setzt und dann die persönliche Story dazu. */}
        <Field
          label="Wie wir uns kennengelernt haben"
          hint={`Optional. 1-3 Sätze: Ort, Anlass, gemeinsame Bekannte. ${APP_CONFIG.PUBLIC_NAME} extrahiert daraus später Details.`}
        >
          <textarea
            name="how_we_met"
            rows={3}
            placeholder={`z.B. "Auf der Bauma 2024 in München kennengelernt, über Max. Wir saßen am Abendessen am selben Tisch."`}
            value={state.how_we_met}
            onChange={(e) => patch("how_we_met", e.target.value)}
            className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
          />
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
            <SectionLabel>Beruf</SectionLabel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Firma">
                <input
                  name="company"
                  type="text"
                  placeholder="z.B. Siemens"
                  value={state.company}
                  onChange={(e) => patch("company", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Rolle">
                <input
                  name="role"
                  type="text"
                  placeholder="z.B. Head of Sales"
                  value={state.role}
                  onChange={(e) => patch("role", e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            <SectionLabel>Kontakt</SectionLabel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Telefon">
                <PhoneInput
                  value={state.phone}
                  onChange={(v) => patch("phone", v)}
                  inputClassName={inputClass}
                />
                {/* Hidden mirror damit das bestehende form-action den
                    Wert per FormData mitschickt — der server-action
                    erwartet ein name="phone"-Feld. */}
                <input type="hidden" name="phone" value={state.phone} />
              </Field>
              <Field label="Email">
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@…"
                  value={state.email}
                  onChange={(e) => patch("email", e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="LinkedIn">
                <input
                  name="linkedin_url"
                  type="text"
                  placeholder="linkedin.com/in/… oder @handle"
                  value={state.linkedin_url}
                  onChange={(e) => patch("linkedin_url", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Website">
                <input
                  name="website"
                  type="text"
                  placeholder="https://…"
                  value={state.website}
                  onChange={(e) => patch("website", e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            <SectionLabel>Über</SectionLabel>
            <Field label="Notizen">
              <textarea
                name="notes"
                rows={3}
                placeholder="Frei. Beobachtungen, Hintergrund, alles was woanders nicht passt."
                value={state.notes}
                onChange={(e) => patch("notes", e.target.value)}
                className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
              />
            </Field>

            <SectionLabel>Treffen</SectionLabel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Datum des Treffens">
                <input
                  name="met_date"
                  type="date"
                  value={state.met_date}
                  onChange={(e) => patch("met_date", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Ort des Treffens">
                <LocationAutocomplete
                  name="met_location"
                  defaultValue={state.met_location}
                  defaultGeo={state.met_location_geo}
                  placeholder="z.B. München, Bauma 2024"
                  className={inputClass}
                  onChange={(value, geo) => {
                    patch("met_location", value);
                    patch("met_location_geo", geo);
                  }}
                />
              </Field>
            </div>

            <SectionLabel>Wohnen + Herkunft</SectionLabel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Aktueller Wohnort">
                <LocationAutocomplete
                  name="current_location"
                  defaultValue={state.current_location}
                  defaultGeo={state.current_location_geo}
                  placeholder="z.B. Berlin, Schwabing"
                  className={inputClass}
                  onChange={(value, geo) => {
                    patch("current_location", value);
                    patch("current_location_geo", geo);
                  }}
                />
              </Field>
              <Field label="Heimat / Herkunft">
                <LocationAutocomplete
                  name="home_location"
                  defaultValue={state.home_location}
                  defaultGeo={state.home_location_geo}
                  placeholder="z.B. Hamburg"
                  className={inputClass}
                  onChange={(value, geo) => {
                    patch("home_location", value);
                    patch("home_location_geo", geo);
                  }}
                />
              </Field>
            </div>

            <SectionLabel>Persönliches</SectionLabel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Geburtstag">
                <input
                  name="birthday"
                  type="date"
                  value={state.birthday}
                  onChange={(e) => patch("birthday", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Foto-URL">
                <input
                  name="photo_url"
                  type="url"
                  placeholder="https://…"
                  value={state.photo_url}
                  onChange={(e) => patch("photo_url", e.target.value)}
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
    </div>
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-label border-b border-rule-soft pb-1 text-ink-2">
      {children}
    </p>
  );
}
