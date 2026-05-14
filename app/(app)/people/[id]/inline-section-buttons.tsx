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
  addImportantDateAction,
  addRelationshipAction,
  addReminderAction,
  addTodoAction,
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

export function AddDateButton({ personId }: { personId: string }) {
  return (
    <InlineAddShell label="Datum">
      {(close) => <AddDateForm personId={personId} onDone={close} />}
    </InlineAddShell>
  );
}

function AddDateForm({
  personId,
  onDone,
}: {
  personId: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState<string>(DATE_LABELS[0]);
  const [customLabel, setCustomLabel] = useState("");
  const [date, setDate] = useState("");
  const [remind, setRemind] = useState(true);

  const isCustom = label === "andere";
  const effectiveLabel = isCustom ? customLabel.trim() || "andere" : label;

  function submit() {
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("label", effectiveLabel);
    fd.set("date", date);
    if (remind) fd.set("remind", "on");
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
            {DATE_LABELS.map((d) => (
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
        Jährlich erinnern (7 Tage vorher)
      </label>
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
  const [relatedId, setRelatedId] = useState("");
  const [type, setType] = useState<RelationshipType>("friend");
  const [labelText, setLabelText] = useState("");

  function submit() {
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

  const candidates = candidatePeople.filter((p) => p.id !== personId);

  return (
    <div className="space-y-2">
      <label className="space-y-1 block">
        <Label>Verbunden mit</Label>
        <select
          value={relatedId}
          onChange={(e) => setRelatedId(e.target.value)}
          className={inputClass}
        >
          <option value="">Person wählen…</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
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

// ───────── + Event (Timeline / interactions) ─────────

export function AddEventButton({ personId }: { personId: string }) {
  return (
    <InlineAddShell label="Event">
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
  const [type, setType] = useState("meeting");
  const [summary, setSummary] = useState("");
  // Default: heute. Der User trägt das Datum oft nachträglich ein,
  // aber „heute" ist häufiger als „letzte Woche".
  const [occurredAt, setOccurredAt] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [sentiment, setSentiment] = useState("");
  const [topics, setTopics] = useState("");

  function submit() {
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("type", type);
    fd.set("summary", summary);
    fd.set("occurred_at", occurredAt);
    if (sentiment) fd.set("sentiment", sentiment);
    if (topics) fd.set("topics", topics);
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
      <ErrorRow message={error} />
      <SubmitRow
        pending={pending}
        onSubmit={submit}
        onCancel={onDone}
        disabled={!summary.trim()}
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
          {GEO_TYPES.map((t) => (
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
