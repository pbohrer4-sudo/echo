import { listOrganizations } from "@/lib/organizations";
import { OrganizationsTable } from "./organizations-table";

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;
  const all = await listOrganizations();

  const activeTag = tag?.trim() || null;
  const filtered = activeTag
    ? all.filter((o) =>
        (o.tags ?? []).some(
          (t) => t.toLowerCase() === activeTag.toLowerCase(),
        ),
      )
    : all;

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Personal CRM</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Organisationen
          </h1>
          <p className="max-w-xl text-sm text-ink-3">
            Firmen, Studios, Vereine. Personen werden via „Firma" auf der
            Person-Seite hier angedockt — automatisch oder manuell.
          </p>
        </header>
        <OrganizationsTable
          orgs={filtered}
          activeTag={activeTag}
          totalCount={all.length}
        />
      </div>
    </div>
  );
}
