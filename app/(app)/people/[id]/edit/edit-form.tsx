"use client";

// Edit-Form für scalar Felder einer Person. Server-Action via bound
// updatePerson(personId, formData). LocationAutocomplete für die drei
// Location-Felder, sonst plain Inputs.

import Link from "next/link";
import { useState } from "react";
import type { Person } from "@/lib/types";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import { updatePerson } from "./actions";

const inputClass =
  "h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";

export function EditPersonForm({
  person,
  error,
}: {
  person: Person;
  error?: string;
}) {
  const [name, setName] = useState(person.name);
  const [company, setCompany] = useState(person.company ?? "");
  const [role, setRole] = useState(person.role ?? "");
  const [notes, setNotes] = useState(person.notes ?? "");
  const [photoUrl, setPhotoUrl] = useState(person.photo_url ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(person.linkedin_url ?? "");
  const [howWeMet, setHowWeMet] = useState(person.how_we_met ?? "");
  const [metDate, setMetDate] = useState(person.met_date ?? "");

  const action = updatePerson.bind(null, person.id);

  return (
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
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
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
    </label>
  );
}
