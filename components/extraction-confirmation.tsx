"use client";

import { useState } from "react";
import type { ToolCall, ToolName } from "@/lib/tools";

// Per-call edit state — mirrors the original ToolCall but lets the
// user (a) toggle the whole call off via the header checkbox, and (b)
// edit / drop individual fields. Sub-checkboxes for arrays are
// modelled via separate "enabled" flags alongside each item.
//
// On commit, only `enabled` calls survive, and within each call only
// the fields the user kept checked + edited values get sent.

interface PhoneEntry {
  label: string;
  value: string;
}
interface EmailEntry {
  label: string;
  value: string;
}
interface AddressEntry {
  label: string;
  street: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
}
interface SocialEntry {
  platform: string;
  handle_or_url: string;
}
interface DateEntry {
  label: string;
  date: string;
  remind: boolean;
}

// Relationships use related_person_name in the UI — server resolves
// to UUID at commit time. Showing a free-text input lets the user
// correct mis-extracted names ("Lara" → "Laura") inline.
interface RelEntry {
  related_person_name: string;
  related_person_id?: string;
  label: string;
}

const RELATIONSHIP_LABEL_OPTIONS = [
  "Partner:in",
  "Ehepartner:in",
  "Mutter",
  "Vater",
  "Sohn",
  "Tochter",
  "Bruder",
  "Schwester",
  "Freund:in",
  "Kolleg:in",
  "Mentor:in",
  "andere",
];

interface ItemEdit<T> {
  enabled: boolean;
  value: T;
}

interface ScalarEdit<T = string> {
  enabled: boolean;
  value: T;
}

interface CallEdit {
  enabled: boolean;
  callName: ToolName;
  // Per-call shape — only the fields relevant to this tool are populated.
  // Anything not editable here (like `_person_name` metadata, scope on
  // create_person) is carried through unchanged via originalInput.
  originalInput: Record<string, unknown>;

  // create_person + update_person scalars
  name?: ScalarEdit;
  company?: ScalarEdit;
  role?: ScalarEdit;
  scope?: ScalarEdit;
  notes?: ScalarEdit;
  gift_idea?: ScalarEdit;
  how_we_met?: ScalarEdit;
  met_date?: ScalarEdit;
  met_location?: ScalarEdit;

  // create_person arrays
  tags?: ItemEdit<string>[];
  phones?: ItemEdit<PhoneEntry>[];
  emails?: ItemEdit<EmailEntry>[];
  addresses?: ItemEdit<AddressEntry>[];
  socials?: ItemEdit<SocialEntry>[];
  important_dates?: ItemEdit<DateEntry>[];
  relationships?: ItemEdit<RelEntry>[];

  // update_person additive arrays
  add_tags?: ItemEdit<string>[];
  add_phones?: ItemEdit<PhoneEntry>[];
  add_emails?: ItemEdit<EmailEntry>[];
  add_addresses?: ItemEdit<AddressEntry>[];
  add_socials?: ItemEdit<SocialEntry>[];
  add_important_dates?: ItemEdit<DateEntry>[];
  add_relationships?: ItemEdit<RelEntry>[];

  // log_interaction
  type?: ScalarEdit;
  summary?: ScalarEdit;
  sentiment?: ScalarEdit;
  topics?: ItemEdit<string>[];

  // create_note
  title?: ScalarEdit;
  body?: ScalarEdit;
  noteTags?: ItemEdit<string>[];

  // create_reminder
  text?: ScalarEdit;
  remind_at?: ScalarEdit;
  recurrence?: ScalarEdit;
  reminderType?: ScalarEdit;

  // create_todo
  todoText?: ScalarEdit;
  due_date?: ScalarEdit;
  priority?: ScalarEdit;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

// Parse the raw ToolCall into an editable shape. All fields default
// to enabled=true; user can uncheck what they don't want committed.
function makeEdit(call: ToolCall): CallEdit {
  const input = (call.input ?? {}) as Record<string, unknown>;
  const base: CallEdit = {
    enabled: true,
    callName: call.name,
    originalInput: input,
  };

  switch (call.name) {
    case "create_person":
      return {
        ...base,
        name: { enabled: true, value: asString(input.name) },
        company: input.company
          ? { enabled: true, value: asString(input.company) }
          : undefined,
        role: input.role
          ? { enabled: true, value: asString(input.role) }
          : undefined,
        scope: input.scope
          ? { enabled: true, value: asString(input.scope) }
          : undefined,
        notes: input.notes
          ? { enabled: true, value: asString(input.notes) }
          : undefined,
        gift_idea: input.gift_idea
          ? { enabled: true, value: asString(input.gift_idea) }
          : undefined,
        how_we_met: input.how_we_met
          ? { enabled: true, value: asString(input.how_we_met) }
          : undefined,
        met_date: input.met_date
          ? { enabled: true, value: asString(input.met_date) }
          : undefined,
        met_location: input.met_location
          ? { enabled: true, value: asString(input.met_location) }
          : undefined,
        tags: arr<string>(input.tags).map((v) => ({ enabled: true, value: v })),
        phones: arr<PhoneEntry>(input.phones).map((v) => ({
          enabled: true,
          value: { label: asString(v.label) || "mobile", value: asString(v.value) },
        })),
        emails: arr<EmailEntry>(input.emails).map((v) => ({
          enabled: true,
          value: { label: asString(v.label) || "persönlich", value: asString(v.value) },
        })),
        addresses: arr<AddressEntry>(input.addresses).map((v) => ({
          enabled: true,
          value: {
            label: asString(v.label) || "zuhause",
            street: v.street ?? null,
            city: v.city ?? null,
            postal_code: v.postal_code ?? null,
            country: v.country ?? null,
          },
        })),
        socials: arr<SocialEntry>(input.socials).map((v) => ({
          enabled: true,
          value: {
            platform: asString(v.platform) || "andere",
            handle_or_url: asString(v.handle_or_url),
          },
        })),
        important_dates: arr<DateEntry>(input.important_dates).map((v) => ({
          enabled: true,
          value: {
            label: asString(v.label) || "andere",
            date: asString(v.date),
            remind: Boolean(v.remind),
          },
        })),
        relationships: arr<RelEntry>(input.relationships).map((v) => ({
          enabled: true,
          value: {
            related_person_name: asString(v.related_person_name),
            related_person_id: asString(v.related_person_id) || undefined,
            label: asString(v.label) || "andere",
          },
        })),
      };

    case "update_person":
      return {
        ...base,
        company: input.company !== undefined
          ? { enabled: true, value: asString(input.company) }
          : undefined,
        role: input.role !== undefined
          ? { enabled: true, value: asString(input.role) }
          : undefined,
        scope: input.scope !== undefined
          ? { enabled: true, value: asString(input.scope) }
          : undefined,
        notes: input.notes !== undefined
          ? { enabled: true, value: asString(input.notes) }
          : undefined,
        gift_idea: input.gift_idea !== undefined
          ? { enabled: true, value: asString(input.gift_idea) }
          : undefined,
        how_we_met: input.how_we_met !== undefined
          ? { enabled: true, value: asString(input.how_we_met) }
          : undefined,
        met_date: input.met_date !== undefined
          ? { enabled: true, value: asString(input.met_date) }
          : undefined,
        met_location: input.met_location !== undefined
          ? { enabled: true, value: asString(input.met_location) }
          : undefined,
        add_tags: arr<string>(input.add_tags).map((v) => ({ enabled: true, value: v })),
        add_phones: arr<PhoneEntry>(input.add_phones).map((v) => ({
          enabled: true,
          value: { label: asString(v.label) || "mobile", value: asString(v.value) },
        })),
        add_emails: arr<EmailEntry>(input.add_emails).map((v) => ({
          enabled: true,
          value: { label: asString(v.label) || "persönlich", value: asString(v.value) },
        })),
        add_addresses: arr<AddressEntry>(input.add_addresses).map((v) => ({
          enabled: true,
          value: {
            label: asString(v.label) || "zuhause",
            street: v.street ?? null,
            city: v.city ?? null,
            postal_code: v.postal_code ?? null,
            country: v.country ?? null,
          },
        })),
        add_socials: arr<SocialEntry>(input.add_socials).map((v) => ({
          enabled: true,
          value: {
            platform: asString(v.platform) || "andere",
            handle_or_url: asString(v.handle_or_url),
          },
        })),
        add_important_dates: arr<DateEntry>(input.add_important_dates).map((v) => ({
          enabled: true,
          value: {
            label: asString(v.label) || "andere",
            date: asString(v.date),
            remind: Boolean(v.remind),
          },
        })),
        add_relationships: arr<RelEntry>(input.add_relationships).map((v) => ({
          enabled: true,
          value: {
            related_person_name: asString(v.related_person_name),
            related_person_id: asString(v.related_person_id) || undefined,
            label: asString(v.label) || "andere",
          },
        })),
      };

    case "log_interaction":
      return {
        ...base,
        type: { enabled: true, value: asString(input.type) || "voice" },
        summary: input.summary !== undefined
          ? { enabled: true, value: asString(input.summary) }
          : undefined,
        sentiment: input.sentiment !== undefined
          ? { enabled: true, value: asString(input.sentiment) }
          : undefined,
        topics: arr<string>(input.topics).map((v) => ({ enabled: true, value: v })),
      };

    case "create_note":
      return {
        ...base,
        title: input.title !== undefined
          ? { enabled: true, value: asString(input.title) }
          : undefined,
        body: { enabled: true, value: asString(input.body) },
        noteTags: arr<string>(input.tags).map((v) => ({ enabled: true, value: v })),
      };

    case "create_reminder":
      return {
        ...base,
        text: { enabled: true, value: asString(input.text) },
        remind_at: { enabled: true, value: asString(input.remind_at) },
        recurrence: input.recurrence !== undefined
          ? { enabled: true, value: asString(input.recurrence) }
          : undefined,
        reminderType: input.type !== undefined
          ? { enabled: true, value: asString(input.type) }
          : undefined,
      };

    case "create_todo":
      return {
        ...base,
        todoText: { enabled: true, value: asString(input.text) },
        due_date: input.due_date !== undefined
          ? { enabled: true, value: asString(input.due_date) }
          : undefined,
        priority: input.priority !== undefined
          ? { enabled: true, value: asString(input.priority) }
          : undefined,
      };

    case "suggest_replies":
    case "query_people":
      return base; // filtered out before reaching this card
  }
}

// Reverse of makeEdit — produce a clean ToolCall input from the
// edited state. Disabled scalars are omitted (server defaults kick
// in); disabled array items are filtered. Carries through any keys
// from originalInput that the UI doesn't touch (e.g. id, person_id,
// person_ids, _person_name).
function applyEdit(edit: CallEdit): ToolCall {
  const out: Record<string, unknown> = {};

  // Carry through metadata + non-editable keys
  const passthrough: string[] = [
    "id",
    "_person_name",
    "person_id",
    "person_name",
    "person_ids",
    "person_names",
    "occurred_at",
  ];
  for (const k of passthrough) {
    if (edit.originalInput[k] !== undefined) {
      out[k] = edit.originalInput[k];
    }
  }

  function setIf(key: string, e: ScalarEdit | undefined) {
    if (e && e.enabled && e.value.trim()) out[key] = e.value.trim();
  }

  function setArr<T>(key: string, items: ItemEdit<T>[] | undefined, isEmpty: (v: T) => boolean) {
    if (!items) return;
    const filtered = items.filter((it) => it.enabled && !isEmpty(it.value));
    if (filtered.length) out[key] = filtered.map((it) => it.value);
  }

  switch (edit.callName) {
    case "create_person":
      setIf("name", edit.name);
      setIf("company", edit.company);
      setIf("role", edit.role);
      setIf("scope", edit.scope);
      setIf("notes", edit.notes);
      setIf("gift_idea", edit.gift_idea);
      setIf("how_we_met", edit.how_we_met);
      setIf("met_date", edit.met_date);
      setIf("met_location", edit.met_location);
      setArr("tags", edit.tags, (s) => !s.trim());
      setArr("phones", edit.phones, (p) => !p.value.trim());
      setArr("emails", edit.emails, (p) => !p.value.trim());
      setArr("addresses", edit.addresses, (a) => !(a.street?.trim() || a.city?.trim()));
      setArr("socials", edit.socials, (s) => !s.handle_or_url.trim());
      setArr("important_dates", edit.important_dates, (d) => !d.date.trim());
      // Relationships: drop entries without a name AND without an id —
      // the server can't resolve them either way. Label is required.
      setArr(
        "relationships",
        edit.relationships,
        (r) =>
          (!r.related_person_name.trim() && !r.related_person_id) ||
          !r.label.trim(),
      );
      break;
    case "update_person":
      setIf("company", edit.company);
      setIf("role", edit.role);
      setIf("scope", edit.scope);
      setIf("notes", edit.notes);
      setIf("gift_idea", edit.gift_idea);
      setIf("how_we_met", edit.how_we_met);
      setIf("met_date", edit.met_date);
      setIf("met_location", edit.met_location);
      setArr("add_tags", edit.add_tags, (s) => !s.trim());
      setArr("add_phones", edit.add_phones, (p) => !p.value.trim());
      setArr("add_emails", edit.add_emails, (p) => !p.value.trim());
      setArr("add_addresses", edit.add_addresses, (a) => !(a.street?.trim() || a.city?.trim()));
      setArr("add_socials", edit.add_socials, (s) => !s.handle_or_url.trim());
      setArr("add_important_dates", edit.add_important_dates, (d) => !d.date.trim());
      setArr(
        "add_relationships",
        edit.add_relationships,
        (r) =>
          (!r.related_person_name.trim() && !r.related_person_id) ||
          !r.label.trim(),
      );
      break;
    case "log_interaction":
      setIf("type", edit.type);
      setIf("summary", edit.summary);
      setIf("sentiment", edit.sentiment);
      setArr("topics", edit.topics, (s) => !s.trim());
      break;
    case "create_note":
      setIf("title", edit.title);
      setIf("body", edit.body);
      setArr("tags", edit.noteTags, (s) => !s.trim());
      break;
    case "create_reminder":
      setIf("text", edit.text);
      setIf("remind_at", edit.remind_at);
      setIf("recurrence", edit.recurrence);
      setIf("type", edit.reminderType);
      break;
    case "create_todo":
      // create_todo's primary field is `text`, mapped from `todoText`
      // to avoid colliding with create_reminder's `text` in the union.
      if (edit.todoText && edit.todoText.enabled && edit.todoText.value.trim()) {
        out.text = edit.todoText.value.trim();
      }
      setIf("due_date", edit.due_date);
      setIf("priority", edit.priority);
      break;
    case "suggest_replies":
    case "query_people":
      // not reached — filtered before render
      break;
  }

  return { name: edit.callName, input: out } as ToolCall;
}

// Top-level header label + icon per tool. Mirrors the old
// summarize() output but at the row level only.
function callHeader(edit: CallEdit): string {
  switch (edit.callName) {
    case "create_person":
      return "Neue Person";
    case "update_person": {
      const name = (edit.originalInput._person_name as string | undefined) ?? "Person";
      return `Update ${name}`;
    }
    case "log_interaction": {
      const labels: Record<string, string> = {
        meeting: "Treffen",
        call: "Anruf",
        email: "Email",
        note: "Notiz",
        voice: "Voice",
      };
      return labels[edit.type?.value ?? ""] ?? "Interaktion";
    }
    case "create_note":
      return "Notiz";
    case "create_reminder":
      return "Erinnerung";
    case "create_todo":
      return "Aufgabe";
    case "suggest_replies":
    case "query_people":
      return "";
  }
}

const inputCls =
  "h-7 flex-1 min-w-0 rounded border border-rule bg-paper px-2 text-xs text-ink-1 outline-none focus:border-action focus:ring-2 focus:ring-action/20 disabled:opacity-40";
const checkboxCls =
  "h-3.5 w-3.5 shrink-0 rounded border-rule accent-action";
const labelCls = "t-label shrink-0 w-16";
const badgeCls =
  "shrink-0 rounded border border-rule bg-paper-2 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-3";

interface RowProps {
  enabled: boolean;
  required?: boolean;
  onToggle?: (next: boolean) => void;
  label: string;
}

function ScalarRow({
  enabled,
  required,
  onToggle,
  label,
  children,
}: RowProps & { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {required ? (
        <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle?.(e.target.checked)}
          className={checkboxCls}
          aria-label={`${label} ${enabled ? "abwählen" : "übernehmen"}`}
        />
      )}
      <span className={labelCls}>{label}</span>
      {children}
    </div>
  );
}

function ArrayRow({
  enabled,
  onToggle,
  label,
  children,
}: {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onToggle(e.target.checked)}
        className={checkboxCls}
        aria-label={`${label} ${enabled ? "abwählen" : "übernehmen"}`}
      />
      <span className={labelCls}>{label}</span>
      {children}
    </div>
  );
}

export function ExtractionConfirmation({
  toolCalls,
  onConfirm,
  onCancel,
  pending,
}: {
  toolCalls: ToolCall[];
  onConfirm: (calls: ToolCall[]) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [edits, setEdits] = useState<CallEdit[]>(() => toolCalls.map(makeEdit));

  function patch(idx: number, fn: (e: CallEdit) => CallEdit) {
    setEdits((prev) => prev.map((e, i) => (i === idx ? fn(e) : e)));
  }

  function patchScalar(
    idx: number,
    key: keyof CallEdit,
    next: Partial<ScalarEdit>,
  ) {
    patch(idx, (e) => {
      const cur = e[key] as ScalarEdit | undefined;
      if (!cur) return e;
      return { ...e, [key]: { ...cur, ...next } } as CallEdit;
    });
  }

  function patchArrayItem<T>(
    idx: number,
    key: keyof CallEdit,
    itemIdx: number,
    next: Partial<ItemEdit<T>>,
  ) {
    patch(idx, (e) => {
      const cur = e[key] as ItemEdit<T>[] | undefined;
      if (!cur) return e;
      const updated = cur.map((it, i) =>
        i === itemIdx ? { ...it, ...next } : it,
      );
      return { ...e, [key]: updated } as CallEdit;
    });
  }

  function handleConfirm() {
    const result = edits
      .filter((e) => e.enabled)
      .map(applyEdit)
      // Drop empty calls (e.g. user unchecked everything inside)
      .filter((c) => Object.keys(c.input).length > 0);
    onConfirm(result);
  }

  return (
    <div className="w-full max-w-xl space-y-3 rounded border border-action/30 bg-action-soft p-4">
      <h3 className="t-label" style={{ color: "var(--action)" }}>
        ECHO will folgendes speichern
      </h3>

      <div className="space-y-3">
        {edits.map((edit, idx) => {
          if (edit.callName === "suggest_replies") return null;
          return (
            <div
              key={idx}
              className={`rounded border bg-paper p-3 transition ${
                edit.enabled ? "border-rule" : "border-rule opacity-50"
              }`}
            >
              {/* Call header — checkbox toggles the entire call */}
              <label className="flex items-center gap-2 pb-2">
                <input
                  type="checkbox"
                  checked={edit.enabled}
                  onChange={(e) =>
                    patch(idx, (cur) => ({ ...cur, enabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-rule accent-action"
                />
                <span className="t-label">{callHeader(edit)}</span>
              </label>

              {edit.enabled && (
                <div className="ml-6 space-y-1">
                  {/* create_person */}
                  {edit.callName === "create_person" && (
                    <>
                      {edit.name && (
                        <ScalarRow enabled required label="Name">
                          <input
                            type="text"
                            value={edit.name.value}
                            onChange={(e) =>
                              patchScalar(idx, "name", { value: e.target.value })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.company && (
                        <ScalarRow
                          enabled={edit.company.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "company", { enabled: en })
                          }
                          label="Firma"
                        >
                          <input
                            type="text"
                            value={edit.company.value}
                            disabled={!edit.company.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "company", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.role && (
                        <ScalarRow
                          enabled={edit.role.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "role", { enabled: en })
                          }
                          label="Rolle"
                        >
                          <input
                            type="text"
                            value={edit.role.value}
                            disabled={!edit.role.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "role", { value: e.target.value })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.notes && (
                        <ScalarRow
                          enabled={edit.notes.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "notes", { enabled: en })
                          }
                          label="Notiz"
                        >
                          <input
                            type="text"
                            value={edit.notes.value}
                            disabled={!edit.notes.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "notes", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.gift_idea && (
                        <ScalarRow
                          enabled={edit.gift_idea.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "gift_idea", { enabled: en })
                          }
                          label="Gift"
                        >
                          <input
                            type="text"
                            value={edit.gift_idea.value}
                            disabled={!edit.gift_idea.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "gift_idea", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.how_we_met && (
                        <ScalarRow
                          enabled={edit.how_we_met.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "how_we_met", { enabled: en })
                          }
                          label="Kennengelernt"
                        >
                          <input
                            type="text"
                            value={edit.how_we_met.value}
                            disabled={!edit.how_we_met.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "how_we_met", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.met_date && (
                        <ScalarRow
                          enabled={edit.met_date.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "met_date", { enabled: en })
                          }
                          label="Treff-Datum"
                        >
                          <input
                            type="text"
                            value={edit.met_date.value}
                            disabled={!edit.met_date.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "met_date", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.met_location && (
                        <ScalarRow
                          enabled={edit.met_location.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "met_location", { enabled: en })
                          }
                          label="Treff-Ort"
                        >
                          <input
                            type="text"
                            value={edit.met_location.value}
                            disabled={!edit.met_location.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "met_location", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.tags?.map((t, i) => (
                        <ArrayRow
                          key={`tag-${i}`}
                          enabled={t.enabled}
                          onToggle={(en) =>
                            patchArrayItem<string>(idx, "tags", i, { enabled: en })
                          }
                          label="Tag"
                        >
                          <input
                            type="text"
                            value={t.value}
                            disabled={!t.enabled}
                            onChange={(e) =>
                              patchArrayItem<string>(idx, "tags", i, {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ArrayRow>
                      ))}
                      {edit.phones?.map((p, i) => (
                        <ArrayRow
                          key={`phone-${i}`}
                          enabled={p.enabled}
                          onToggle={(en) =>
                            patchArrayItem<PhoneEntry>(idx, "phones", i, {
                              enabled: en,
                            })
                          }
                          label="Telefon"
                        >
                          <span className={badgeCls}>{p.value.label}</span>
                          <input
                            type="text"
                            value={p.value.value}
                            disabled={!p.enabled}
                            onChange={(e) =>
                              patchArrayItem<PhoneEntry>(idx, "phones", i, {
                                value: { ...p.value, value: e.target.value },
                              })
                            }
                            className={inputCls}
                          />
                        </ArrayRow>
                      ))}
                      {edit.emails?.map((m, i) => (
                        <ArrayRow
                          key={`email-${i}`}
                          enabled={m.enabled}
                          onToggle={(en) =>
                            patchArrayItem<EmailEntry>(idx, "emails", i, {
                              enabled: en,
                            })
                          }
                          label="Email"
                        >
                          <span className={badgeCls}>{m.value.label}</span>
                          <input
                            type="text"
                            value={m.value.value}
                            disabled={!m.enabled}
                            onChange={(e) =>
                              patchArrayItem<EmailEntry>(idx, "emails", i, {
                                value: { ...m.value, value: e.target.value },
                              })
                            }
                            className={inputCls}
                          />
                        </ArrayRow>
                      ))}
                      {edit.addresses?.map((a, i) => (
                        <ArrayRow
                          key={`addr-${i}`}
                          enabled={a.enabled}
                          onToggle={(en) =>
                            patchArrayItem<AddressEntry>(idx, "addresses", i, {
                              enabled: en,
                            })
                          }
                          label="Adresse"
                        >
                          <span className={badgeCls}>{a.value.label}</span>
                          <input
                            type="text"
                            placeholder="Straße"
                            value={a.value.street ?? ""}
                            disabled={!a.enabled}
                            onChange={(e) =>
                              patchArrayItem<AddressEntry>(idx, "addresses", i, {
                                value: { ...a.value, street: e.target.value },
                              })
                            }
                            className={inputCls}
                          />
                          <input
                            type="text"
                            placeholder="Ort"
                            value={a.value.city ?? ""}
                            disabled={!a.enabled}
                            onChange={(e) =>
                              patchArrayItem<AddressEntry>(idx, "addresses", i, {
                                value: { ...a.value, city: e.target.value },
                              })
                            }
                            className={`${inputCls} max-w-[8rem]`}
                          />
                        </ArrayRow>
                      ))}
                      {edit.socials?.map((s, i) => (
                        <ArrayRow
                          key={`social-${i}`}
                          enabled={s.enabled}
                          onToggle={(en) =>
                            patchArrayItem<SocialEntry>(idx, "socials", i, {
                              enabled: en,
                            })
                          }
                          label="Social"
                        >
                          <span className={badgeCls}>{s.value.platform}</span>
                          <input
                            type="text"
                            value={s.value.handle_or_url}
                            disabled={!s.enabled}
                            onChange={(e) =>
                              patchArrayItem<SocialEntry>(idx, "socials", i, {
                                value: {
                                  ...s.value,
                                  handle_or_url: e.target.value,
                                },
                              })
                            }
                            className={inputCls}
                          />
                        </ArrayRow>
                      ))}
                      {edit.important_dates?.map((d, i) => (
                        <ArrayRow
                          key={`date-${i}`}
                          enabled={d.enabled}
                          onToggle={(en) =>
                            patchArrayItem<DateEntry>(
                              idx,
                              "important_dates",
                              i,
                              { enabled: en },
                            )
                          }
                          label="Datum"
                        >
                          <input
                            type="text"
                            placeholder="Anlass"
                            value={d.value.label}
                            disabled={!d.enabled}
                            onChange={(e) =>
                              patchArrayItem<DateEntry>(
                                idx,
                                "important_dates",
                                i,
                                { value: { ...d.value, label: e.target.value } },
                              )
                            }
                            className={`${inputCls} max-w-[8rem]`}
                          />
                          <input
                            type="date"
                            value={d.value.date}
                            disabled={!d.enabled}
                            onChange={(e) =>
                              patchArrayItem<DateEntry>(
                                idx,
                                "important_dates",
                                i,
                                { value: { ...d.value, date: e.target.value } },
                              )
                            }
                            className={inputCls}
                          />
                        </ArrayRow>
                      ))}
                      {edit.relationships?.map((r, i) => (
                        <ArrayRow
                          key={`rel-${i}`}
                          enabled={r.enabled}
                          onToggle={(en) =>
                            patchArrayItem<RelEntry>(
                              idx,
                              "relationships",
                              i,
                              { enabled: en },
                            )
                          }
                          label="Beziehung"
                        >
                          <select
                            value={r.value.label}
                            disabled={!r.enabled}
                            onChange={(e) =>
                              patchArrayItem<RelEntry>(
                                idx,
                                "relationships",
                                i,
                                {
                                  value: { ...r.value, label: e.target.value },
                                },
                              )
                            }
                            className={`${inputCls} max-w-[7.5rem]`}
                          >
                            {RELATIONSHIP_LABEL_OPTIONS.includes(r.value.label)
                              ? null
                              : (
                                  <option value={r.value.label}>
                                    {r.value.label}
                                  </option>
                                )}
                            {RELATIONSHIP_LABEL_OPTIONS.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                          <span className="shrink-0 text-xs text-ink-4">
                            von
                          </span>
                          <input
                            type="text"
                            placeholder="Person"
                            value={r.value.related_person_name}
                            disabled={!r.enabled}
                            onChange={(e) =>
                              patchArrayItem<RelEntry>(
                                idx,
                                "relationships",
                                i,
                                {
                                  value: {
                                    ...r.value,
                                    related_person_name: e.target.value,
                                  },
                                },
                              )
                            }
                            className={inputCls}
                          />
                        </ArrayRow>
                      ))}
                    </>
                  )}

                  {/* update_person — same shape but only add_* arrays + scalar overrides */}
                  {edit.callName === "update_person" && (
                    <>
                      {edit.company && (
                        <ScalarRow
                          enabled={edit.company.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "company", { enabled: en })
                          }
                          label="Firma"
                        >
                          <input
                            type="text"
                            value={edit.company.value}
                            disabled={!edit.company.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "company", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.role && (
                        <ScalarRow
                          enabled={edit.role.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "role", { enabled: en })
                          }
                          label="Rolle"
                        >
                          <input
                            type="text"
                            value={edit.role.value}
                            disabled={!edit.role.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "role", { value: e.target.value })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.notes && (
                        <ScalarRow
                          enabled={edit.notes.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "notes", { enabled: en })
                          }
                          label="Notiz"
                        >
                          <input
                            type="text"
                            value={edit.notes.value}
                            disabled={!edit.notes.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "notes", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.gift_idea && (
                        <ScalarRow
                          enabled={edit.gift_idea.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "gift_idea", { enabled: en })
                          }
                          label="Gift"
                        >
                          <input
                            type="text"
                            value={edit.gift_idea.value}
                            disabled={!edit.gift_idea.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "gift_idea", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.how_we_met && (
                        <ScalarRow
                          enabled={edit.how_we_met.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "how_we_met", { enabled: en })
                          }
                          label="Kennengelernt"
                        >
                          <input
                            type="text"
                            value={edit.how_we_met.value}
                            disabled={!edit.how_we_met.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "how_we_met", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.met_date && (
                        <ScalarRow
                          enabled={edit.met_date.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "met_date", { enabled: en })
                          }
                          label="Treff-Datum"
                        >
                          <input
                            type="text"
                            value={edit.met_date.value}
                            disabled={!edit.met_date.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "met_date", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.met_location && (
                        <ScalarRow
                          enabled={edit.met_location.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "met_location", { enabled: en })
                          }
                          label="Treff-Ort"
                        >
                          <input
                            type="text"
                            value={edit.met_location.value}
                            disabled={!edit.met_location.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "met_location", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.add_tags?.map((t, i) => (
                        <ArrayRow
                          key={`addtag-${i}`}
                          enabled={t.enabled}
                          onToggle={(en) =>
                            patchArrayItem<string>(idx, "add_tags", i, {
                              enabled: en,
                            })
                          }
                          label="+ Tag"
                        >
                          <input
                            type="text"
                            value={t.value}
                            disabled={!t.enabled}
                            onChange={(e) =>
                              patchArrayItem<string>(idx, "add_tags", i, {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ArrayRow>
                      ))}
                      {edit.add_phones?.map((p, i) => (
                        <ArrayRow
                          key={`addphone-${i}`}
                          enabled={p.enabled}
                          onToggle={(en) =>
                            patchArrayItem<PhoneEntry>(idx, "add_phones", i, {
                              enabled: en,
                            })
                          }
                          label="+ Telefon"
                        >
                          <span className={badgeCls}>{p.value.label}</span>
                          <input
                            type="text"
                            value={p.value.value}
                            disabled={!p.enabled}
                            onChange={(e) =>
                              patchArrayItem<PhoneEntry>(idx, "add_phones", i, {
                                value: { ...p.value, value: e.target.value },
                              })
                            }
                            className={inputCls}
                          />
                        </ArrayRow>
                      ))}
                      {edit.add_emails?.map((m, i) => (
                        <ArrayRow
                          key={`addemail-${i}`}
                          enabled={m.enabled}
                          onToggle={(en) =>
                            patchArrayItem<EmailEntry>(idx, "add_emails", i, {
                              enabled: en,
                            })
                          }
                          label="+ Email"
                        >
                          <span className={badgeCls}>{m.value.label}</span>
                          <input
                            type="text"
                            value={m.value.value}
                            disabled={!m.enabled}
                            onChange={(e) =>
                              patchArrayItem<EmailEntry>(idx, "add_emails", i, {
                                value: { ...m.value, value: e.target.value },
                              })
                            }
                            className={inputCls}
                          />
                        </ArrayRow>
                      ))}
                      {edit.add_addresses?.map((a, i) => (
                        <ArrayRow
                          key={`addaddr-${i}`}
                          enabled={a.enabled}
                          onToggle={(en) =>
                            patchArrayItem<AddressEntry>(
                              idx,
                              "add_addresses",
                              i,
                              { enabled: en },
                            )
                          }
                          label="+ Adresse"
                        >
                          <span className={badgeCls}>{a.value.label}</span>
                          <input
                            type="text"
                            placeholder="Straße"
                            value={a.value.street ?? ""}
                            disabled={!a.enabled}
                            onChange={(e) =>
                              patchArrayItem<AddressEntry>(
                                idx,
                                "add_addresses",
                                i,
                                {
                                  value: { ...a.value, street: e.target.value },
                                },
                              )
                            }
                            className={inputCls}
                          />
                          <input
                            type="text"
                            placeholder="Ort"
                            value={a.value.city ?? ""}
                            disabled={!a.enabled}
                            onChange={(e) =>
                              patchArrayItem<AddressEntry>(
                                idx,
                                "add_addresses",
                                i,
                                {
                                  value: { ...a.value, city: e.target.value },
                                },
                              )
                            }
                            className={`${inputCls} max-w-[8rem]`}
                          />
                        </ArrayRow>
                      ))}
                      {edit.add_socials?.map((s, i) => (
                        <ArrayRow
                          key={`addsocial-${i}`}
                          enabled={s.enabled}
                          onToggle={(en) =>
                            patchArrayItem<SocialEntry>(
                              idx,
                              "add_socials",
                              i,
                              { enabled: en },
                            )
                          }
                          label="+ Social"
                        >
                          <span className={badgeCls}>{s.value.platform}</span>
                          <input
                            type="text"
                            value={s.value.handle_or_url}
                            disabled={!s.enabled}
                            onChange={(e) =>
                              patchArrayItem<SocialEntry>(
                                idx,
                                "add_socials",
                                i,
                                {
                                  value: {
                                    ...s.value,
                                    handle_or_url: e.target.value,
                                  },
                                },
                              )
                            }
                            className={inputCls}
                          />
                        </ArrayRow>
                      ))}
                      {edit.add_important_dates?.map((d, i) => (
                        <ArrayRow
                          key={`adddate-${i}`}
                          enabled={d.enabled}
                          onToggle={(en) =>
                            patchArrayItem<DateEntry>(
                              idx,
                              "add_important_dates",
                              i,
                              { enabled: en },
                            )
                          }
                          label="+ Datum"
                        >
                          <input
                            type="text"
                            placeholder="Anlass"
                            value={d.value.label}
                            disabled={!d.enabled}
                            onChange={(e) =>
                              patchArrayItem<DateEntry>(
                                idx,
                                "add_important_dates",
                                i,
                                {
                                  value: { ...d.value, label: e.target.value },
                                },
                              )
                            }
                            className={`${inputCls} max-w-[8rem]`}
                          />
                          <input
                            type="date"
                            value={d.value.date}
                            disabled={!d.enabled}
                            onChange={(e) =>
                              patchArrayItem<DateEntry>(
                                idx,
                                "add_important_dates",
                                i,
                                {
                                  value: { ...d.value, date: e.target.value },
                                },
                              )
                            }
                            className={inputCls}
                          />
                        </ArrayRow>
                      ))}
                      {edit.add_relationships?.map((r, i) => (
                        <ArrayRow
                          key={`addrel-${i}`}
                          enabled={r.enabled}
                          onToggle={(en) =>
                            patchArrayItem<RelEntry>(
                              idx,
                              "add_relationships",
                              i,
                              { enabled: en },
                            )
                          }
                          label="+ Beziehung"
                        >
                          <select
                            value={r.value.label}
                            disabled={!r.enabled}
                            onChange={(e) =>
                              patchArrayItem<RelEntry>(
                                idx,
                                "add_relationships",
                                i,
                                {
                                  value: { ...r.value, label: e.target.value },
                                },
                              )
                            }
                            className={`${inputCls} max-w-[7.5rem]`}
                          >
                            {RELATIONSHIP_LABEL_OPTIONS.includes(r.value.label)
                              ? null
                              : (
                                  <option value={r.value.label}>
                                    {r.value.label}
                                  </option>
                                )}
                            {RELATIONSHIP_LABEL_OPTIONS.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                          <span className="shrink-0 text-xs text-ink-4">
                            von
                          </span>
                          <input
                            type="text"
                            placeholder="Person"
                            value={r.value.related_person_name}
                            disabled={!r.enabled}
                            onChange={(e) =>
                              patchArrayItem<RelEntry>(
                                idx,
                                "add_relationships",
                                i,
                                {
                                  value: {
                                    ...r.value,
                                    related_person_name: e.target.value,
                                  },
                                },
                              )
                            }
                            className={inputCls}
                          />
                        </ArrayRow>
                      ))}
                    </>
                  )}

                  {/* log_interaction */}
                  {edit.callName === "log_interaction" && (
                    <>
                      {edit.summary && (
                        <ScalarRow
                          enabled={edit.summary.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "summary", { enabled: en })
                          }
                          label="Zusammenfassung"
                        >
                          <input
                            type="text"
                            value={edit.summary.value}
                            disabled={!edit.summary.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "summary", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.sentiment && (
                        <ScalarRow
                          enabled={edit.sentiment.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "sentiment", { enabled: en })
                          }
                          label="Stimmung"
                        >
                          <select
                            value={edit.sentiment.value}
                            disabled={!edit.sentiment.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "sentiment", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          >
                            <option value="positive">positiv</option>
                            <option value="neutral">neutral</option>
                            <option value="tense">angespannt</option>
                          </select>
                        </ScalarRow>
                      )}
                      {edit.topics?.map((t, i) => (
                        <ArrayRow
                          key={`topic-${i}`}
                          enabled={t.enabled}
                          onToggle={(en) =>
                            patchArrayItem<string>(idx, "topics", i, {
                              enabled: en,
                            })
                          }
                          label="Thema"
                        >
                          <input
                            type="text"
                            value={t.value}
                            disabled={!t.enabled}
                            onChange={(e) =>
                              patchArrayItem<string>(idx, "topics", i, {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ArrayRow>
                      ))}
                    </>
                  )}

                  {/* create_note */}
                  {edit.callName === "create_note" && (
                    <>
                      {edit.title && (
                        <ScalarRow
                          enabled={edit.title.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "title", { enabled: en })
                          }
                          label="Titel"
                        >
                          <input
                            type="text"
                            value={edit.title.value}
                            disabled={!edit.title.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "title", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.body && (
                        <ScalarRow
                          enabled={edit.body.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "body", { enabled: en })
                          }
                          label="Inhalt"
                        >
                          <input
                            type="text"
                            value={edit.body.value}
                            disabled={!edit.body.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "body", { value: e.target.value })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.noteTags?.map((t, i) => (
                        <ArrayRow
                          key={`ntag-${i}`}
                          enabled={t.enabled}
                          onToggle={(en) =>
                            patchArrayItem<string>(idx, "noteTags", i, {
                              enabled: en,
                            })
                          }
                          label="Tag"
                        >
                          <input
                            type="text"
                            value={t.value}
                            disabled={!t.enabled}
                            onChange={(e) =>
                              patchArrayItem<string>(idx, "noteTags", i, {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ArrayRow>
                      ))}
                    </>
                  )}

                  {/* create_reminder */}
                  {edit.callName === "create_reminder" && (
                    <>
                      {edit.text && (
                        <ScalarRow enabled required label="Text">
                          <input
                            type="text"
                            value={edit.text.value}
                            onChange={(e) =>
                              patchScalar(idx, "text", { value: e.target.value })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.remind_at && (
                        <ScalarRow enabled required label="Wann">
                          <input
                            type="datetime-local"
                            value={edit.remind_at.value.slice(0, 16)}
                            onChange={(e) =>
                              patchScalar(idx, "remind_at", {
                                value: e.target.value
                                  ? new Date(e.target.value).toISOString()
                                  : "",
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.recurrence && (
                        <ScalarRow
                          enabled={edit.recurrence.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "recurrence", { enabled: en })
                          }
                          label="Wiederh."
                        >
                          <select
                            value={edit.recurrence.value}
                            disabled={!edit.recurrence.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "recurrence", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          >
                            <option value="once">einmal</option>
                            <option value="weekly">wöchentlich</option>
                            <option value="monthly">monatlich</option>
                            <option value="yearly">jährlich</option>
                          </select>
                        </ScalarRow>
                      )}
                    </>
                  )}

                  {/* create_todo */}
                  {edit.callName === "create_todo" && (
                    <>
                      {edit.todoText && (
                        <ScalarRow enabled required label="Text">
                          <input
                            type="text"
                            value={edit.todoText.value}
                            onChange={(e) =>
                              patchScalar(idx, "todoText", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.due_date && (
                        <ScalarRow
                          enabled={edit.due_date.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "due_date", { enabled: en })
                          }
                          label="Fällig"
                        >
                          <input
                            type="date"
                            value={edit.due_date.value.slice(0, 10)}
                            disabled={!edit.due_date.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "due_date", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        </ScalarRow>
                      )}
                      {edit.priority && (
                        <ScalarRow
                          enabled={edit.priority.enabled}
                          onToggle={(en) =>
                            patchScalar(idx, "priority", { enabled: en })
                          }
                          label="Priorität"
                        >
                          <select
                            value={edit.priority.value}
                            disabled={!edit.priority.enabled}
                            onChange={(e) =>
                              patchScalar(idx, "priority", {
                                value: e.target.value,
                              })
                            }
                            className={inputCls}
                          >
                            <option value="low">niedrig</option>
                            <option value="medium">mittel</option>
                            <option value="high">hoch</option>
                          </select>
                        </ScalarRow>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-ink-3 hover:text-ink-1 disabled:opacity-50"
        >
          Verwerfen
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className="rounded border border-action bg-action px-3 py-1.5 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
        >
          {pending ? "Speichere…" : "Bestätigen"}
        </button>
      </div>
    </div>
  );
}
