import { listAllOrganizationTags } from "@/lib/organizations";
import { createOrganization } from "../actions";
import { OrganizationForm } from "../organization-form";

export default async function NewOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; name?: string }>;
}) {
  const { error, name } = await searchParams;
  const existingTags = await listAllOrganizationTags();

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Neue Organisation</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Organisation anlegen
          </h1>
          <p className="text-sm text-ink-3">
            Name reicht zum Start — Branche, Website etc. lassen sich via
            Auto-Enrich befüllen.
          </p>
        </header>
        <OrganizationForm
          action={createOrganization}
          cancelHref="/organizations"
          existingTags={existingTags}
          initial={name ? { name } : undefined}
          error={error ? decodeURIComponent(error) : undefined}
        />
      </div>
    </div>
  );
}
