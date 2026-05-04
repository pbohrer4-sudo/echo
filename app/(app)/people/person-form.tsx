"use client";

import Link from "next/link";
import { useState } from "react";
import type { Person, Scope } from "@/lib/types";

type Action = (formData: FormData) => void | Promise<void>;

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
          className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-[#c8ff3e]"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Firma">
          <input
            name="company"
            defaultValue={initial?.company ?? ""}
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-[#c8ff3e]"
          />
        </Field>
        <Field label="Rolle">
          <input
            name="role"
            defaultValue={initial?.role ?? ""}
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-[#c8ff3e]"
          />
        </Field>
      </div>

      <Field label="Scope">
        <input type="hidden" name="scope" value={scope} />
        <div className="flex rounded-md border border-neutral-800 bg-neutral-950 p-0.5 text-xs">
          {(["work", "personal", "both"] as Scope[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`flex-1 rounded px-3 py-1.5 transition-colors ${
                scope === s
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {s === "work" ? "Beruflich" : s === "personal" ? "Privat" : "Beides"}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Tags" hint="Komma-getrennt, z.B. Marketing, München, Vorstand">
        <input
          name="tags"
          defaultValue={(initial?.tags ?? []).join(", ")}
          className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-[#c8ff3e]"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Email">
          <input
            type="email"
            name="email"
            defaultValue={initial?.email ?? ""}
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-[#c8ff3e]"
          />
        </Field>
        <Field label="Telefon">
          <input
            type="tel"
            name="phone"
            defaultValue={initial?.phone ?? ""}
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-[#c8ff3e]"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Geburtstag">
          <input
            type="date"
            name="birthday"
            defaultValue={initial?.birthday ?? ""}
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-[#c8ff3e]"
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
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-[#c8ff3e]"
          />
        </Field>
      </div>

      {error && <p className="text-sm text-red-400">Fehler: {error}</p>}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href={cancelHref}
          className="rounded-md border border-neutral-800 px-3 py-2 text-sm text-neutral-300 hover:border-neutral-600 hover:text-neutral-100"
        >
          Abbrechen
        </Link>
        <button
          type="submit"
          className="rounded-md bg-[#c8ff3e] px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-[#b6eb2c]"
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
      <span className="text-xs uppercase tracking-wider text-neutral-500">
        {label}
        {required && <span className="ml-1 text-[#c8ff3e]">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-neutral-600">{hint}</span>}
    </label>
  );
}
