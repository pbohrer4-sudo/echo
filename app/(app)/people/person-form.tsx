"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type {
  AddressEntry,
  EmailEntry,
  ImportantDate,
  Person,
  PhoneEntry,
  RelationshipEntry,
  Scope,
  SocialEntry,
} from "@/lib/types";
import {
  ADDRESS_LABELS,
  DATE_LABELS,
  EMAIL_LABELS,
  PHONE_LABELS,
  RELATIONSHIP_LABELS,
  REMIND_LEAD_OPTIONS,
  SOCIAL_PLATFORMS,
} from "@/lib/types";
import { StrengthMeterInput } from "@/components/strength-meter";
import { AddressAutocomplete } from "@/components/address-autocomplete";

interface PersonOption {
  id: string;
  name: string;
}

type Action = (formData: FormData) => void | Promise<void>;

const TAG_DATALIST_ID = "echo-tag-suggestions";

const inputClass =
  "h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";
const selectClass =
  "h-9 rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";

export function PersonForm({
  initial,
  action,
  cancelHref,
  error,
  peopleOptions,
  existingTags = [],
  existingOrgs = [],
}: {
  initial?: Partial<Person>;
  action: Action;
  cancelHref: string;
  error?: string;
  peopleOptions: PersonOption[];
  existingTags?: string[];
  existingOrgs?: string[];
}) {
  const [scope, setScope] = useState<Scope>(initial?.scope ?? "both");
  const [phones, setPhones] = useState<PhoneEntry[]>(
    initial?.phones?.length
      ? initial.phones
      : initial?.phone
        ? [{ label: "mobile", value: initial.phone }]
        : [],
  );
  const [emails, setEmails] = useState<EmailEntry[]>(
    initial?.emails?.length
      ? initial.emails
      : initial?.email
        ? [{ label: "persönlich", value: initial.email }]
        : [],
  );
  const [addresses, setAddresses] = useState<AddressEntry[]>(
    initial?.addresses ?? [],
  );
  const [socials, setSocials] = useState<SocialEntry[]>(
    initial?.socials ?? [],
  );
  const [importantDates, setImportantDates] = useState<ImportantDate[]>(
    initial?.important_dates?.length
      ? initial.important_dates
      : initial?.birthday
        ? [{ label: "Geburtstag", date: initial.birthday, remind: true }]
        : [],
  );
  const [relationships, setRelationships] = useState<RelationshipEntry[]>(
    initial?.relationships ?? [],
  );
  const [avatarUrl, setAvatarUrl] = useState<string>(
    initial?.avatar_url ?? "",
  );
  const [notes, setNotes] = useState<string>(initial?.notes ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState("");

  const [name, setName] = useState<string>(initial?.name ?? "");
  const [company, setCompany] = useState<string>(initial?.company ?? "");
  const [role, setRole] = useState<string>(initial?.role ?? "");
  const [strength, setStrength] = useState<number>(
    initial?.strength_score ?? 0,
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSummary, setScanSummary] = useState<string | null>(null);

  async function handleScanFile(file: File) {
    setScanning(true);
    setScanError(null);
    setScanSummary(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/scan-business-card", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Scan ${res.status}`);
      }
      const { data } = (await res.json()) as {
        data: {
          name: string | null;
          company: string | null;
          role: string | null;
          phones: { label: string; value: string }[];
          emails: { label: string; value: string }[];
          addresses: AddressEntry[];
          socials: SocialEntry[];
        };
      };

      const summary: string[] = [];
      if (data.name) {
        setName(data.name);
        summary.push("Name");
      }
      if (data.company) {
        setCompany(data.company);
        summary.push("Firma");
      }
      if (data.role) {
        setRole(data.role);
        summary.push("Rolle");
      }
      if (data.phones.length) {
        setPhones((prev) => mergeUnique(prev, data.phones, (a, b) => a.value === b.value));
        summary.push(`${data.phones.length} Telefon`);
      }
      if (data.emails.length) {
        setEmails((prev) => mergeUnique(prev, data.emails, (a, b) => a.value === b.value));
        summary.push(`${data.emails.length} Email`);
      }
      if (data.addresses.length) {
        setAddresses((prev) => [...prev, ...data.addresses]);
        summary.push(`${data.addresses.length} Adresse`);
      }
      if (data.socials.length) {
        setSocials((prev) => [
          ...prev,
          ...data.socials.filter(
            (s) =>
              !prev.some(
                (p) => p.handle_or_url === s.handle_or_url,
              ),
          ),
        ]);
        summary.push(`${data.socials.length} Social`);
      }

      if (summary.length === 0) {
        setScanError(
          "Konnte keine Daten erkennen. Versuch ein klareres Foto.",
        );
      } else {
        setScanSummary(`Übernommen: ${summary.join(", ")}`);
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan fehlgeschlagen");
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function commitTagInput() {
    const value = tagInput.trim();
    if (!value) return;
    if (!tags.includes(value)) {
      setTags([...tags, value]);
    }
    setTagInput("");
  }

  return (
    <form action={action} className="space-y-10">
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="phones" value={JSON.stringify(phones)} />
      <input type="hidden" name="emails" value={JSON.stringify(emails)} />
      <input
        type="hidden"
        name="addresses"
        value={JSON.stringify(addresses)}
      />
      <input type="hidden" name="socials" value={JSON.stringify(socials)} />
      <input
        type="hidden"
        name="important_dates"
        value={JSON.stringify(importantDates)}
      />
      <input
        type="hidden"
        name="relationships"
        value={JSON.stringify(relationships)}
      />
      <input type="hidden" name="avatar_url" value={avatarUrl} />
      <input type="hidden" name="notes_field" value={notes} />
      <input type="hidden" name="strength_score" value={String(strength)} />

      <div className="rounded border border-rule bg-paper-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="t-label">Visitenkarte scannen</p>
            <p className="text-xs text-ink-3">
              Foto aufnehmen oder hochladen — Felder werden vorausgefüllt.
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleScanFile(file);
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={scanning}
            className="rounded border border-action bg-action px-3 py-1.5 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
          >
            {scanning ? "Erkenne…" : "Foto wählen"}
          </button>
        </div>
        {scanSummary && (
          <p className="mt-2 text-xs text-ink-2" style={{ color: "var(--action)" }}>
            {scanSummary}
          </p>
        )}
        {scanError && (
          <p className="mt-2 text-xs text-bad">{scanError}</p>
        )}
      </div>

      <Section label="Identität">
        <Field label="Name" required>
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Firma"
            hint="Wird automatisch zu einer Organisation verknüpft."
          >
            <input
              name="company"
              list="echo-org-suggestions"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={inputClass}
            />
            <datalist id="echo-org-suggestions">
              {existingOrgs.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </Field>
          <Field label="Rolle">
            <input
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Scope">
            <div className="flex h-9 rounded border border-rule bg-paper p-0.5 text-xs">
              {(["work", "personal", "both"] as Scope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={`flex-1 rounded transition-colors ${
                    scope === s
                      ? "bg-paper-2 text-ink-1"
                      : "text-ink-3 hover:text-ink-1"
                  }`}
                >
                  {s === "work" ? "Beruflich" : s === "personal" ? "Privat" : "Beides"}
                </button>
              ))}
            </div>
          </Field>
          <Field
            label="Beziehungsstärke"
            hint="Manuelles Tier 1-5. Hilft beim Priorisieren in Rhythmus + Sonntags-Puls."
          >
            <div className="flex h-9 items-center">
              <StrengthMeterInput
                value={strength}
                onChange={setStrength}
              />
            </div>
          </Field>
        </div>

        <Field
          label="Tags"
          hint="Schreib einen Tag, dann Enter. Klick × zum Entfernen."
        >
          <input type="hidden" name="tags" value={tags.join(", ")} />
          <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded border border-rule bg-paper px-2 py-1.5 focus-within:border-action focus-within:ring-2 focus-within:ring-action/20">
            {tags.map((t) => (
              <span key={t} className="tag">
                <span className="dot" />
                {t}
                <button
                  type="button"
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  aria-label={`Tag ${t} entfernen`}
                  className="-mr-0.5 ml-0.5 text-ink-4 transition hover:text-bad"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              list={TAG_DATALIST_ID}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  commitTagInput();
                  return;
                }
                if (
                  e.key === "Backspace" &&
                  tagInput === "" &&
                  tags.length > 0
                ) {
                  setTags(tags.slice(0, -1));
                }
              }}
              onBlur={commitTagInput}
              placeholder={tags.length === 0 ? "Marketing, München…" : ""}
              className="min-w-32 flex-1 bg-transparent text-sm text-ink-1 outline-none placeholder:text-ink-4"
            />
            <datalist id={TAG_DATALIST_ID}>
              {existingTags
                .filter((t) => !tags.includes(t))
                .map((t) => (
                  <option key={t} value={t} />
                ))}
            </datalist>
          </div>
        </Field>

        <Field label="Profilbild URL" hint="Optional, später Upload möglich">
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            className={inputClass}
          />
        </Field>
      </Section>

      <Section label="Telefon">
        <RepeatableList
          items={phones}
          empty="Noch keine Telefonnummer."
          onAdd={() => setPhones([...phones, { label: "mobile", value: "" }])}
          renderItem={(p, i) => (
            <div className="grid grid-cols-[140px_1fr_auto] gap-2">
              <select
                value={p.label}
                onChange={(e) => {
                  const next = [...phones];
                  next[i] = { ...next[i], label: e.target.value };
                  setPhones(next);
                }}
                className={selectClass}
              >
                {PHONE_LABELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                value={p.value}
                onChange={(e) => {
                  const next = [...phones];
                  next[i] = { ...next[i], value: e.target.value };
                  setPhones(next);
                }}
                placeholder="+49…"
                className={inputClass}
              />
              <RemoveButton
                onClick={() => setPhones(phones.filter((_, j) => j !== i))}
              />
            </div>
          )}
        />
      </Section>

      <Section label="Email">
        <RepeatableList
          items={emails}
          empty="Noch keine Email-Adresse."
          onAdd={() =>
            setEmails([...emails, { label: "persönlich", value: "" }])
          }
          renderItem={(em, i) => (
            <div className="grid grid-cols-[140px_1fr_auto] gap-2">
              <select
                value={em.label}
                onChange={(e) => {
                  const next = [...emails];
                  next[i] = { ...next[i], label: e.target.value };
                  setEmails(next);
                }}
                className={selectClass}
              >
                {EMAIL_LABELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <input
                type="email"
                value={em.value}
                onChange={(e) => {
                  const next = [...emails];
                  next[i] = { ...next[i], value: e.target.value };
                  setEmails(next);
                }}
                placeholder="name@example.com"
                className={inputClass}
              />
              <RemoveButton
                onClick={() => setEmails(emails.filter((_, j) => j !== i))}
              />
            </div>
          )}
        />
      </Section>

      <Section label="Adresse">
        <RepeatableList
          items={addresses}
          empty="Noch keine Adresse."
          onAdd={() =>
            setAddresses([
              ...addresses,
              {
                label: "zuhause",
                street: "",
                city: "",
                postal_code: "",
                country: "",
              },
            ])
          }
          renderItem={(a, i) => (
            <div className="space-y-2 rounded border border-rule-soft bg-paper-2 p-3">
              <div className="grid grid-cols-[140px_1fr_auto] gap-2">
                <select
                  value={a.label}
                  onChange={(e) => {
                    const next = [...addresses];
                    next[i] = { ...next[i], label: e.target.value };
                    setAddresses(next);
                  }}
                  className={selectClass}
                >
                  {ADDRESS_LABELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <span />
                <RemoveButton
                  onClick={() =>
                    setAddresses(addresses.filter((_, j) => j !== i))
                  }
                />
              </div>
              <AddressAutocomplete
                value={a}
                onChange={(next) => {
                  const updated = [...addresses];
                  updated[i] = next;
                  setAddresses(updated);
                }}
              />
            </div>
          )}
        />
      </Section>

      <Section label="Social">
        <RepeatableList
          items={socials}
          empty="Noch keine Social Profiles."
          onAdd={() =>
            setSocials([
              ...socials,
              { platform: "LinkedIn", handle_or_url: "" },
            ])
          }
          renderItem={(s, i) => (
            <div className="grid grid-cols-[140px_1fr_auto] gap-2">
              <select
                value={s.platform}
                onChange={(e) => {
                  const next = [...socials];
                  next[i] = { ...next[i], platform: e.target.value };
                  setSocials(next);
                }}
                className={selectClass}
              >
                {SOCIAL_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input
                value={s.handle_or_url}
                onChange={(e) => {
                  const next = [...socials];
                  next[i] = { ...next[i], handle_or_url: e.target.value };
                  setSocials(next);
                }}
                placeholder="@handle oder https://…"
                className={inputClass}
              />
              <RemoveButton
                onClick={() => setSocials(socials.filter((_, j) => j !== i))}
              />
            </div>
          )}
        />
      </Section>

      <Section label="Wichtige Daten" hint="Geburtstag etc. — als ICS exportierbar, optional als jährliche Erinnerung">
        <RepeatableList
          items={importantDates}
          empty="Noch keine Daten hinterlegt."
          onAdd={() =>
            setImportantDates([
              ...importantDates,
              { label: "Geburtstag", date: "", remind: true },
            ])
          }
          renderItem={(d, i) => {
            const leadValue = d.remind ? (d.remind_lead_days ?? 0) : -1;
            return (
              <div className="grid grid-cols-[140px_minmax(0,1fr)_minmax(0,160px)_auto] items-center gap-2">
                <select
                  value={d.label}
                  onChange={(e) => {
                    const next = [...importantDates];
                    next[i] = { ...next[i], label: e.target.value };
                    setImportantDates(next);
                  }}
                  className={selectClass}
                >
                  {DATE_LABELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={d.date}
                  onChange={(e) => {
                    const next = [...importantDates];
                    next[i] = { ...next[i], date: e.target.value };
                    setImportantDates(next);
                  }}
                  className={inputClass}
                />
                <select
                  value={String(leadValue)}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    const next = [...importantDates];
                    if (v < 0) {
                      next[i] = { ...next[i], remind: false, remind_lead_days: 0 };
                    } else {
                      next[i] = {
                        ...next[i],
                        remind: true,
                        remind_lead_days: v,
                      };
                    }
                    setImportantDates(next);
                  }}
                  className={selectClass}
                >
                  <option value="-1">Nicht erinnern</option>
                  {REMIND_LEAD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <RemoveButton
                  onClick={() =>
                    setImportantDates(importantDates.filter((_, j) => j !== i))
                  }
                />
              </div>
            );
          }}
        />
      </Section>

      <Section
        label="Beziehungen"
        hint="Verknüpfung zu anderen Personen im CRM"
      >
        <RepeatableList
          items={relationships}
          empty={
            peopleOptions.length === 0
              ? "Lege zuerst andere Personen an."
              : "Noch keine Beziehungen."
          }
          onAdd={() =>
            setRelationships([
              ...relationships,
              {
                related_person_id: peopleOptions[0]?.id ?? "",
                label: "Partner:in",
              },
            ])
          }
          addDisabled={peopleOptions.length === 0}
          renderItem={(r, i) => (
            <div className="grid grid-cols-[160px_1fr_auto] gap-2">
              <select
                value={r.label}
                onChange={(e) => {
                  const next = [...relationships];
                  next[i] = { ...next[i], label: e.target.value };
                  setRelationships(next);
                }}
                className={selectClass}
              >
                {RELATIONSHIP_LABELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                value={r.related_person_id}
                onChange={(e) => {
                  const next = [...relationships];
                  next[i] = { ...next[i], related_person_id: e.target.value };
                  setRelationships(next);
                }}
                className={selectClass}
              >
                {peopleOptions
                  .filter((p) => p.id !== initial?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <RemoveButton
                onClick={() =>
                  setRelationships(relationships.filter((_, j) => j !== i))
                }
              />
            </div>
          )}
        />
      </Section>

      <Section label="Notizen">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="Freier Text — Hintergrund, Erinnerungswertes, was dir einfällt"
          className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
        />
      </Section>

      <Section label="Rhythmus">
        <Field
          label="Erwartete Cadence"
          hint="Tage zwischen üblichen Kontakten"
        >
          <input
            type="number"
            name="expected_cadence_days"
            min={1}
            defaultValue={initial?.expected_cadence_days ?? ""}
            className={inputClass}
          />
        </Field>
      </Section>

      {error && <p className="text-sm text-bad">Fehler: {error}</p>}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href={cancelHref}
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

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="section-head">
        <span className="t-label">{label}</span>
        <span className="rule" />
      </div>
      {hint && <p className="text-xs text-ink-4">{hint}</p>}
      <div className="space-y-3">{children}</div>
    </section>
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

function RepeatableList<T>({
  items,
  empty,
  renderItem,
  onAdd,
  addDisabled,
}: {
  items: T[];
  empty: string;
  renderItem: (item: T, index: number) => React.ReactNode;
  onAdd: () => void;
  addDisabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-xs italic text-ink-4">{empty}</p>
      ) : (
        items.map((item, i) => (
          <div key={i}>{renderItem(item, i)}</div>
        ))
      )}
      <button
        type="button"
        onClick={onAdd}
        disabled={addDisabled}
        className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-action hover:text-action disabled:opacity-50"
      >
        + Hinzufügen
      </button>
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Entfernen"
      className="self-center text-base text-ink-4 transition hover:text-bad"
    >
      ×
    </button>
  );
}

function mergeUnique<T>(
  existing: T[],
  incoming: T[],
  same: (a: T, b: T) => boolean,
): T[] {
  const merged = [...existing];
  for (const item of incoming) {
    if (!merged.some((m) => same(m, item))) merged.push(item);
  }
  return merged;
}
