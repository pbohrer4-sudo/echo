import {
  listAllOrganizationTags,
  listOrganizations,
} from "@/lib/organizations";
import { listOrganizationDuplicates } from "@/lib/duplicates";
import { OrganizationsTable } from "./organizations-table";
import { DuplicateBanner } from "@/components/duplicate-banner";

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;
  const [all, allTags, dupes] = await Promise.all([
    listOrganizations(),
    listAllOrganizationTags(),
    listOrganizationDuplicates(),
  ]);

  const activeTag = tag?.trim() || null;
  const filtered = activeTag
    ? all.filter((o) =>
        (o.tags ?? []).some(
          (t) => t.toLowerCase() === activeTag.toLowerCase(),
        ),
      )
    : all;
  const highCount = dupes.filter((d) => d.confidence === "high").length;

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
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
        <DuplicateBanner
          count={dupes.length}
          highCount={highCount}
          href="/organizations/duplicates"
          entity="Organisationen"
        />
        <OrganizationsTable
          orgs={filtered}
          activeTag={activeTag}
          totalCount={all.length}
          allTags={allTags}
        />
      </div>
    </div>
  );
}
