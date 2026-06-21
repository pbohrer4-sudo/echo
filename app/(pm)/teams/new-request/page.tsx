import Link from "next/link";
import { getOrCreateWorkspace } from "@/lib/pm/workspace";
import { listDepartments } from "@/lib/pm/departments";
import { createCrossDeptRequest } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string; to?: string }>;
}) {
  const { error, from, to } = await searchParams;
  const ws = await getOrCreateWorkspace();
  const departments = await listDepartments(ws.id);

  if (departments.length < 2) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Neue Anfrage</h1>
        <p className="text-sm text-ink-3">
          Du brauchst mindestens zwei Abteilungen, um eine abteilungsübergreifende
          Anfrage zu stellen.
        </p>
        <Link href="/teams" className="text-sm text-action hover:underline">
          ← Zu den Abteilungen
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Anfrage an eine andere Abteilung
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          Die Anfrage landet im Posteingang der ausführenden Abteilung.
          {ws.ai_enabled
            ? " Ein KI-Agent erstellt automatisch ein erstes Briefing und einen Antwortentwurf."
            : ""}
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      <form action={createCrossDeptRequest} className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="text-ink-3">Von (anfragend)</span>
            <select
              name="requester_department_id"
              defaultValue={from ?? ""}
              required
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Abteilung wählen
              </option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-ink-3">An (ausführend)</span>
            <select
              name="owner_department_id"
              defaultValue={to ?? ""}
              required
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Abteilung wählen
              </option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-sm">
          <span className="text-ink-3">Titel</span>
          <input
            name="title"
            required
            className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            placeholder="z.B. Erklärvideo für Messeauftritt erstellen"
          />
        </label>

        <label className="text-sm">
          <span className="text-ink-3">Beschreibung / Kontext</span>
          <textarea
            name="description"
            rows={5}
            className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            placeholder="Was wird gebraucht, für wen, bis wann, welche Rahmenbedingungen?"
          />
        </label>

        <div className="grid grid-cols-3 gap-4">
          <label className="text-sm">
            <span className="text-ink-3">Aufwand (Std., geschätzt)</span>
            <input
              name="effort_estimate_hours"
              type="number"
              min="0"
              step="0.5"
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
              placeholder="z.B. 16"
            />
          </label>
          <label className="text-sm">
            <span className="text-ink-3">Priorität</span>
            <select
              name="priority"
              defaultValue="medium"
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              <option value="low">Niedrig</option>
              <option value="medium">Mittel</option>
              <option value="high">Hoch</option>
              <option value="urgent">Dringend</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-ink-3">Wunschtermin</span>
            <input
              name="due_date"
              type="date"
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            />
          </label>
        </div>

        {ws.ai_enabled ? (
          <label className="flex items-center gap-2 text-sm text-ink-3">
            <input
              type="checkbox"
              name="auto_brief"
              defaultChecked={ws.ai_auto_briefing}
              value="on"
            />
            KI-Briefing automatisch erstellen
          </label>
        ) : null}

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-action px-4 py-2 text-sm font-medium text-paper hover:opacity-90"
          >
            Anfrage senden
          </button>
          <Link
            href="/teams"
            className="rounded-lg border border-rule px-4 py-2 text-sm hover:border-action"
          >
            Abbrechen
          </Link>
        </div>
      </form>
    </div>
  );
}
