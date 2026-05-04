"use client";

import type { ToolCall } from "@/lib/tools";

function fmtDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function summarize(call: ToolCall): { icon: string; label: string; detail: string } {
  const input = call.input as Record<string, unknown>;
  switch (call.name) {
    case "create_person": {
      const parts: string[] = [];
      if (typeof input.name === "string") parts.push(input.name);
      if (typeof input.company === "string") parts.push(input.company);
      const extras = describePersonFields(input);
      const detail =
        [parts.join(" · "), extras].filter(Boolean).join(" — ") || "";
      return { icon: "person", label: "Neue Person", detail };
    }
    case "update_person": {
      const name = (input._person_name as string | undefined) ?? "Person";
      const extras = describeUpdateFields(input);
      return {
        icon: "update",
        label: `Update ${name}`,
        detail: extras || "(keine Änderung)",
      };
    }
    case "log_interaction": {
      const type = (input.type as string) ?? "interaction";
      const typeLabel: Record<string, string> = {
        meeting: "Treffen",
        call: "Anruf",
        email: "Email",
        note: "Notiz",
        voice: "Voice",
      };
      return {
        icon: "interaction",
        label: typeLabel[type] ?? type,
        detail: (input.summary as string) ?? "",
      };
    }
    case "create_note":
      return {
        icon: "note",
        label: "Notiz",
        detail: ((input.title as string) || (input.body as string) || "").slice(0, 120),
      };
    case "create_reminder":
      return {
        icon: "reminder",
        label: "Erinnerung",
        detail: `${input.text ?? ""} · ${fmtDateTime(input.remind_at as string | undefined)}`,
      };
    case "create_todo":
      return {
        icon: "todo",
        label: "Aufgabe",
        detail: (input.text as string) ?? "",
      };
    case "suggest_replies":
      // Filtered out before reaching this card; included here so the
      // switch is exhaustive over ToolName.
      return { icon: "reply", label: "Vorschläge", detail: "" };
  }
}

function describePersonFields(input: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof input.role === "string") parts.push(`Rolle: ${input.role}`);
  if (Array.isArray(input.tags) && input.tags.length)
    parts.push(`Tags: ${input.tags.join(", ")}`);
  if (Array.isArray(input.phones) && input.phones.length)
    parts.push(`${input.phones.length} Telefon`);
  if (Array.isArray(input.emails) && input.emails.length)
    parts.push(`${input.emails.length} Email`);
  if (Array.isArray(input.addresses) && input.addresses.length)
    parts.push(`${input.addresses.length} Adresse`);
  if (Array.isArray(input.socials) && input.socials.length)
    parts.push(`${input.socials.length} Social`);
  if (Array.isArray(input.important_dates) && input.important_dates.length)
    parts.push(`${input.important_dates.length} Datum`);
  if (typeof input.notes === "string" && input.notes) parts.push("Notiz");
  return parts.join(" · ");
}

function describeUpdateFields(input: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof input.company === "string") parts.push(`Firma: ${input.company}`);
  if (typeof input.role === "string") parts.push(`Rolle: ${input.role}`);
  if (typeof input.scope === "string") parts.push(`Scope: ${input.scope}`);
  if (typeof input.notes === "string") parts.push("Notiz aktualisiert");
  if (Array.isArray(input.add_tags) && input.add_tags.length)
    parts.push(`+Tags: ${input.add_tags.join(", ")}`);
  if (Array.isArray(input.add_phones) && input.add_phones.length)
    parts.push(`+${input.add_phones.length} Telefon`);
  if (Array.isArray(input.add_emails) && input.add_emails.length)
    parts.push(`+${input.add_emails.length} Email`);
  if (Array.isArray(input.add_addresses) && input.add_addresses.length)
    parts.push(`+${input.add_addresses.length} Adresse`);
  if (Array.isArray(input.add_socials) && input.add_socials.length)
    parts.push(`+${input.add_socials.length} Social`);
  if (
    Array.isArray(input.add_important_dates) &&
    input.add_important_dates.length
  )
    parts.push(`+${input.add_important_dates.length} Datum`);
  return parts.join(" · ");
}

export function ExtractionConfirmation({
  toolCalls,
  onConfirm,
  onCancel,
  pending,
}: {
  toolCalls: ToolCall[];
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="w-full max-w-xl space-y-4 rounded border border-action/30 bg-action-soft p-5">
      <h3 className="t-label" style={{ color: "var(--action)" }}>
        ECHO will folgendes speichern
      </h3>
      <ul className="space-y-2 text-sm">
        {toolCalls.map((c, i) => {
          const s = summarize(c);
          return (
            <li key={i} className="flex gap-4">
              <span className="t-label shrink-0 w-24">{s.label}</span>
              <span className="text-ink-1">{s.detail}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-end gap-2 pt-2">
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
          onClick={onConfirm}
          disabled={pending}
          className="rounded border border-action bg-action px-3 py-1.5 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
        >
          {pending ? "Speichere…" : "Bestätigen"}
        </button>
      </div>
    </div>
  );
}
