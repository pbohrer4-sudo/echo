"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { Deal, Pipeline } from "@/lib/types";
import { moveDealToStage } from "@/app/(app)/pipelines/[id]/deals/actions";

function fmtCurrency(value: number | null, currency: string | null): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currency ?? "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toLocaleString("de-DE")} ${currency ?? ""}`;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
  });
}

const STATUS_TONE: Record<string, string> = {
  open: "border-rule",
  won: "border-good/40 bg-good/5",
  lost: "border-bad/30 bg-bad/5",
};

interface PersonOption {
  id: string;
  name: string;
}
interface OrgOption {
  id: string;
  name: string;
}

export function PipelineKanban({
  pipeline,
  deals,
  peopleMap,
  orgsMap,
}: {
  pipeline: Pipeline;
  deals: Deal[];
  peopleMap: Record<string, string>;
  orgsMap: Record<string, string>;
}) {
  const stages = [...pipeline.stages].sort((a, b) => a.order - b.order);
  const dealsByStage = new Map<string, Deal[]>();
  for (const s of stages) dealsByStage.set(s.id, []);
  for (const d of deals) {
    if (!dealsByStage.has(d.stage_id)) dealsByStage.set(d.stage_id, []);
    dealsByStage.get(d.stage_id)!.push(d);
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="flex gap-3"
        style={{
          minWidth: `${stages.length * 280}px`,
        }}
      >
        {stages.map((stage) => {
          const list = dealsByStage.get(stage.id) ?? [];
          const total = list.reduce(
            (sum, d) => sum + Number(d.value ?? 0),
            0,
          );
          return (
            <div
              key={stage.id}
              className="flex w-64 shrink-0 flex-col rounded border border-rule bg-paper-2"
            >
              <div className="border-b border-rule px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-ink-1">
                    {stage.name}
                  </p>
                  <span className="t-label">{list.length}</span>
                </div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
                  {fmtCurrency(total, pipeline.default_currency)}
                  {stage.probability != null && ` · ${stage.probability}%`}
                  {stage.outcome && ` · ${stage.outcome}`}
                </p>
              </div>

              <ul className="flex-1 space-y-2 p-2">
                {list.length === 0 ? (
                  <li className="rounded border border-dashed border-rule-soft px-2 py-4 text-center text-[11px] italic text-ink-4">
                    leer
                  </li>
                ) : (
                  list.map((d) => (
                    <DealCard
                      key={d.id}
                      pipeline={pipeline}
                      deal={d}
                      stages={stages}
                      personName={
                        d.person_id ? peopleMap[d.person_id] ?? null : null
                      }
                      orgName={
                        d.organization_id
                          ? orgsMap[d.organization_id] ?? null
                          : null
                      }
                    />
                  ))
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DealCard({
  pipeline,
  deal,
  stages,
  personName,
  orgName,
}: {
  pipeline: Pipeline;
  deal: Deal;
  stages: Pipeline["stages"];
  personName: string | null;
  orgName: string | null;
}) {
  const [pending, start] = useTransition();
  const [stageId, setStageId] = useState(deal.stage_id);

  function handleMove(next: string) {
    if (next === stageId) return;
    setStageId(next);
    start(async () => {
      try {
        await moveDealToStage(pipeline.id, deal.id, next);
      } catch {
        setStageId(deal.stage_id);
      }
    });
  }

  return (
    <li
      className={`rounded border bg-paper p-2.5 ${STATUS_TONE[deal.status] ?? "border-rule"} ${pending ? "opacity-60" : ""}`}
    >
      <Link
        href={`/pipelines/${pipeline.id}/deals/${deal.id}`}
        className="block"
      >
        <p className="truncate text-sm font-medium text-ink-1 hover:text-action">
          {deal.title}
        </p>
        {(personName || orgName) && (
          <p className="truncate font-mono text-[10px] uppercase tracking-wider text-ink-4">
            {[personName, orgName].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
          <span className="font-mono text-ink-2">
            {fmtCurrency(deal.value, deal.currency ?? pipeline.default_currency)}
          </span>
          <span className="font-mono text-ink-4">
            {fmtDate(deal.expected_close_date)}
          </span>
        </div>
      </Link>
      <select
        value={stageId}
        onChange={(e) => handleMove(e.target.value)}
        disabled={pending}
        className="mt-2 h-6 w-full rounded border border-rule bg-paper-2 px-1.5 text-[11px] text-ink-2 hover:border-action"
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            → {s.name}
          </option>
        ))}
      </select>
    </li>
  );
}

export type { PersonOption, OrgOption };
