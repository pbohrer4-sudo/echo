"use client";

// Unified person overview for the scalar bio fields (2026-06-07).
// Read mode: every field is shown, even when empty ("—"). "Bearbeiten"
// flips the SAME layout into inputs with one "Speichern". The separate
// edit page is no longer needed for these fields. Multi-row sections
// (tags, contacts, dates, relationships, geographies, life events) keep
// their own inline editing elsewhere on the page.

import { useState, useTransition } from "react";
import {
  LANGUAGES,
  type Person,
} from "@/lib/types";
import {
  parseFieldValues,
  displayValue,
  type CustomFieldDef,
  type CustomFieldValues,
} from "@/lib/custom-fields";
import { updatePersonScalars } from "./scalar-actions";

const inputClass =
  "h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";
const areaClass =
  "w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";

export function ProfileScalars({
  person,
  fieldDefs,
}: {
  person: Person;
  fieldDefs: CustomFieldDef[];
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Local form state (only used in edit mode).
  const [name, setName] = useState(person.name ?? "");
  const [company, setCompany] = useState(person.company ?? "");
  const [role, setRole] = useState(person.role ?? "");
  const [primaryLanguage, setPrimaryLanguage] = useState(
    person.primary_language ?? "",
  );
  const [secondaryLanguage, setSecondaryLanguage] = useState(
    person.secondary_language ?? "",
  );
  const [howWeMet, setHowWeMet] = useState(person.how_we_met ?? "");
  const [metLocation, setMetLocation] = useState(person.met_location ?? "");
  const [metDate, setMetDate] = useState(person.met_date ?? "");
  const [introducedBy, setIntroducedBy] = useState(person.introduced_by ?? "");
  const [metWith, setMetWith] = useState(person.met_with ?? "");
  const [synergies, setSynergies] = useState<string[]>(person.synergies ?? []);
  const [giftIdea, setGiftIdea] = useState(person.gift_idea ?? "");
  const [notes, setNotes] = useState(person.notes ?? "");
  const [customValues, setCustomValues] = useState<CustomFieldValues>(() =>
    parseFieldValues(person.custom_field_values),
  );

  function setCustom(id: string, value: string | boolean) {
    setCustomValues((prev) => ({ ...prev, [id]: value }));
  }

  function save() {
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("company", company);
    fd.set("role", role);
    fd.set("primary_language", primaryLanguage);
    fd.set("secondary_language", secondaryLanguage);
    fd.set("how_we_met", howWeMet);
    fd.set("met_location", metLocation);
    fd.set("met_date", metDate);
    fd.set("introduced_by", introducedBy);
    fd.set("met_with", metWith);
    fd.set("synergies", JSON.stringify(synergies.filter((s) => s.trim())));
    fd.set("gift_idea", giftIdea);
    fd.set("notes", notes);
    fd.set("custom_field_values", JSON.stringify(customValues));
    startTransition(async () => {
      const res = await updatePersonScalars(person.id, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      // Reload so the server-rendered read values reflect the save.
      window.location.reload();
    });
  }

  const dateLabel = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("de-DE") : "—";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="t-label">Profil</span>
        {editing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              disabled={pending}
              className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-ink-3 hover:text-ink-1 disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded border border-action bg-action px-3 py-1.5 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
            >
              {pending ? "Speichert…" : "Speichern"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-action hover:text-action"
          >
            Bearbeiten
          </button>
        )}
      </div>

      {error && (
        <p className="rounded border border-bad/40 bg-bad/10 p-2 text-sm text-bad">
          {error}
        </p>
      )}

      <dl className="kv">
        <Row label="Name">
          {editing ? (
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          ) : (
            person.name || "—"
          )}
        </Row>
        <Row label="Firma">
          {editing ? (
            <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} />
          ) : (
            person.company || "—"
          )}
        </Row>
        <Row label="Rolle">
          {editing ? (
            <input value={role} onChange={(e) => setRole(e.target.value)} className={inputClass} />
          ) : (
            person.role || "—"
          )}
        </Row>

        <Row label="Hauptsprache">
          {editing ? (
            <select value={primaryLanguage} onChange={(e) => setPrimaryLanguage(e.target.value)} className={inputClass}>
              <option value="">Bitte wählen</option>
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          ) : (
            person.primary_language || "—"
          )}
        </Row>
        <Row label="Zweitsprache">
          {editing ? (
            <select value={secondaryLanguage} onChange={(e) => setSecondaryLanguage(e.target.value)} className={inputClass}>
              <option value="">—</option>
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          ) : (
            person.secondary_language || "—"
          )}
        </Row>

        <Row label="Wie kennengelernt">
          {editing ? (
            <textarea rows={2} value={howWeMet} onChange={(e) => setHowWeMet(e.target.value)} className={areaClass} />
          ) : (
            person.how_we_met || "—"
          )}
        </Row>
        <Row label="Wo getroffen">
          {editing ? (
            <input value={metLocation} onChange={(e) => setMetLocation(e.target.value)} className={inputClass} />
          ) : (
            person.met_location || "—"
          )}
        </Row>
        <Row label="Wann getroffen">
          {editing ? (
            <input type="date" value={metDate} onChange={(e) => setMetDate(e.target.value)} className={inputClass} />
          ) : (
            dateLabel(person.met_date)
          )}
        </Row>
        <Row label="Vermittelt durch">
          {editing ? (
            <input value={introducedBy} onChange={(e) => setIntroducedBy(e.target.value)} className={inputClass} />
          ) : (
            person.introduced_by || "—"
          )}
        </Row>
        <Row label="Getroffen mit">
          {editing ? (
            <input value={metWith} onChange={(e) => setMetWith(e.target.value)} className={inputClass} />
          ) : (
            person.met_with || "—"
          )}
        </Row>

        <Row label="Synergien">
          {editing ? (
            <div className="space-y-2">
              {synergies.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <textarea
                    rows={2}
                    value={s}
                    onChange={(e) => {
                      const next = [...synergies];
                      next[i] = e.target.value;
                      setSynergies(next);
                    }}
                    className={areaClass}
                  />
                  <button
                    type="button"
                    onClick={() => setSynergies(synergies.filter((_, j) => j !== i))}
                    aria-label="Entfernen"
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
                + Synergie
              </button>
            </div>
          ) : (person.synergies?.length ?? 0) > 0 ? (
            <ul className="space-y-1">
              {person.synergies.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 flex-none rounded-full bg-action" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          ) : (
            "—"
          )}
        </Row>

        <Row label="Gift-Idee">
          {editing ? (
            <input value={giftIdea} onChange={(e) => setGiftIdea(e.target.value)} className={inputClass} />
          ) : (
            person.gift_idea || "—"
          )}
        </Row>

        {fieldDefs.map((def) => {
          const v = customValues[def.id];
          const stored = parseFieldValues(person.custom_field_values)[def.id];
          return (
            <Row key={def.id} label={def.label}>
              {editing ? (
                def.type === "checkbox" ? (
                  <input
                    type="checkbox"
                    checked={v === true}
                    onChange={(e) => setCustom(def.id, e.target.checked)}
                    className="h-4 w-4 rounded border-rule"
                  />
                ) : def.type === "textarea" ? (
                  <textarea
                    rows={2}
                    value={typeof v === "string" ? v : ""}
                    onChange={(e) => setCustom(def.id, e.target.value)}
                    className={areaClass}
                  />
                ) : def.type === "dropdown" ? (
                  <select
                    value={typeof v === "string" ? v : ""}
                    onChange={(e) => setCustom(def.id, e.target.value)}
                    className={inputClass}
                  >
                    <option value="">—</option>
                    {(def.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
                    value={v === null || v === undefined ? "" : String(v)}
                    onChange={(e) => setCustom(def.id, e.target.value)}
                    className={inputClass}
                  />
                )
              ) : (
                displayValue(def, stored)
              )}
            </Row>
          );
        })}

        <Row label="Notizen">
          {editing ? (
            <textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} className={areaClass} />
          ) : person.notes ? (
            <span className="whitespace-pre-wrap">{person.notes}</span>
          ) : (
            "—"
          )}
        </Row>
      </dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
