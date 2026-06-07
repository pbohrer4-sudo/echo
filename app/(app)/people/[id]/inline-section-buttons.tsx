"use client";

// Inline „+Feldname"-Buttons für Person-Detail-Section-Header. Pro
// Typ ein kleines Popover-Formular das die jeweilige Server-Action
// triggert. Alle gefolgt vom selben Pattern: Button → onClick öffnet
// inline-Form → Submit → revalidatePath schließt + refresht.

import { useEffect, useRef, useState, useTransition } from "react";
import {
  DATE_LABELS,
  GEO_TYPE_LABELS,
  GEO_TYPES,
  RELATIONSHIP_TYPE_LABELS,
  RELATIONSHIP_TYPES,
  type GeoType,
  type RelationshipType,
} from "@/lib/types";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import {
  addEventAction,
  addGeographyAction,
  addGiftIdeaAction,
  addImportantDateAction,
  addRelationshipAction,
  addReminderAction,
  addTodoAction,
  createMinimalPersonAction,
  removeGiftIdeaAction,
} from "./inline-section-actions";

const inputClass =
  "h-9 w-full rounded border border-rule bg-paper px-2 text-xs text-ink-1 outline-none focus:border-action focus:ring-2 focus:ring-action/20";

interface PersonOption {
  id: string;
  name: string;
}

// ───────── Shared Outer Popover ─────────

function InlineAddShell({
  label,
  children,
  onClose,
}: {
  label: string;
  children: (close: () => void) => React.ReactNode;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function close() {
    setOpen(false);
    onClose?.();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-dashed border-rule px-2.5 py-1 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
      >
        {open ? `× ${label}` : `+ ${label}`}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded border border-rule bg-paper p-3 shadow-[0_4px_14px_rgba(20,17,13,0.08)]">
          {children(close)}
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="t-label">{children}</span>;
}

function ErrorRow({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-[11px] text-bad">{message}</p>;
}

// ───────── + Datum ─────────

export function AddDateButton({
  personId,
  customLabels = [],
}: {
  personId: string;
  // Reusable custom occasions remembered from prior entries (per-user).
  customLabels?: string[];
}) {
  return (
    <InlineAddShell label="Datum">
      {(close) => (
        <AddDateForm
          personId={personId}
          customLabels={customLabels}
          onDone={close}
        />
      )}
    </InlineAddShell>
  );
}

// Vorgegebene Lead-Time-Optionen — entspricht REMIND_LEAD_OPTIONS aus
// lib/types.ts. Default 7 (eine Woche vorher) — bewährt für
// Geburtstag/Hochzeitstag damit man noch Geschenk besorgen kann.
const LEAD_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Am Tag" },
  { value: 1, label: "1 Tag vorher" },
  { value: 3, label: "3 Tage vorher" },
  { value: 7, label: "1 Woche vorher" },
  { value: 14, label: "2 Wochen vorher" },
  { value: 30, label: "1 Monat vorher" },
];

function AddDateForm({
  personId,
  customLabels,
  onDone,
}: {
  personId: string;
  customLabels: string[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState<string>(DATE_LABELS[0]);
  // Built-in occasions + the user's remembered custom ones, de-duped,
  // with "andere" kept last as the free-text escape hatch.
  const occasionOptions = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const o of [...DATE_LABELS, ...customLabels]) {
      const key = o.toLowerCase();
      if (key === "andere") continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(o);
    }
    out.push("andere");
    return out;
  })();
  const [customLabel, setCustomLabel] = useState("");
  const [date, setDate] = useState("");
  const [remind, setRemind] = useState(true);
  const [leadDays, setLeadDays] = useState<number>(7);
  // Free-entry lead time: when true, the dropdown switches to a number
  // input so the user can pick any number of days before the date.
  const [leadCustom, setLeadCustom] = useState(false);
  const [leadCustomDays, setLeadCustomDays] = useState<string>("");

  const isCustom = label === "andere";
  const effectiveLabel = isCustom ? customLabel.trim() || "andere" : label;
  const effectiveLead = leadCustom
    ? Math.max(0, parseInt(leadCustomDays || "0", 10) || 0)
    : leadDays;

  function submit() {
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("label", effectiveLabel);
    fd.set("date", date);
    if (remind) {
      fd.set("remind", "on");
      fd.set("remind_lead_days", String(effectiveLead));
    }
    startTransition(async () => {
      const res = await addImportantDateAction(fd);
      if (!res.ok) setError(res.error ?? "Fehler");
      else onDone();
    });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <Label>Anlass</Label>
          <select
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={inputClass}
          >
            {occasionOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <Label>Datum</Label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      {isCustom && (
        <label className="space-y-1 block">
          <Label>Eigener Anlass</Label>
          <input
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="z.B. Kennenlern-Tag"
            className={inputClass}
          />
        </label>
      )}
      <label className="flex items-center gap-2 text-xs text-ink-2">
        <input
          type="checkbox"
          checked={remind}
          onChange={(e) => setRemind(e.target.checked)}
        />
        Erinnern
      </label>
      {remind && (
        <label className="space-y-1 block">
          <Label>Erinnerung am:</Label>
          {leadCustom ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={leadCustomDays}
                onChange={(e) => setLeadCustomDays(e.target.value)}
                placeholder="z.B. 10"
                className={inputClass}
                autoFocus
              />
              <span className="whitespace-nowrap text-xs text-ink-3">
                Tage vorher
              </span>
              <button
                type="button"
                onClick={() => setLeadCustom(false)}
                className="whitespace-nowrap text-xs text-ink-3 underline hover:text-ink-1"
              >
                Liste
              </button>
            </div>
          ) : (
            <select
              value={leadDays}
              onChange={(e) => {
                if (e.target.value === "custom") {
                  setLeadCustom(true);
                  return;
                }
                setLeadDays(parseInt(e.target.value, 10));
              }}
              className={inputClass}
            >
              {LEAD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              <option value="custom">Andere… (frei eingeben)</option>
            </select>
          )}
        </label>
      )}
      <ErrorRow message={error} />
      <SubmitRow pending={pending} onSubmit={submit} onCancel={onDone} />
    </div>
  );
}

// ───────── + Beziehung ─────────

export function AddRelationshipButton({
  personId,
  candidatePeople,
}: {
  personId: string;
  candidatePeople: PersonOption[];
}) {
  return (
    <InlineAddShell label="Beziehung">
      {(close) => (
        <AddRelationshipForm
          personId={personId}
          candidatePeople={candidatePeople}
          onDone={close}
        />
      )}
    </InlineAddShell>
  );
}

function AddRelationshipForm({
  personId,
  candidatePeople,
  onDone,
}: {
  personId: string;
  candidatePeople: PersonOption[];
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<RelationshipType>("friend");
  const [labelText, setLabelText] = useState("");

  // Combobox-State: query (was der User tippt) + relatedId (UUID der
  // gewählten Person). Wenn der User noch nicht ausgewählt hat,
  // bleibt relatedId leer, aber wir können trotzdem submitten falls
  // query auf eine eindeutige Person matched.
  const [query, setQuery] = useState("");
  const [relatedId, setRelatedId] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const candidates = candidatePeople.filter((p) => p.id !== personId);
  const filtered = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, 8);
    return candidates
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 8);
  })();
  const exactMatch = candidates.find(
    (p) => p.name.toLowerCase() === query.trim().toLowerCase(),
  );
  const canCreate =
    query.trim().length >= 2 && !exactMatch && !relatedId;

  function selectPerson(p: PersonOption) {
    setRelatedId(p.id);
    setQuery(p.name);
    setOpen(false);
  }

  async function createAndSelect() {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    const fd = new FormData();
    fd.set("name", name);
    const res = await createMinimalPersonAction(fd);
    setCreating(false);
    if (!res.ok || !res.id) {
      setError(res.error ?? "Konnte Person nicht anlegen");
      return;
    }
    setRelatedId(res.id);
    setOpen(false);
  }

  function submit() {
    if (!relatedId) {
      setError("Bitte Person auswählen oder neu anlegen");
      return;
    }
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("related_person_id", relatedId);
    fd.set("relationship_type", type);
    fd.set("label", labelText);
    startTransition(async () => {
      const res = await addRelationshipAction(fd);
      if (!res.ok) setError(res.error ?? "Fehler");
      else onDone();
    });
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label>Verbunden mit</Label>
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setRelatedId("");
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Name suchen oder neu eintippen"
            autoFocus
            className={inputClass}
          />
          {open && (filtered.length > 0 || canCreate) && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded border border-rule bg-paper shadow-[0_4px_14px_rgba(20,17,13,0.08)]">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPerson(p)}
                  className={`block w-full px-3 py-1.5 text-left text-xs transition hover:bg-paper-2 ${
                    relatedId === p.id ? "bg-action-soft text-action" : "text-ink-1"
                  }`}
                >
                  {p.name}
                </button>
              ))}
              {canCreate && (
                <button
                  type="button"
                  onClick={createAndSelect}
                  disabled={creating}
                  className="block w-full border-t border-rule-soft px-3 py-1.5 text-left text-xs text-action transition hover:bg-action-soft disabled:opacity-50"
                >
                  {creating ? "Lege an…" : `+ „${query.trim()}" als neue Person anlegen`}
                </button>
              )}
            </div>
          )}
        </div>
        {relatedId && (
          <p className="text-[10px] text-ink-4">
            ✓ ausgewählt — andere Felder ausfüllen + Anlegen
          </p>
        )}
      </div>
      <label className="space-y-1 block">
        <Label>Typ</Label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as RelationshipType)}
          className={inputClass}
        >
          {RELATIONSHIP_TYPES.map((t) => (
            <option key={t} value={t}>
              {RELATIONSHIP_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 block">
        <Label>Anmerkung (optional)</Label>
        <input
          type="text"
          value={labelText}
          onChange={(e) => setLabelText(e.target.value)}
          placeholder='z.B. "über Bauma kennengelernt"'
          className={inputClass}
        />
      </label>
      <ErrorRow message={error} />
      <SubmitRow
        pending={pending}
        onSubmit={submit}
        onCancel={onDone}
        disabled={!relatedId}
      />
    </div>
  );
}

// ───────── + Erinnerung ─────────

export function AddReminderButton({ personId }: { personId: string }) {
  return (
    <InlineAddShell label="Erinnerung">
      {(close) => <AddReminderForm personId={personId} onDone={close} />}
    </InlineAddShell>
  );
}

function AddReminderForm({
  personId,
  onDone,
}: {
  personId: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [recurrence, setRecurrence] = useState("once");

  function submit() {
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("text", text);
    fd.set("remind_at", remindAt);
    fd.set("recurrence", recurrence);
    startTransition(async () => {
      const res = await addReminderAction(fd);
      if (!res.ok) setError(res.error ?? "Fehler");
      else onDone();
    });
  }

  return (
    <div className="space-y-2">
      <label className="space-y-1 block">
        <Label>Worum geht's?</Label>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='z.B. "Pricing-Frage nachfassen"'
          autoFocus
          className={inputClass}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <Label>Wann</Label>
          <input
            type="date"
            value={remindAt}
            onChange={(e) => setRemindAt(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="space-y-1">
          <Label>Wiederholung</Label>
          <select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
            className={inputClass}
          >
            <option value="once">Einmalig</option>
            <option value="weekly">Wöchentlich</option>
            <option value="monthly">Monatlich</option>
            <option value="yearly">Jährlich</option>
          </select>
        </label>
      </div>
      <ErrorRow message={error} />
      <SubmitRow
        pending={pending}
        onSubmit={submit}
        onCancel={onDone}
        disabled={!text.trim() || !remindAt}
      />
    </div>
  );
}

// ───────── + Aufgabe ─────────

export function AddTodoButton({ personId }: { personId: string }) {
  return (
    <InlineAddShell label="Aufgabe">
      {(close) => <AddTodoForm personId={personId} onDone={close} />}
    </InlineAddShell>
  );
}

function AddTodoForm({
  personId,
  onDone,
}: {
  personId: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");

  function submit() {
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("text", text);
    if (dueDate) fd.set("due_date", dueDate);
    fd.set("priority", priority);
    startTransition(async () => {
      const res = await addTodoAction(fd);
      if (!res.ok) setError(res.error ?? "Fehler");
      else onDone();
    });
  }

  return (
    <div className="space-y-2">
      <label className="space-y-1 block">
        <Label>Was steht an?</Label>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='z.B. "Pitchdeck schicken"'
          autoFocus
          className={inputClass}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <Label>Bis wann (optional)</Label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="space-y-1">
          <Label>Priorität</Label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className={inputClass}
          >
            <option value="low">Niedrig</option>
            <option value="medium">Mittel</option>
            <option value="high">Hoch</option>
          </select>
        </label>
      </div>
      <ErrorRow message={error} />
      <SubmitRow
        pending={pending}
        onSubmit={submit}
        onCancel={onDone}
        disabled={!text.trim()}
      />
    </div>
  );
}

// ───────── Gifts: Chips mit + / × ─────────
// Mehrere Geschenkideen pro Person. Storage bleibt das alte
// gift_idea-TEXT-Feld mit ' · '-Separator (kein Schema-Change), die
// UI splittet vor dem Rendern auf. Add-Button öffnet ein Inline-Form
// das einen NEUEN Eintrag anhängt; × auf einem Chip entfernt nur
// diesen einen Eintrag.

const GIFT_SEPARATOR = " · ";

function splitGifts(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(GIFT_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function GiftsList({
  personId,
  current,
}: {
  personId: string;
  current: string | null;
}) {
  const items = splitGifts(current);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <GiftChip key={item} personId={personId} value={item} />
      ))}
      <AddGiftButton personId={personId} />
    </div>
  );
}

function GiftChip({ personId, value }: { personId: string; value: string }) {
  const [pending, startTransition] = useTransition();
  function remove() {
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("value", value);
    startTransition(async () => {
      await removeGiftIdeaAction(fd);
    });
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-rule bg-paper-2 px-3 py-1 text-sm text-ink-1 ${
        pending ? "opacity-50" : ""
      }`}
    >
      <span>{value}</span>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label={`${value} entfernen`}
        className="text-ink-4 transition hover:text-bad"
      >
        ×
      </button>
    </span>
  );
}

export function AddGiftButton({ personId }: { personId: string }) {
  return (
    <InlineAddShell label="Gift">
      {(close) => <AddGiftForm personId={personId} onDone={close} />}
    </InlineAddShell>
  );
}

function AddGiftForm({
  personId,
  onDone,
}: {
  personId: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState("");

  function submit() {
    if (!value.trim()) return;
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("value", value.trim());
    startTransition(async () => {
      const res = await addGiftIdeaAction(fd);
      if (!res.ok) setError(res.error ?? "Fehler");
      else onDone();
    });
  }

  return (
    <div className="space-y-2">
      <label className="space-y-1 block">
        <Label>Geschenkidee</Label>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="z.B. Whisky 1990"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          className={inputClass}
        />
      </label>
      <ErrorRow message={error} />
      <SubmitRow
        pending={pending}
        onSubmit={submit}
        onCancel={onDone}
        disabled={!value.trim()}
      />
    </div>
  );
}

// ───────── + Event (Timeline / interactions) ─────────

export function AddEventButton({ personId }: { personId: string }) {
  return (
    <InlineAddShell label="Notiz">
      {(close) => <AddEventForm personId={personId} onDone={close} />}
    </InlineAddShell>
  );
}

function AddEventForm({
  personId,
  onDone,
}: {
  personId: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Default to "note" — the button now reads "+ Notiz", so the most
  // common action is jotting a note. Other types stay one click away.
  const [type, setType] = useState("note");
  const [summary, setSummary] = useState("");
  // Default: heute. Der User trägt das Datum oft nachträglich ein,
  // aber „heute" ist häufiger als „letzte Woche".
  const [occurredAt, setOccurredAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [sentiment, setSentiment] = useState("");
  const [topics, setTopics] = useState("");
  const [file, setFile] = useState<File | null>(null);

  function submit() {
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("type", type);
    fd.set("summary", summary);
    fd.set("occurred_at", occurredAt);
    if (sentiment) fd.set("sentiment", sentiment);
    if (topics) fd.set("topics", topics);
    if (file) fd.set("file", file);
    startTransition(async () => {
      const res = await addEventAction(fd);
      if (!res.ok) setError(res.error ?? "Fehler");
      else onDone();
    });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <Label>Art</Label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={inputClass}
          >
            <option value="meeting">Treffen</option>
            <option value="call">Anruf</option>
            <option value="email">Email</option>
            <option value="note">Notiz</option>
            <option value="voice">Sprachnotiz</option>
          </select>
        </label>
        <label className="space-y-1">
          <Label>Datum</Label>
          <input
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <label className="space-y-1 block">
        <Label>Was ist passiert?</Label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder='z.B. "Treffen im Büro, Pitch besprochen"'
          rows={2}
          autoFocus
          className={`${inputClass} h-auto py-1.5`}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <Label>Stimmung</Label>
          <select
            value={sentiment}
            onChange={(e) => setSentiment(e.target.value)}
            className={inputClass}
          >
            <option value="">—</option>
            <option value="positive">Positiv</option>
            <option value="neutral">Neutral</option>
            <option value="tense">Angespannt</option>
          </select>
        </label>
        <label className="space-y-1">
          <Label>Themen (Komma-getrennt)</Label>
          <input
            type="text"
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
            placeholder="KI, Pitch"
            className={inputClass}
          />
        </label>
      </div>
      <label className="space-y-1 block">
        <Label>Anhang (optional)</Label>
        <input
          type="file"
          accept=".txt,.md,.markdown,text/plain,text/markdown,application/pdf,audio/*,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-[11px] text-ink-2 file:mr-2 file:rounded file:border file:border-rule file:bg-paper-2 file:px-2 file:py-1 file:text-[11px] file:text-ink-2 hover:file:border-action"
        />
        {file && (
          <p className="text-[10px] text-ink-4">
            {file.name} · {(file.size / 1024).toFixed(0)} KB
            {file.type.startsWith("text/") || file.type === "application/json"
              ? " · Text wird automatisch als Transcript übernommen"
              : ""}
          </p>
        )}
      </label>
      <ErrorRow message={error} />
      <SubmitRow
        pending={pending}
        onSubmit={submit}
        onCancel={onDone}
        disabled={!summary.trim() && !file}
      />
    </div>
  );
}

// ───────── + Ort (person_geographies) ─────────

export function AddGeographyButton({ personId }: { personId: string }) {
  return (
    <InlineAddShell label="Ort">
      {(close) => <AddGeographyForm personId={personId} onDone={close} />}
    </InlineAddShell>
  );
}

function AddGeographyForm({
  personId,
  onDone,
}: {
  personId: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [geoType, setGeoType] = useState<GeoType>("residence");
  const [customLabel, setCustomLabel] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);

  function submit() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    fd.set("person_id", personId);
    fd.set("geo_type", geoType);
    if (geoType === "custom") fd.set("custom_label", customLabel);
    startTransition(async () => {
      const res = await addGeographyAction(fd);
      if (!res.ok) setError(res.error ?? "Fehler");
      else onDone();
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-2"
    >
      <label className="space-y-1 block">
        <Label>Typ</Label>
        <select
          value={geoType}
          onChange={(e) => setGeoType(e.target.value as GeoType)}
          className={inputClass}
        >
          {/* met_location ("Wo getroffen") lives in the Origin section,
              not in Orte — exclude it here. */}
          {GEO_TYPES.filter((t) => t !== "met_location").map((t) => (
            <option key={t} value={t}>
              {GEO_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      {geoType === "custom" && (
        <label className="space-y-1 block">
          <Label>Eigenes Label</Label>
          <input
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder='z.B. "Studienort"'
            className={inputClass}
          />
        </label>
      )}
      <label className="space-y-1 block">
        <Label>Ort</Label>
        <LocationAutocomplete
          name="location"
          placeholder="z.B. München, Schwabing"
          className={inputClass}
        />
      </label>
      <ErrorRow message={error} />
      <SubmitRow pending={pending} onSubmit={submit} onCancel={onDone} />
    </form>
  );
}

// ───────── Shared Submit-Row ─────────

function SubmitRow({
  pending,
  onSubmit,
  onCancel,
  disabled,
}: {
  pending: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="text-[10px] text-ink-3 transition hover:text-ink-1"
      >
        Abbrechen
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={pending || disabled}
        className="rounded border border-action bg-action px-3 py-1 text-[10px] font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
      >
        {pending ? "..." : "Anlegen"}
      </button>
    </div>
  );
}
