"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  Pipeline,
  PipelineEntityType,
  PipelineFieldDef,
  PipelineFieldType,
  PipelineStage,
} from "@/lib/types";

type Action = (formData: FormData) => void | Promise<void>;

const inputClass =
  "h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";

const FIELD_TYPES: PipelineFieldType[] = [
  "text",
  "textarea",
  "number",
  "currency",
  "date",
  "select",
  "url",
];

function genStageId(): string {
  return `stage_${Math.random().toString(36).slice(2, 7)}`;
}

function genFieldKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || `field_${Math.random().toString(36).slice(2, 6)}`;
}

export function PipelineSettingsForm({
  pipeline,
  action,
}: {
  pipeline: Pipeline;
  action: Action;
}) {
  const [name, setName] = useState(pipeline.name);
  const [description, setDescription] = useState(pipeline.description ?? "");
  const [entity, setEntity] = useState<PipelineEntityType>(
    pipeline.entity_type,
  );
  const [currency, setCurrency] = useState(pipeline.default_currency);
  const [stages, setStages] = useState<PipelineStage[]>(pipeline.stages);
  const [fields, setFields] = useState<PipelineFieldDef[]>(
    pipeline.field_definitions,
  );

  function moveStage(index: number, dir: -1 | 1) {
    const next = [...stages];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setStages(next.map((s, i) => ({ ...s, order: i })));
  }

  return (
    <form action={action} className="space-y-10">
      <input type="hidden" name="stages_json" value={JSON.stringify(stages)} />
      <input type="hidden" name="fields_json" value={JSON.stringify(fields)} />

      <Section label="Pipeline">
        <Field label="Name">
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Beschreibung">
          <input
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Verknüpft mit">
            <select
              name="entity_type"
              value={entity}
              onChange={(e) => setEntity(e.target.value as PipelineEntityType)}
              className={`${inputClass} appearance-none`}
            >
              <option value="both">Personen + Organisationen</option>
              <option value="person">Nur Personen</option>
              <option value="organization">Nur Organisationen</option>
            </select>
          </Field>
          <Field label="Default-Währung">
            <input
              name="default_currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              maxLength={3}
              className={`${inputClass} font-mono uppercase`}
            />
          </Field>
        </div>
      </Section>

      <Section
        label="Stufen"
        hint="Reihenfolge bestimmt die Spalten im Kanban. Outcome 'won' / 'lost' setzt den Deal-Status automatisch beim Verschieben."
      >
        <ul className="space-y-2">
          {stages.map((s, i) => (
            <li
              key={s.id}
              className="grid grid-cols-[24px_1fr_120px_120px_140px_auto] items-center gap-2 rounded border border-rule bg-paper p-2"
            >
              <span className="font-mono text-[10px] text-ink-4">
                {i + 1}
              </span>
              <input
                value={s.name}
                onChange={(e) => {
                  const next = [...stages];
                  next[i] = { ...next[i], name: e.target.value };
                  setStages(next);
                }}
                className="h-7 rounded border border-rule bg-paper px-2 text-sm"
                placeholder="Stage-Name"
              />
              <input
                type="number"
                value={s.probability ?? ""}
                onChange={(e) => {
                  const next = [...stages];
                  next[i] = {
                    ...next[i],
                    probability:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  };
                  setStages(next);
                }}
                placeholder="P %"
                className="h-7 rounded border border-rule bg-paper px-2 text-xs"
              />
              <select
                value={s.outcome ?? ""}
                onChange={(e) => {
                  const next = [...stages];
                  next[i] = {
                    ...next[i],
                    outcome:
                      e.target.value === "won" || e.target.value === "lost"
                        ? e.target.value
                        : undefined,
                  };
                  setStages(next);
                }}
                className="h-7 rounded border border-rule bg-paper px-2 text-xs"
              >
                <option value="">Open</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </select>
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => moveStage(i, -1)}
                  className="rounded border border-rule px-2 py-0.5 text-xs text-ink-2 hover:border-ink-3"
                  disabled={i === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveStage(i, 1)}
                  className="rounded border border-rule px-2 py-0.5 text-xs text-ink-2 hover:border-ink-3"
                  disabled={i === stages.length - 1}
                >
                  ↓
                </button>
              </div>
              <button
                type="button"
                onClick={() => setStages(stages.filter((_, j) => j !== i))}
                className="ml-1 text-ink-4 hover:text-bad"
                aria-label="Entfernen"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            setStages([
              ...stages,
              {
                id: genStageId(),
                name: "Neue Stufe",
                order: stages.length,
              },
            ])
          }
          className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 hover:border-action hover:text-action"
        >
          + Stufe
        </button>
      </Section>

      <Section
        label="Custom Fields"
        hint="Frei definierbar — z.B. Quelle (Select), Konkurrent (Text), Next-Step (Text)."
      >
        {fields.length === 0 ? (
          <p className="text-xs italic text-ink-4">
            Keine Custom Fields. Standard-Felder (Wert, Datum, Wahrscheinlichkeit, Notizen) sind immer vorhanden.
          </p>
        ) : (
          <ul className="space-y-2">
            {fields.map((f, i) => (
              <li
                key={i}
                className="grid grid-cols-[1fr_140px_140px_auto] items-start gap-2 rounded border border-rule bg-paper p-2"
              >
                <div>
                  <input
                    value={f.label}
                    onChange={(e) => {
                      const next = [...fields];
                      const newLabel = e.target.value;
                      next[i] = {
                        ...next[i],
                        label: newLabel,
                        key: f.key || genFieldKey(newLabel),
                      };
                      setFields(next);
                    }}
                    onBlur={(e) => {
                      if (!fields[i].key && e.target.value) {
                        const next = [...fields];
                        next[i] = {
                          ...next[i],
                          key: genFieldKey(e.target.value),
                        };
                        setFields(next);
                      }
                    }}
                    placeholder="Label"
                    className="h-7 w-full rounded border border-rule bg-paper px-2 text-sm"
                  />
                  <input
                    value={f.key}
                    onChange={(e) => {
                      const next = [...fields];
                      next[i] = { ...next[i], key: e.target.value };
                      setFields(next);
                    }}
                    placeholder="key"
                    className="mt-1 h-6 w-full rounded border border-rule-soft bg-paper px-2 font-mono text-[11px]"
                  />
                </div>
                <select
                  value={f.type}
                  onChange={(e) => {
                    const next = [...fields];
                    next[i] = {
                      ...next[i],
                      type: e.target.value as PipelineFieldType,
                    };
                    setFields(next);
                  }}
                  className="h-7 self-start rounded border border-rule bg-paper px-2 text-xs"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {f.type === "select" ? (
                  <input
                    value={(f.options ?? []).join(", ")}
                    onChange={(e) => {
                      const next = [...fields];
                      next[i] = {
                        ...next[i],
                        options: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      };
                      setFields(next);
                    }}
                    placeholder="Option1, Option2"
                    className="h-7 self-start rounded border border-rule bg-paper px-2 text-xs"
                  />
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => setFields(fields.filter((_, j) => j !== i))}
                  className="self-start text-ink-4 hover:text-bad"
                  aria-label="Entfernen"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() =>
            setFields([
              ...fields,
              { key: "", label: "", type: "text" },
            ])
          }
          className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 hover:border-action hover:text-action"
        >
          + Feld
        </button>
      </Section>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href={`/pipelines/${pipeline.id}`}
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
    <section className="space-y-3">
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
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="t-label">{label}</span>
      {children}
    </label>
  );
}
