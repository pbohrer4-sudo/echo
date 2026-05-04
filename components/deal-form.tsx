"use client";

import Link from "next/link";
import { useState } from "react";
import type { Deal, Pipeline } from "@/lib/types";

type Action = (formData: FormData) => void | Promise<void>;

const inputClass =
  "h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";

interface PersonOption {
  id: string;
  name: string;
}
interface OrgOption {
  id: string;
  name: string;
}

export function DealForm({
  pipeline,
  initial,
  action,
  cancelHref,
  error,
  peopleOptions,
  orgsOptions,
}: {
  pipeline: Pipeline;
  initial?: Partial<Deal>;
  action: Action;
  cancelHref: string;
  error?: string;
  peopleOptions: PersonOption[];
  orgsOptions: OrgOption[];
}) {
  const stages = [...pipeline.stages].sort((a, b) => a.order - b.order);
  const initialStage = initial?.stage_id ?? stages[0]?.id ?? "";

  const [stageId, setStageId] = useState(initialStage);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>(
    initial?.field_values ?? {},
  );

  return (
    <form action={action} className="space-y-8">
      <input
        type="hidden"
        name="field_values_json"
        value={JSON.stringify(fieldValues)}
      />

      <Section label="Deal">
        <Field label="Titel" required>
          <input
            name="title"
            required
            defaultValue={initial?.title ?? ""}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Stage">
            <select
              name="stage_id"
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className={`${inputClass} appearance-none`}
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              name="status"
              defaultValue={initial?.status ?? "open"}
              className={`${inputClass} appearance-none`}
            >
              <option value="open">Open</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section label="Verknüpfung">
        {pipeline.entity_type !== "organization" && (
          <Field label="Person">
            <select
              name="person_id"
              defaultValue={initial?.person_id ?? ""}
              className={`${inputClass} appearance-none`}
            >
              <option value="">—</option>
              {peopleOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {pipeline.entity_type !== "person" && (
          <Field label="Organisation">
            <select
              name="organization_id"
              defaultValue={initial?.organization_id ?? ""}
              className={`${inputClass} appearance-none`}
            >
              <option value="">—</option>
              {orgsOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </Section>

      <Section label="Kommerz">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Wert">
            <input
              type="number"
              step="0.01"
              name="value"
              defaultValue={initial?.value ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Währung">
            <input
              name="currency"
              defaultValue={initial?.currency ?? pipeline.default_currency}
              maxLength={3}
              className={`${inputClass} font-mono uppercase`}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Erwarteter Abschluss">
            <input
              type="date"
              name="expected_close_date"
              defaultValue={initial?.expected_close_date ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Wahrscheinlichkeit (%)">
            <input
              type="number"
              min={0}
              max={100}
              name="probability"
              defaultValue={initial?.probability ?? ""}
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      {pipeline.field_definitions.length > 0 && (
        <Section label="Custom Fields">
          {pipeline.field_definitions.map((f) => (
            <Field key={f.key} label={f.label}>
              {f.type === "select" ? (
                <select
                  value={String(fieldValues[f.key] ?? "")}
                  onChange={(e) =>
                    setFieldValues({
                      ...fieldValues,
                      [f.key]: e.target.value,
                    })
                  }
                  className={`${inputClass} appearance-none`}
                >
                  <option value="">—</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  rows={3}
                  value={String(fieldValues[f.key] ?? "")}
                  onChange={(e) =>
                    setFieldValues({
                      ...fieldValues,
                      [f.key]: e.target.value,
                    })
                  }
                  className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none focus:border-action"
                />
              ) : (
                <input
                  type={
                    f.type === "number" || f.type === "currency"
                      ? "number"
                      : f.type === "date"
                        ? "date"
                        : f.type === "url"
                          ? "url"
                          : "text"
                  }
                  value={String(fieldValues[f.key] ?? "")}
                  onChange={(e) =>
                    setFieldValues({
                      ...fieldValues,
                      [f.key]: e.target.value,
                    })
                  }
                  className={inputClass}
                />
              )}
            </Field>
          ))}
        </Section>
      )}

      <Section label="Notizen">
        <textarea
          name="notes"
          defaultValue={initial?.notes ?? ""}
          rows={4}
          placeholder="Hintergrund, nächste Schritte, Stakeholder."
          className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none focus:border-action"
        />
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="section-head">
        <span className="t-label">{label}</span>
        <span className="rule" />
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="t-label">
        {label}
        {required && <span className="ml-1 text-action">*</span>}
      </span>
      {children}
    </label>
  );
}
