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
import { useMemo, useState } from "react";
import {
  DEPTH_LABELS,
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
import { LocationAutocomplete } from "@/components/location-autocomplete";
import {
  DraftClusterEditor,
  type DraftClusterState,
} from "@/components/draft-cluster-editor";
import { VoiceCapture, type VoiceExtractedFields } from "@/app/(app)/people/new/voice-capture";
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
  error,
}: Props) {
  const [name, setName] = useState(person.name);
  const [company, setCompany] = useState(person.company ?? "");
  const [role, setRole] = useState(person.role ?? "");
  const [notes, setNotes] = useState(person.notes ?? "");
  const [photoUrl, setPhotoUrl] = useState(person.photo_url ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(person.linkedin_url ?? "");
  const [howWeMet, setHowWeMet] = useState(person.how_we_met ?? "");
  const [metDate, setMetDate] = useState(person.met_date ?? "");
  const [purpose, setPurpose] = useState<Purpose | "">(person.purpose ?? "");
  const [depth, setDepth] = useState<Depth | "auto">(
    person.depth ?? "auto",
  );
  const [mode, setMode] = useState<Mode>(person.mode);
  const [cadenceDays, setCadenceDays] = useState<string>(
    person.cadence_days != null ? String(person.cadence_days) : "",
  );

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

  function applyVoice(fields: VoiceExtractedFields) {
    if (fields.name) setName(fields.name);
    if (fields.company) setCompany(fields.company);
    if (fields.role) setRole(fields.role);
    if (fields.linkedin_url) setLinkedinUrl(fields.linkedin_url);
    if (fields.notes) setNotes(fields.notes);
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

  return (
    <div className="space-y-6">
      <VoiceCapture onApply={applyVoice} />

      <form action={action} className="space-y-6">
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

        {/* — Zweck — */}
        <input type="hidden" name="purpose" value={purpose} />
        <Field label="Zweck" hint="Wo gehört diese Person in dein Leben?">
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

        {/* — Tiefe — */}
        <input type="hidden" name="depth" value={depth} />
        <Field
          label="Tiefe"
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
        <Field label="Modus" hint="In welchem Zustand ist die Beziehung gerade?">
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

        {/* — Wie wir uns kennengelernt haben — */}
        <Field label="Wie wir uns kennengelernt haben">
          <textarea
            name="how_we_met"
            rows={3}
            value={howWeMet}
            onChange={(e) => setHowWeMet(e.target.value)}
            className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Datum des Treffens">
            <input
              type="date"
              name="met_date"
              value={metDate}
              onChange={(e) => setMetDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Ort des Treffens">
            <LocationAutocomplete
              name="met_location"
              defaultValue={person.met_location ?? ""}
              defaultGeo={person.met_location_geo}
              className={inputClass}
            />
          </Field>
        </div>

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
