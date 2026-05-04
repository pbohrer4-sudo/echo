import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPipelineById,
  listDealsForPipeline,
} from "@/lib/pipelines";
import { getPeopleMap } from "@/lib/inbox";
import { createClient } from "@/lib/supabase/server";
import { PipelineKanban } from "@/components/pipeline-kanban";

function fmtCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toLocaleString("de-DE")} ${currency}`;
  }
}

async function getOrgsMap(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("id, name")
    .in("id", ids);
  const map: Record<string, string> = {};
  for (const r of (data ?? []) as { id: string; name: string }[]) {
    map[r.id] = r.name;
  }
  return map;
}

export default async function PipelineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [pipeline, deals] = await Promise.all([
    getPipelineById(id),
    listDealsForPipeline(id),
  ]);
  if (!pipeline) notFound();

  const personIds = Array.from(
    new Set(deals.map((d) => d.person_id).filter(Boolean) as string[]),
  );
  const orgIds = Array.from(
    new Set(deals.map((d) => d.organization_id).filter(Boolean) as string[]),
  );
  const [peopleMap, orgsMap] = await Promise.all([
    getPeopleMap(personIds),
    getOrgsMap(orgIds),
  ]);

  const openDeals = deals.filter((d) => d.status === "open");
  const wonDeals = deals.filter((d) => d.status === "won");
  const openValue = openDeals.reduce(
    (s, d) => s + Number(d.value ?? 0),
    0,
  );
  const wonValue = wonDeals.reduce((s, d) => s + Number(d.value ?? 0), 0);

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Link
              href="/pipelines"
              className="t-label inline-flex items-center hover:text-ink-1"
            >
              ← Pipelines
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
              {pipeline.name}
            </h1>
            {pipeline.description && (
              <p className="text-sm text-ink-3">{pipeline.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/pipelines/${id}/settings`}
              className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-ink-3 hover:text-ink-1"
            >
              Settings
            </Link>
            <Link
              href={`/pipelines/${id}/deals/new`}
              className="rounded border border-action bg-action px-3 py-1.5 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
            >
              + Deal
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Deals" value={String(deals.length)} />
          <Stat label="Open" value={String(openDeals.length)} />
          <Stat
            label="Pipeline-Wert"
            value={fmtCurrency(openValue, pipeline.default_currency)}
          />
          <Stat
            label="Won"
            value={fmtCurrency(wonValue, pipeline.default_currency)}
          />
        </div>

        <PipelineKanban
          pipeline={pipeline}
          deals={deals}
          peopleMap={peopleMap}
          orgsMap={orgsMap}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-rule bg-paper p-4">
      <p className="t-label">{label}</p>
      <p className="mt-1 font-serif text-xl tracking-tight text-ink-1">
        {value}
      </p>
    </div>
  );
}
