"use client";

import { useTransition } from "react";
import {
  modelsForCapabilities,
  type CatalogModel,
  type ModelCapability,
  type TaskId,
} from "@/lib/model-catalog";
import { setTaskModel } from "./actions";

export function TaskPreferenceRow({
  taskId,
  taskLabel,
  taskDescription,
  taskRequires,
  defaultModelId,
  currentModelId,
}: {
  taskId: TaskId;
  taskLabel: string;
  taskDescription: string;
  taskRequires: readonly ModelCapability[];
  defaultModelId: string;
  currentModelId: string;
}) {
  const [pending, start] = useTransition();
  const eligible: CatalogModel[] = modelsForCapabilities(taskRequires);
  const effectiveId = currentModelId || defaultModelId;
  const isOverride = currentModelId && currentModelId !== defaultModelId;

  return (
    <li className="grid grid-cols-[1.4fr_minmax(0,1fr)_auto] items-center gap-4 border-b border-rule-soft px-4 py-3 last:border-0">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-medium text-ink-1">{taskLabel}</p>
          {isOverride && (
            <span
              className="rounded border border-action/40 bg-action-soft px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-action"
              title={`Default wäre ${defaultModelId}`}
            >
              Override
            </span>
          )}
        </div>
        <p className="text-xs text-ink-3">{taskDescription}</p>
      </div>

      <select
        value={effectiveId}
        disabled={pending || eligible.length === 0}
        onChange={(e) => {
          const next = e.target.value === defaultModelId ? "" : e.target.value;
          start(async () => {
            await setTaskModel(taskId, next);
          });
        }}
        className="h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20 disabled:opacity-50"
      >
        {eligible.length === 0 && <option value="">— keine passenden —</option>}
        {eligible.map((m) => (
          <option key={m.id} value={m.id} disabled={!m.available}>
            {m.name}
            {!m.available && " (geplant)"}
          </option>
        ))}
      </select>

      {isOverride && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => setTaskModel(taskId, ""))}
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 transition hover:text-ink-1 disabled:opacity-50"
        >
          Default
        </button>
      )}
    </li>
  );
}
