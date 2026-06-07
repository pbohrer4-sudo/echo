"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  type CustomFieldDef,
  type CustomFieldType,
} from "@/lib/custom-fields";
import {
  createCustomField,
  removeCustomField,
} from "./actions";

const inputClass =
  "h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";

export function CustomFieldsManager({
  initialDefs,
}: {
  initialDefs: CustomFieldDef[];
}) {
  const [defs, setDefs] = useState<CustomFieldDef[]>(initialDefs);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [options, setOptions] = useState("");

  function create() {
    setError(null);
    const fd = new FormData();
    fd.set("label", label);
    fd.set("type", type);
    if (type === "dropdown") fd.set("options", options);
    startTransition(async () => {
      const res = await createCustomField(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Optimistic local append — id is server-minted, so reload state by
      // re-fetching is overkill; just push a placeholder and trust the
      // revalidate to reconcile on next navigation. Simpler: clear inputs;
      // the page revalidatePath refreshes the server list on next render.
      setLabel("");
      setOptions("");
      setType("text");
      // Reflect immediately without a full def id round-trip:
      setDefs((prev) => [
        ...prev,
        {
          id: `pending_${prev.length}`,
          label: label.trim(),
          type,
          options:
            type === "dropdown"
              ? options.split(/[\n,]/).map((o) => o.trim()).filter(Boolean)
              : undefined,
        },
      ]);
    });
  }

  function remove(id: string) {
    setError(null);
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const res = await removeCustomField(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDefs((prev) => prev.filter((d) => d.id !== id));
    });
  }

  return (
    <div className="space-y-8">
      {/* Existing defs */}
      <section className="space-y-2">
        <h2 className="t-label">Angelegte Felder</h2>
        {defs.length === 0 ? (
          <p className="text-sm text-ink-3">Noch keine eigenen Felder.</p>
        ) : (
          <ul className="divide-y divide-rule-soft overflow-hidden rounded border border-rule bg-paper">
            {defs.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-1">
                    {d.label}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
                    {CUSTOM_FIELD_TYPE_LABELS[d.type]}
                    {d.type === "dropdown" && d.options?.length
                      ? ` · ${d.options.join(", ")}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(d.id)}
                  disabled={pending || d.id.startsWith("pending_")}
                  aria-label={`Feld ${d.label} löschen`}
                  className="grid h-8 w-8 place-items-center rounded text-ink-3 transition hover:bg-bad/10 hover:text-bad disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Create new */}
      <section className="space-y-3 rounded border border-rule bg-paper-2 p-4">
        <h2 className="t-label">Neues Feld</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-ink-3">Bezeichnung</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="z.B. Lieblingswein, Schuhgröße, VIP"
              className={inputClass}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-ink-3">Typ</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as CustomFieldType)}
              className={inputClass}
            >
              {CUSTOM_FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CUSTOM_FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {type === "dropdown" && (
          <label className="space-y-1">
            <span className="text-xs text-ink-3">
              Optionen (eine pro Zeile oder Komma-getrennt)
            </span>
            <textarea
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              rows={3}
              placeholder={"Gold\nSilber\nBronze"}
              className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
            />
          </label>
        )}
        <button
          type="button"
          onClick={create}
          disabled={pending || !label.trim()}
          className="rounded bg-action px-3 py-2 text-sm text-paper transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "…" : "Feld anlegen"}
        </button>
        {error && (
          <p className="rounded border border-bad/40 bg-bad/10 p-2 text-sm text-bad">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
