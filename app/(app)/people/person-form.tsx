"use client";

import Link from "next/link";
import { useState } from "react";
import type { Person, Scope } from "@/lib/types";

type Action = (formData: FormData) => void | Promise<void>;

const inputClass =
  "h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";

export function PersonForm({
  initial,
  action,
  cancelHref,
  error,
}: {
  initial?: Partial<Person>;
  action: Action;
  cancelHref: string;
  error?: string;
}) {
  const [scope, setScope] = useState<Scope>(initial?.scope ?? "both");

  return (
    <form action={action} className="space-y-6">
      <Field label="Name" required>
        <input
          name="name"
          required
          defaultValue={initial?.name ?? ""}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Firma">
          <input
            name="company"
            defaultValue={initial?.company ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Rolle">
          <input
            name="role"
            defaultValue={initial?.role ?? ""}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Scope">
        <input type="hidden" name="scope" value={scope} />
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
        label="Tags"
        hint="Komma-getrennt, z.B. Marketing, München, Vorstand"
      >
        <input
          name="tags"
          defaultValue={(initial?.tags ?? []).join(", ")}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Email">
          <input
            type="email"
            name="email"
            defaultValue={initial?.email ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Telefon">
          <input
            type="tel"
            name="phone"
            defaultValue={initial?.phone ?? ""}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Geburtstag">
          <input
            type="date"
            name="birthday"
            defaultValue={initial?.birthday ?? ""}
            className={inputClass}
          />
        </Field>
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
      </div>

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
