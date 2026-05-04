import Link from "next/link";
import { notFound } from "next/navigation";
import { getPipelineById } from "@/lib/pipelines";
import { updatePipelineSettings } from "../../actions";
import { PipelineSettingsForm } from "@/components/pipeline-settings-form";

export default async function PipelineSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const pipeline = await getPipelineById(id);
  if (!pipeline) notFound();

  const action = updatePipelineSettings.bind(null, id);

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <Link
          href={`/pipelines/${id}`}
          className="t-label inline-flex items-center hover:text-ink-1"
        >
          ← {pipeline.name}
        </Link>
        <header className="space-y-2">
          <p className="t-label">Settings</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            {pipeline.name} konfigurieren
          </h1>
          <p className="text-sm text-ink-3">
            Stufen, Custom Fields, Verknüpfung. Bestehende Deals
            behalten ihre stage_id auch wenn du Stufen umbenennst.
          </p>
        </header>

        {error && (
          <p className="rounded border border-bad/30 bg-bad/5 px-4 py-2 text-sm text-bad">
            Fehler: {decodeURIComponent(error)}
          </p>
        )}

        <PipelineSettingsForm pipeline={pipeline} action={action} />
      </div>
    </div>
  );
}
