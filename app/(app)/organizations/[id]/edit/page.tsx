import { notFound } from "next/navigation";
import {
  getOrganizationById,
  listAllOrganizationTags,
} from "@/lib/organizations";
import { updateOrganization } from "../../actions";
import { OrganizationForm } from "../../organization-form";

export default async function EditOrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const [org, existingTags] = await Promise.all([
    getOrganizationById(id),
    listAllOrganizationTags(),
  ]);
  if (!org) notFound();

  const action = updateOrganization.bind(null, id);

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Bearbeiten</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            {org.name}
          </h1>
        </header>
        <OrganizationForm
          initial={org}
          action={action}
          cancelHref={`/organizations/${id}`}
          existingTags={existingTags}
          error={error ? decodeURIComponent(error) : undefined}
        />
      </div>
    </div>
  );
}
