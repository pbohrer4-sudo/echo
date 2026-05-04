import Link from "next/link";
import { notFound } from "next/navigation";
import { getPipelineById } from "@/lib/pipelines";
import { listPeople } from "@/lib/people";
import { listOrganizations } from "@/lib/organizations";
import { DealForm } from "@/components/deal-form";
import { createDeal } from "../actions";

export default async function NewDealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [pipeline, people, orgs] = await Promise.all([
    getPipelineById(id),
    listPeople(),
    listOrganizations(),
  ]);
  if (!pipeline) notFound();

  const action = createDeal.bind(null, id);

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-2xl space-y-8">
        <Link
          href={`/pipelines/${id}`}
          className="t-label inline-flex items-center hover:text-ink-1"
        >
          ← {pipeline.name}
        </Link>
        <header className="space-y-2">
          <p className="t-label">Neuer Deal</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Deal anlegen
          </h1>
        </header>

        <DealForm
          pipeline={pipeline}
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
