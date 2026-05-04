import Link from "next/link";
import { notFound } from "next/navigation";
import { getDealById, getPipelineById } from "@/lib/pipelines";
import { listPeople } from "@/lib/people";
import { listOrganizations } from "@/lib/organizations";
import { DealForm } from "@/components/deal-form";
import { updateDeal } from "../actions";
import { DealDeleteButton } from "./delete-button";

export default async function DealDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; did: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, did } = await params;
  const { error } = await searchParams;

  const [pipeline, deal, people, orgs] = await Promise.all([
    getPipelineById(id),
    getDealById(did),
    listPeople(),
    listOrganizations(),
  ]);
  if (!pipeline || !deal) notFound();

  const action = updateDeal.bind(null, id, did);

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-2xl space-y-8">
        <Link
          href={`/pipelines/${id}`}
          className="t-label inline-flex items-center hover:text-ink-1"
        >
          ← {pipeline.name}
        </Link>
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="t-label">{deal.status.toUpperCase()}</p>
            <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
              {deal.title}
            </h1>
          </div>
          <DealDeleteButton pipelineId={id} dealId={did} title={deal.title} />
        </header>

        <DealForm
          pipeline={pipeline}
          initial={deal}
          action={action}
          cancelHref={`/pipelines/${id}`}
          peopleOptions={people.map((p) => ({ id: p.id, name: p.name }))}
          orgsOptions={orgs.map((o) => ({ id: o.id, name: o.name }))}
          error={error ? decodeURIComponent(error) : undefined}
        />
      </div>
    </div>
  );
}
