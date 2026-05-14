"use client";

// Multi-Row-Editoren für die Edit-Form. Pro Sektion eine Repeater-
// Komponente die ein Array verwaltet, Add/Remove-Buttons rendert und
// Felder controlled hält. Die Form-State sammelt die Listen als JSON
// in hidden Inputs, der Server reconciled.

import {
  ADDRESS_LABELS,
  CONTACT_CHANNELS,
  CONTACT_CHANNEL_LABELS,
  DATE_LABELS,
  type AddressEntry,
  type ContactChannel,
  type ImportantDate,
} from "@/lib/types";
import { PhoneInput } from "@/components/phone-input";

const inputClass =
  "h-9 w-full rounded border border-rule bg-paper px-2 text-xs text-ink-1 outline-none focus:border-action focus:ring-2 focus:ring-action/20";

// ───────────── Contacts ─────────────

export interface ContactDraft {
  // id ist nur gesetzt wenn es ein existierender DB-Eintrag ist.
  // Wir nutzen das fürs „is_primary"-Tracking; beim Submit wird sowieso
  // replace-all gemacht.
  id?: string;
  channel: ContactChannel;
  subtype: string;
  value: string;
  is_primary: boolean;
}

export function ContactsRepeater({
  contacts,
  onChange,
}: {
  contacts: ContactDraft[];
  onChange: (next: ContactDraft[]) => void;
}) {
  function update(i: number, patch: Partial<ContactDraft>) {
    onChange(
      contacts.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    );
  }
  function remove(i: number) {
    onChange(contacts.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([
      ...contacts,
      { channel: "phone", subtype: "mobile", value: "", is_primary: false },
    ]);
  }
  function setPrimary(i: number) {
    const target = contacts[i];
    onChange(
      contacts.map((c, idx) => ({
        ...c,
        is_primary:
          idx === i ? true : c.channel === target.channel ? false : c.is_primary,
      })),
    );
  }

  return (
    <div className="space-y-2">
      {contacts.length === 0 && (
        <p className="text-[11px] italic text-ink-4">
          Keine Kontakte hinterlegt.
        </p>
      )}
      {contacts.map((c, i) => (
        <div
          key={i}
          className="grid grid-cols-[110px_minmax(0,1fr)_100px_auto] gap-2 items-center"
        >
          <select
            value={c.channel}
            onChange={(e) =>
              update(i, { channel: e.target.value as ContactChannel })
            }
            className={inputClass}
          >
            {CONTACT_CHANNELS.map((ch) => (
              <option key={ch} value={ch}>
                {CONTACT_CHANNEL_LABELS[ch]}
              </option>
            ))}
          </select>
          {c.channel === "phone" ||
          c.channel === "whatsapp" ||
          c.channel === "sms" ? (
            <PhoneInput
              value={c.value}
              onChange={(v) => update(i, { value: v })}
              inputClassName={inputClass}
            />
          ) : (
            <input
              type="text"
              value={c.value}
              onChange={(e) => update(i, { value: e.target.value })}
              placeholder={placeholderFor(c.channel)}
              className={inputClass}
            />
          )}
          <input
            type="text"
            value={c.subtype}
            onChange={(e) => update(i, { subtype: e.target.value })}
            placeholder="Label"
            className={inputClass}
            title="Optionaler Sub-Typ z. B. mobile / privat / arbeit"
          />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPrimary(i)}
              title={c.is_primary ? "Primär" : "Als primär setzen"}
              className={`px-2 py-1 text-[10px] uppercase tracking-wider transition ${
                c.is_primary
                  ? "rounded border border-action bg-action-soft text-action"
                  : "rounded border border-rule text-ink-4 hover:border-action hover:text-action"
              }`}
            >
              {c.is_primary ? "★" : "☆"}
            </button>
            <button
              type="button"
              onClick={() => remove(i)}
              className="rounded border border-rule px-2 py-1 text-[10px] text-ink-3 transition hover:border-bad hover:text-bad"
              title="Entfernen"
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-full border border-dashed border-rule px-2.5 py-1 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
      >
        + Kontakt
      </button>
    </div>
  );
}

function placeholderFor(c: ContactChannel): string {
  switch (c) {
    case "phone":
    case "whatsapp":
    case "sms":
      return "+49 173 …";
    case "email":
      return "name@…";
    case "linkedin":
      return "linkedin.com/in/handle";
    case "website":
      return "https://…";
    case "telegram":
    case "signal":
    case "instagram":
    case "twitter":
    case "github":
    case "mastodon":
    case "bluesky":
    case "threads":
    case "tiktok":
      return "@handle";
    case "calendly":
      return "calendly.com/…";
    case "other":
      return "Wert";
  }
}

// ───────────── Dates ─────────────

export function DatesRepeater({
  dates,
  onChange,
}: {
  dates: ImportantDate[];
  onChange: (next: ImportantDate[]) => void;
}) {
  function update(i: number, patch: Partial<ImportantDate>) {
    onChange(dates.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function remove(i: number) {
    onChange(dates.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([
      ...dates,
      { label: "Geburtstag", date: "", remind: true, remind_lead_days: 7 },
    ]);
  }

  return (
    <div className="space-y-2">
      {dates.length === 0 && (
        <p className="text-[11px] italic text-ink-4">Keine Daten hinterlegt.</p>
      )}
      {dates.map((d, i) => {
        // Custom-Mode: wenn das Label nicht in der Preset-Liste steht
        // ODER explizit „andere" gewählt wurde, zeigen wir ein Text-
        // Input statt nur dem Dropdown.
        const isCustom =
          !DATE_LABELS.includes(d.label as (typeof DATE_LABELS)[number]) ||
          d.label === "andere";
        const dropdownValue = DATE_LABELS.includes(
          d.label as (typeof DATE_LABELS)[number],
        )
          ? d.label
          : "andere";
        return (
        <div
          key={i}
          className="grid grid-cols-[140px_minmax(0,150px)_minmax(0,1fr)_auto] gap-2 items-start"
        >
          <div className="space-y-1">
            <select
              value={dropdownValue}
              onChange={(e) => {
                const v = e.target.value;
                // Bei Wechsel auf „andere" Label leer lassen — User
                // tippt ihn unten ins Custom-Input. Bei Wechsel auf
                // einen Preset den Preset-Wert übernehmen.
                update(i, { label: v === "andere" ? "" : v });
              }}
              className={inputClass}
            >
              {DATE_LABELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            {isCustom && (
              <input
                type="text"
                value={d.label === "andere" ? "" : d.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="z.B. Kennenlern-Tag"
                className={inputClass}
              />
            )}
          </div>
          <input
            type="date"
            value={d.date}
            onChange={(e) => update(i, { date: e.target.value })}
            className={inputClass}
          />
          <label className="flex items-center gap-2 text-[11px] text-ink-2">
            <input
              type="checkbox"
              checked={d.remind}
              onChange={(e) => update(i, { remind: e.target.checked })}
            />
            Jährlich erinnern
          </label>
          <button
            type="button"
            onClick={() => remove(i)}
            className="rounded border border-rule px-2 py-1 text-[10px] text-ink-3 transition hover:border-bad hover:text-bad"
          >
            ×
          </button>
        </div>
        );
      })}
      <button
        type="button"
        onClick={add}
        className="rounded-full border border-dashed border-rule px-2.5 py-1 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
      >
        + Datum
      </button>
    </div>
  );
}

// ───────────── Addresses ─────────────

export function AddressesRepeater({
  addresses,
  onChange,
}: {
  addresses: AddressEntry[];
  onChange: (next: AddressEntry[]) => void;
}) {
  function update(i: number, patch: Partial<AddressEntry>) {
    onChange(
      addresses.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    );
  }
  function remove(i: number) {
    onChange(addresses.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([
      ...addresses,
      { label: "zuhause", street: "", city: "", postal_code: "", country: "" },
    ]);
  }

  return (
    <div className="space-y-2">
      {addresses.length === 0 && (
        <p className="text-[11px] italic text-ink-4">
          Keine Adressen hinterlegt.
        </p>
      )}
      {addresses.map((a, i) => (
        <div
          key={i}
          className="grid grid-cols-[110px_minmax(0,1fr)_auto] gap-2 items-start"
        >
          <select
            value={ADDRESS_LABELS.includes(
              a.label as (typeof ADDRESS_LABELS)[number],
            )
              ? a.label
              : "andere"}
            onChange={(e) => update(i, { label: e.target.value })}
            className={inputClass}
          >
            {ADDRESS_LABELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <div className="space-y-1">
            <input
              type="text"
              value={a.street ?? ""}
              onChange={(e) => update(i, { street: e.target.value })}
              placeholder="Straße + Nr."
              className={inputClass}
            />
            <div className="grid grid-cols-[90px_minmax(0,1fr)_110px] gap-1">
              <input
                type="text"
                value={a.postal_code ?? ""}
                onChange={(e) => update(i, { postal_code: e.target.value })}
                placeholder="PLZ"
                className={inputClass}
              />
              <input
                type="text"
                value={a.city ?? ""}
                onChange={(e) => update(i, { city: e.target.value })}
                placeholder="Stadt"
                className={inputClass}
              />
              <input
                type="text"
                value={a.country ?? ""}
                onChange={(e) => update(i, { country: e.target.value })}
                placeholder="Land"
                className={inputClass}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            className="rounded border border-rule px-2 py-1 text-[10px] text-ink-3 transition hover:border-bad hover:text-bad"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-full border border-dashed border-rule px-2.5 py-1 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
      >
        + Adresse
      </button>
    </div>
  );
}
