import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonById } from "@/lib/people";
import { buildPersonGraph } from "@/lib/graph";
import { PersonGraphCanvas } from "./person-graph";

export const dynamic = "force-dynamic";

export default async function PersonGraphPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const person = await getPersonById(id);
  if (!person) notFound();

  const graph = await buildPersonGraph(id);

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Link
              href={`/people/${id}`}
              className="t-label inline-flex items-center hover:text-ink-1"
            >
              ← {person.name}
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-1">
              Beziehungsgraph
            </h1>
            <p className="text-sm text-ink-3">
              Verbindungen über Beziehungen, Kreise, Organisation, Orte,
              Passionen und Interessen. Klick auf einen Knoten, um den Graphen
              auf diese Person zu zentrieren.
            </p>
          </div>
        </div>

        {!graph || graph.edges.length === 0 ? (
          <p className="rounded border border-rule bg-paper-2 px-4 py-8 text-center text-sm text-ink-3">
            Noch keine Verbindungen gefunden. Lege Beziehungen, Kreise oder
            gemeinsame Interessen an, damit der Graph etwas zeigt.
          </p>
        ) : (
          <PersonGraphCanvas graph={graph} />
        )}
      </div>
    </div>
  );
}
