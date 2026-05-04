import Link from "next/link";
import { createPipeline } from "../actions";

const inputClass =
  "h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";

export default async function NewPipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Neue Pipeline</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Pipeline anlegen
          </h1>
          <p className="text-sm text-ink-3">
            Standard-6-Stufen-Setup wird befüllt — kannst du danach in den
            Settings beliebig anpassen.
          </p>
        </header>

        {error && (
          <p className="rounded border border-bad/30 bg-bad/5 px-4 py-2 text-sm text-bad">
            Fehler: {decodeURIComponent(error)}
          </p>
        )}

        <form action={createPipeline} className="space-y-5">
          <label className="block space-y-2">
            <span className="t-label">Name</span>
            <input
              name="name"
              required
              defaultValue="Sales-Pipeline"
              className={inputClass}
            />
          </label>
          <label className="block space-y-2">
            <span className="t-label">Beschreibung</span>
            <input name="description" className={inputClass} />
          </label>
          <label className="block space-y-2">
            <span className="t-label">Verknüpft mit</span>
            <select
              name="entity_type"
              defaultValue="both"
              className={`${inputClass} appearance-none`}
            >
              <option value="both">Personen + Organisationen</option>
              <option value="person">Nur Personen</option>
              <option value="organization">Nur Organisationen</option>
            </select>
          </label>
          <label className="block space-y-2">
            <span className="t-label">Default-Währung</span>
            <input
              name="default_currency"
              defaultValue="EUR"
              maxLength={3}
              className={`${inputClass} font-mono uppercase`}
            />
          </label>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/pipelines"
              className="rounded border border-rule px-4 py-2 text-sm text-ink-2 transition hover:border-ink-3 hover:text-ink-1"
            >
              Abbrechen
            </Link>
            <button
              type="submit"
              className="rounded border border-action bg-action px-4 py-2 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
            >
              Anlegen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
