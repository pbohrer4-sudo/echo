"use client";

// Edit-Form für alle scalar + Cluster-Felder einer Person. Multi-Row-
// Daten (phones/emails/multiple Geos/Relationships/Reminders/Todos)
// bleiben den Inline-Buttons auf der Detail-Seite vorbehalten —
// hier wäre's sonst zu schwergewichtig.
//
// Voice-Capture-Block am Top: gleiches Pattern wie bei /people/new.
// Form-State ist komplett controlled damit Voice-Übernahme + Cluster-
// Editor sauber funktionieren.

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  DEPTH_LABELS,
  LANGUAGES,
  MODE_LABELS,
  PURPOSE_LABELS,
  type AddressEntry,
  type CircleRow,
  type Depth,
  type ImportantDate,
  type Mode,
  type PassionRow,
  type Person,
  type PersonContact,
  type Purpose,
  type TagCluster,
  type TagWithNote,
} from "@/lib/types";
import {
  parseFieldValues,
  type CustomFieldDef,
  type CustomFieldValues,
} from "@/lib/custom-fields";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import {
  DraftClusterEditor,
  type DraftClusterState,
} from "@/components/draft-cluster-editor";
import { VoiceCapture, type VoiceExtractedFields } from "@/app/(app)/people/new/voice-capture";
import { StickySaveBar } from "@/components/sticky-save-bar";
import {
  AddressesRepeater,
  ContactsRepeater,
  DatesRepeater,
  type ContactDraft,
} from "./repeaters";
import { updatePerson } from "./actions";

const inputClass =
  "h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";

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
const MODE_HINTS: Record<Mode, string> = {
  active: "Regelmäßiger Kontakt",
  nurture: "Bewusst pflegen",
  cold: "Kalte Beziehung — wenig Wärme, distanziert",
  dormant: "Stiller — länger nicht gemeldet",
  reconnect: "Sollte ich wieder anpacken",
  archive: "Aus dem aktiven Blick",
};

interface Props {
  person: Person;
  tags: TagWithNote[];
  passions: PassionRow[];
  personCircles: CircleRow[];
  allCircles: CircleRow[];
  contacts: PersonContact[];
  fieldDefs: CustomFieldDef[];
  error?: string;
}

function buildInitialCluster(
  tags: TagWithNote[],
  passions: PassionRow[],
  personCircles: CircleRow[],
): DraftClusterState {
  const tagsByCluster: Record<TagCluster, string[]> = {
    reminders: [],
    interests: [],
    potential: [],
    origin: [],
  };
  for (const t of tags) tagsByCluster[t.cluster].push(t.name);
  return {
    tags: tagsByCluster,
    passions: passions.map((p) => p.name),
    circles: personCircles.map((c) => c.name),
  };
}

export function EditPersonForm({
  person,
  tags,
  passions,
  personCircles,
  allCircles,
  contacts,
  fieldDefs,
  error,
}: Props) {
  const [name, setName] = useState(person.name);
  const [company, setCompany] = useState(person.company ?? "");
  const [role, setRole] = useState(person.role ?? "");
  const [notes, setNotes] = useState(person.notes ?? "");
  const [photoUrl, setPhotoUrl] = useState(person.photo_url ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(person.linkedin_url ?? "");
  const [howWeMet, setHowWeMet] = useState(person.how_we_met ?? "");
  const [giftIdea, setGiftIdea] = useState(person.gift_idea ?? "");
  const [metDate, setMetDate] = useState(person.met_date ?? "");
  const [introducedBy, setIntroducedBy] = useState(person.introduced_by ?? "");
  const [metWith, setMetWith] = useState(person.met_with ?? "");
  const [synergies, setSynergies] = useState<string[]>(person.synergies ?? []);
  const [primaryLanguage, setPrimaryLanguage] = useState(
    person.primary_language ?? "",
  );
  const [secondaryLanguage, setSecondaryLanguage] = useState(
    person.secondary_language ?? "",
  );
  const [purpose, setPurpose] = useState<Purpose | "">(person.purpose ?? "");
  const [depth, setDepth] = useState<Depth | "auto">(
    person.depth ?? "auto",
  );
  const [mode, setMode] = useState<Mode>(person.mode);
  const [cadenceDays, setCadenceDays] = useState<string>(
    person.cadence_days != null ? String(person.cadence_days) : "",
  );
  // Custom-field values keyed by def id. Stored as strings in form state;
  // coerced to the def's type server-side on save.
  const [customValues, setCustomValues] = useState<CustomFieldValues>(() =>
    parseFieldValues(person.custom_field_values),
  );
  function setCustom(id: string, value: string | boolean) {
    setCustomValues((prev) => ({ ...prev, [id]: value }));
  }

  const initialCluster = useMemo(
    () => buildInitialCluster(tags, passions, personCircles),
    [tags, passions, personCircles],
  );
  const [cluster, setCluster] = useState<DraftClusterState>(initialCluster);

  // Multi-Row-Listen für Kontakte / Adressen / Daten.
  const [contactList, setContactList] = useState<ContactDraft[]>(
    contacts.map((c) => ({
      id: c.id,
      channel: c.channel,
      subtype: c.subtype ?? "",
      value: c.value,
      is_primary: c.is_primary,
    })),
  );
  const [addressList, setAddressList] = useState<AddressEntry[]>(
    person.addresses ?? [],
  );
  const [dateList, setDateList] = useState<ImportantDate[]>(
    person.important_dates ?? [],
  );

  const [voiceHint, setVoiceHint] = useState<string | null>(null);

  function applyVoice(fields: VoiceExtractedFields) {
    if (fields.name) setName(fields.name);
    if (fields.company) setCompany(fields.company);
    if (fields.role) setRole(fields.role);
    if (fields.linkedin_url) setLinkedinUrl(fields.linkedin_url);
    if (fields.notes) setNotes(fields.notes);
    if (fields.how_we_met) setHowWeMet(fields.how_we_met);
    if (fields.met_date) setMetDate(fields.met_date);

    // Hint zusammenbauen aus detected-extras die nicht direkt im
    // Edit-Form gepflegt werden (Beziehungen, neu angelegte Personen).
    const hints: string[] = [];
    if (fields.detected_relationships?.length) {
      const rels = fields.detected_relationships
        .map((r) => `${r.label} → ${r.name}`)
        .join(", ");
      hints.push(`Beziehung erkannt: ${rels}. Auf Detail-Seite via +Beziehung anlegen.`);
    }
    if (fields.detected_new_people?.length) {
      const names = fields.detected_new_people.join(", ");
      hints.push(`Neue Person(en) im Kontext: ${names}. Separat anlegen.`);
    }
    setVoiceHint(hints.length > 0 ? hints.join(" · ") : null);
    // Voice-Phone/Email/LinkedIn an Contact-Liste anhängen wenn noch nicht da.
    const additions: ContactDraft[] = [];
    if (fields.phone) {
      const exists = contactList.some(
        (c) => c.channel === "phone" && c.value === fields.phone,
      );
      if (!exists) {
        additions.push({
          channel: "phone",
          subtype: "mobile",
          value: fields.phone,
          is_primary: !contactList.some((c) => c.channel === "phone"),
        });
      }
    }
    if (fields.email) {
      const exists = contactList.some(
        (c) => c.channel === "email" && c.value === fields.email,
      );
      if (!exists) {
        additions.push({
          channel: "email",
          subtype: "persönlich",
          value: fields.email,
          is_primary: !contactList.some((c) => c.channel === "email"),
        });
      }
    }
    if (fields.linkedin_url) {
      const exists = contactList.some(
        (c) => c.channel === "linkedin" && c.value === fields.linkedin_url,
      );
      if (!exists) {
        additions.push({
          channel: "linkedin",
          subtype: "",
          value: fields.linkedin_url,
          is_primary: !contactList.some((c) => c.channel === "linkedin"),
        });
      }
    }
    if (fields.website) {
      const exists = contactList.some(
        (c) => c.channel === "website" && c.value === fields.website,
      );
      if (!exists) {
        additions.push({
          channel: "website",
          subtype: "",
          value: fields.website,
          is_primary: !contactList.some((c) => c.channel === "website"),
        });
      }
    }
    if (additions.length > 0) {
      setContactList((prev) => [...prev, ...additions]);
    }
    // Geburtstag an Date-Liste anhängen wenn noch nicht da.
    if (fields.birthday) {
      const has = dateList.some(
        (d) => d.label.toLowerCase().includes("geburt") && d.date === fields.birthday,
      );
      if (!has) {
        setDateList((prev) => [
          ...prev,
          { label: "Geburtstag", date: fields.birthday!, remind: true },
        ]);
      }
    }
    // Voice-extracted Tags → in interests-Cluster mergen (Default).
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
  }

  const action = updatePerson.bind(null, person.id);
  const formRef = useRef<HTMLFormElement | null>(null);

  return (
    <div className="space-y-6">
      <VoiceCapture onApply={applyVoice} />
      {voiceHint && (
        <p className="rounded border border-action/30 bg-action-soft px-3 py-2 text-[11px] text-action">
          {voiceHint}
        </p>
      )}

      <StickySaveBar
        formRef={formRef}
        cancelHref={`/people/${person.id}`}
      />

      <form ref={formRef} action={action} className="space-y-6">
        <Field label="Name" required>
          <input
            type="text"
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Firma">
            <input
              type="text"
              name="company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Rolle">
            <input
              type="text"
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="LinkedIn">
            <input
              type="text"
              name="linkedin_url"
              placeholder="linkedin.com/in/…"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Foto-URL">
            <input
              type="url"
              name="photo_url"
              placeholder="https://…"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {/* — Purpose — */}
        <input type="hidden" name="purpose" value={purpose} />
        <Field label="Purpose" hint="Wo gehört diese Person in dein Leben?">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.keys(PURPOSE_LABELS) as Purpose[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPurpose(p === purpose ? "" : p)}
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

        {/* — Depth — */}
        <input type="hidden" name="depth" value={depth} />
        <Field
          label="Depth"
          hint="AI entscheidet wenn unklar — berechnet aus Interaktionen."
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

        {/* — Modus — */}
        <input type="hidden" name="mode" value={mode} />
        <Field label="Mode" hint="In welchem Zustand ist die Beziehung gerade?">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded border px-3 py-2 text-left transition ${
                  mode === m
                    ? "border-action bg-action-soft"
                    : "border-rule bg-paper hover:border-action/40 hover:bg-paper-2"
                }`}
              >
                <span className="block text-sm font-medium text-ink-1">
                  {MODE_LABELS[m]}
                </span>
                <span className="block text-[11px] text-ink-3">
                  {MODE_HINTS[m]}
                </span>
              </button>
            ))}
          </div>
        </Field>

        {/* — Cluster: Tags / Leidenschaften / Kreise — */}
        <DraftClusterEditor
          state={cluster}
          onChange={setCluster}
          existingCircles={allCircles}
        />
        <input
          type="hidden"
          name="cluster_state"
          value={JSON.stringify(cluster)}
        />

        {/* — Origin: wie/wo/wann/durch-wen/mit-wem kennengelernt.
            Eine zusammenhängende Sektion statt verstreuter Felder. — */}
        <section className="space-y-3">
          <div className="section-head">
            <span className="t-label">Origin</span>
            <span className="rule" />
          </div>
          <Field label="Wie kennengelernt">
            <textarea
              name="how_we_met"
              rows={2}
              value={howWeMet}
              onChange={(e) => setHowWeMet(e.target.value)}
              placeholder="Kurz: Kontext / Anlass des ersten Treffens"
              className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Wo getroffen">
              <LocationAutocomplete
                name="met_location"
                defaultValue={person.met_location ?? ""}
                defaultGeo={person.met_location_geo}
                className={inputClass}
              />
            </Field>
            <Field
              label="Wann getroffen"
              hint={
                !metDate && person.created_at
                  ? `Kein Datum — Kontakt angelegt am ${new Date(person.created_at).toLocaleDateString("de-DE")}.`
                  : undefined
              }
            >
              <input
                type="date"
                name="met_date"
                value={metDate}
                onChange={(e) => setMetDate(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Vermittelt durch">
              <input
                type="text"
                name="introduced_by"
                value={introducedBy}
                onChange={(e) => setIntroducedBy(e.target.value)}
                placeholder="Name der Person, die vermittelt hat"
                className={inputClass}
              />
            </Field>
            <Field label="Zusammen getroffen mit">
              <input
                type="text"
                name="met_with"
                value={metWith}
                onChange={(e) => setMetWith(e.target.value)}
                placeholder="Wer war noch dabei?"
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        {/* — Sprache — */}
        <section className="space-y-3">
          <div className="section-head">
            <span className="t-label">Sprache</span>
            <span className="rule" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Hauptsprache">
              <select
                name="primary_language"
                value={primaryLanguage}
                onChange={(e) => setPrimaryLanguage(e.target.value)}
                className={inputClass}
              >
                <option value="">Bitte wählen</option>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Zweitsprache (optional)">
              <select
                name="secondary_language"
                value={secondaryLanguage}
                onChange={(e) => setSecondaryLanguage(e.target.value)}
                className={inputClass}
              >
                <option value="">—</option>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        {/* — Synergien: Freitext-Punkte (keine Tags, kein Limit). — */}
        <section className="space-y-3">
          <input
            type="hidden"
            name="synergies"
            value={JSON.stringify(synergies)}
          />
          <div className="section-head">
            <span className="t-label">Synergien</span>
            <span className="rule" />
          </div>
          <p className="text-xs text-ink-4">
            Konkrete Potenziale — ganze Sätze erlaubt, kein Limit. Jeder
            Eintrag ist durchsuchbar.
          </p>
          <div className="space-y-2">
            {synergies.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <textarea
                  value={s}
                  onChange={(e) => {
                    const next = [...synergies];
                    next[i] = e.target.value;
                    setSynergies(next);
                  }}
                  rows={2}
                  className="flex-1 rounded border border-rule bg-paper px-3 py-1.5 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
                />
                <button
                  type="button"
                  onClick={() =>
                    setSynergies(synergies.filter((_, j) => j !== i))
                  }
                  aria-label={`Synergie ${i + 1} entfernen`}
                  className="mt-1 grid h-6 w-6 place-items-center rounded text-ink-3 transition hover:bg-bad/10 hover:text-bad"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSynergies([...synergies, ""])}
              className="inline-flex h-8 items-center rounded border border-dashed border-rule px-3 text-sm text-ink-3 transition hover:border-action hover:text-action"
            >
              + Synergie hinzufügen
            </button>
          </div>
        </section>

        {/* — Gifts: was man dieser Person zum nächsten Anlass schenken könnte. */}
        <Field label="Gifts">
          <input
            type="text"
            name="gift_idea"
            value={giftIdea}
            onChange={(e) => setGiftIdea(e.target.value)}
            placeholder="z. B. Whisky, Pflanze, Buch über …"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Aktueller Wohnort">
            <LocationAutocomplete
              name="current_location"
              defaultValue={person.current_location ?? ""}
              defaultGeo={person.current_location_geo}
              className={inputClass}
            />
          </Field>
          <Field label="Heimat / Herkunft">
            <LocationAutocomplete
              name="home_location"
              defaultValue={person.home_location ?? ""}
              defaultGeo={person.home_location_geo}
              className={inputClass}
            />
          </Field>
        </div>

        <Field
          label="Cadence (Tage)"
          hint="Wie oft soll Kontakt sein? Leer = AI rechnet."
        >
          <input
            type="number"
            name="cadence_days"
            min={1}
            max={365}
            placeholder="z.B. 30"
            value={cadenceDays}
            onChange={(e) => setCadenceDays(e.target.value)}
            className={inputClass}
          />
        </Field>

        {/* — Kontakte (alle person_contacts in einer Liste) — */}
        <section className="space-y-3">
          <div className="section-head">
            <span className="t-label">Kontakte</span>
            <span className="rule" />
          </div>
          <ContactsRepeater
            contacts={contactList}
            onChange={setContactList}
          />
          <input
            type="hidden"
            name="contacts_state"
            value={JSON.stringify(contactList)}
          />
        </section>

        {/* — Wichtige Daten (mehrere Einträge) — */}
        <section className="space-y-3">
          <div className="section-head">
            <span className="t-label">Wichtige Daten</span>
            <span className="rule" />
          </div>
          <DatesRepeater dates={dateList} onChange={setDateList} />
          <input
            type="hidden"
            name="dates_state"
            value={JSON.stringify(dateList)}
          />
        </section>

        {/* — Adressen (mehrere Einträge) — */}
        <section className="space-y-3">
          <div className="section-head">
            <span className="t-label">Adressen</span>
            <span className="rule" />
          </div>
          <AddressesRepeater
            addresses={addressList}
            onChange={setAddressList}
          />
          <input
            type="hidden"
            name="addresses_state"
            value={JSON.stringify(addressList)}
          />
        </section>

        {fieldDefs.length > 0 && (
          <section className="space-y-3">
            <input
              type="hidden"
              name="custom_field_values"
              value={JSON.stringify(customValues)}
            />
            <p className="t-label">Eigene Felder</p>
            <div className="space-y-3">
              {fieldDefs.map((def) => {
                const v = customValues[def.id];
                if (def.type === "checkbox") {
                  return (
                    <label
                      key={def.id}
                      className="flex items-center gap-2 text-sm text-ink-1"
                    >
                      <input
                        type="checkbox"
                        checked={v === true}
                        onChange={(e) => setCustom(def.id, e.target.checked)}
                        className="h-4 w-4 rounded border-rule"
                      />
                      {def.label}
                    </label>
                  );
                }
                return (
                  <Field key={def.id} label={def.label}>
                    {def.type === "textarea" ? (
                      <textarea
                        rows={3}
                        value={typeof v === "string" ? v : ""}
                        onChange={(e) => setCustom(def.id, e.target.value)}
                        className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
                      />
                    ) : def.type === "dropdown" ? (
                      <select
                        value={typeof v === "string" ? v : ""}
                        onChange={(e) => setCustom(def.id, e.target.value)}
                        className={inputClass}
                      >
                        <option value="">—</option>
                        {(def.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={
                          def.type === "number"
                            ? "number"
                            : def.type === "date"
                              ? "date"
                              : "text"
                        }
                        value={
                          v === null || v === undefined ? "" : String(v)
                        }
                        onChange={(e) => setCustom(def.id, e.target.value)}
                        className={inputClass}
                      />
                    )}
                  </Field>
                );
              })}
            </div>
          </section>
        )}

        <Field label="Notizen">
          <textarea
            name="notes"
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
          />
        </Field>

        {error && (
          <p className="rounded border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
            Fehler: {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href={`/people/${person.id}`}
            className="rounded border border-rule px-4 py-2 text-sm text-ink-2 transition hover:border-ink-3 hover:text-ink-1"
          >
            Abbrechen
          </Link>
          <button
            type="submit"
            className="rounded border border-action bg-action px-4 py-2 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
          >
            Speichern
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
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
