import { getOrCreateWorkspace } from "@/lib/pm/workspace";
import { updateAiSettings } from "../actions";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const ws = await getOrCreateWorkspace();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="mt-1 text-sm text-ink-3">
          Steuere, welche KI-Funktionen automatisch laufen. Was du hier
          ausschaltest, bleibt genau so, wie du es eingibst.
        </p>
      </div>

      {saved && (
        <p className="rounded-lg border border-good/40 bg-good/5 px-3 py-2 text-sm text-ink-2">
          Gespeichert.
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      <form action={updateAiSettings} className="space-y-4">
        <fieldset className="space-y-4 rounded-xl border border-rule bg-paper p-5">
          <legend className="px-1 text-sm font-semibold">KI-Funktionen</legend>

          <Toggle
            name="ai_enabled"
            defaultChecked={ws.ai_enabled}
            title="KI aktiviert (Hauptschalter)"
            desc="Wenn aus, läuft keine KI - alle KI-Vorschläge und -Schaltflächen werden ausgeblendet. Der Hub funktioniert vollständig manuell."
          />

          <div className="border-t border-rule-soft pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-4">
              Automatische Aktionen (nur wenn KI aktiviert)
            </p>
            <div className="space-y-4">
              <Toggle
                name="ai_auto_briefing"
                defaultChecked={ws.ai_auto_briefing}
                title="Auto-Briefing für eingehende Anfragen"
                desc="Erstellt automatisch ein Briefing und einen Antwortentwurf, sobald eine abteilungsübergreifende Anfrage eingeht. Aus: die Anfrage bleibt unverändert, ein Briefing kann manuell ausgelöst werden."
              />
              <Toggle
                name="ai_auto_filing"
                defaultChecked={ws.ai_auto_filing}
                title="Auto-Ablagevorschlag für Dokumente"
                desc="Schlägt beim Hinzufügen eines Dokuments automatisch SharePoint-Ordner und Dateinamen vor. Aus: das Dokument wird genau so gespeichert, wie du es eingibst."
              />
            </div>
          </div>
        </fieldset>

        <button
          type="submit"
          className="rounded-lg bg-action px-4 py-2 text-sm font-medium text-paper hover:opacity-90"
        >
          Speichern
        </button>
      </form>
    </div>
  );
}

function Toggle({
  name,
  defaultChecked,
  title,
  desc,
}: {
  name: string;
  defaultChecked: boolean;
  title: string;
  desc: string;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--action)]"
      />
      <span>
        <span className="block text-sm font-medium text-ink-1">{title}</span>
        <span className="mt-0.5 block text-xs text-ink-3">{desc}</span>
      </span>
    </label>
  );
}
