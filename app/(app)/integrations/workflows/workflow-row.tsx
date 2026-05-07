"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { WorkflowStatus } from "@/lib/types";
import { deleteWorkflowInPlace, setWorkflowStatus } from "./actions";

const STATUS_TONE: Record<WorkflowStatus, string> = {
  draft: "border-rule bg-paper-2 text-ink-3",
  enabled: "border-action/40 bg-action-soft text-action",
  disabled: "border-bad/30 bg-bad/5 text-bad",
};

const STATUS_LABEL: Record<WorkflowStatus, string> = {
  draft: "Entwurf",
  enabled: "Aktiv",
  disabled: "Deaktiviert",
};

const STATUS_ORDER: WorkflowStatus[] = ["draft", "enabled", "disabled"];

interface Props {
  id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  nodeCount: number;
  edgeCount: number;
  updatedAt: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WorkflowRow({
  id,
  name,
  description,
  status,
  nodeCount,
  edgeCount,
  updatedAt,
}: Props) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-rule-soft px-4 py-4 last:border-0 hover:bg-paper-2">
      <Link href={`/integrations/workflows/${id}`} className="min-w-0 block">
        <p className="truncate text-sm font-medium text-ink-1">{name}</p>
        {description && (
          <p className="truncate text-xs text-ink-4">{description}</p>
        )}
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
          {nodeCount} Nodes · {edgeCount} Verbindungen
        </p>
      </Link>

      {/* Status segmented — click to cycle, dropdown to pick exact */}
      <div className="flex h-7 rounded border border-rule bg-paper p-0.5 text-[10px] font-mono uppercase tracking-wider">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              if (s === status) return;
              start(async () => {
                await setWorkflowStatus(id, s);
              });
            }}
            disabled={pending}
            className={`rounded px-2 transition-colors disabled:opacity-50 ${
              status === s ? STATUS_TONE[s] : "text-ink-4 hover:text-ink-1"
            }`}
            title={STATUS_LABEL[s]}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <span className="font-mono text-xs text-ink-3">
        {fmtDate(updatedAt)}
      </span>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label="Workflow löschen"
          title="Löschen"
          className="rounded border border-rule px-2 py-1 text-xs text-ink-4 transition hover:border-bad hover:text-bad"
        >
          ×
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              start(async () => {
                await deleteWorkflowInPlace(id);
              })
            }
            disabled={pending}
            className="rounded border border-bad bg-bad px-2 py-1 text-xs font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "…" : "Löschen"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded border border-rule px-2 py-1 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
          >
            Abbruch
          </button>
        </div>
      )}
    </li>
  );
}
