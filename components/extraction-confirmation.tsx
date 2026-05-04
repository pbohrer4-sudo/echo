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
  const input = call.input as Record<string, string | string[] | undefined>;
  switch (call.name) {
    case "create_person":
      return {
        icon: "person",
        label: "Neue Person",
        detail: [input.name, input.company]
          .filter(Boolean)
          .join(" · ") as string,
      };
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
  }
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
    <div className="w-full max-w-xl space-y-4 rounded-md border border-[#c8ff3e]/30 bg-[#c8ff3e]/5 p-5">
      <h3 className="text-xs uppercase tracking-widest text-[#c8ff3e]">
        ECHO will folgendes speichern
      </h3>
      <ul className="space-y-2 text-sm">
        {toolCalls.map((c, i) => {
          const s = summarize(c);
          return (
            <li key={i} className="flex gap-3">
              <span className="font-mono text-xs text-neutral-500">
                {s.label}
              </span>
              <span className="text-neutral-200">{s.detail}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md border border-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-600 hover:text-neutral-100 disabled:opacity-50"
        >
          Verwerfen
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="rounded-md bg-[#c8ff3e] px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-[#b6eb2c] disabled:opacity-50"
        >
          {pending ? "Speichere…" : "Bestätigen"}
        </button>
      </div>
    </div>
  );
}
