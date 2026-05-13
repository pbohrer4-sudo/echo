import { StepIndicator } from "../step-indicator";
import { completeByok, skipByok } from "../actions";

export default async function ByokStep() {
  return (
    <div className="space-y-8">
      <StepIndicator current="byok" />
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
          Eigene API-Keys?
        </h1>
        <p className="text-sm leading-relaxed text-ink-3">
          Optional. Du kannst Claude (für Voice + AI) und ElevenLabs (für
          Sprachsynthese) auch über deine eigenen Keys laufen lassen — dann
          zahlst du direkt bei Anthropic / ElevenLabs und überspringst unsere
          Kostenstellen. Wenn du das jetzt nicht weißt, einfach
          „Überspringen" — die System-Keys greifen.
        </p>
      </div>

      <form action={completeByok} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="t-label">Anthropic / Claude</span>
          <input
            type="password"
            name="claude_key"
            placeholder="sk-ant-…"
            autoComplete="off"
            className="h-11 w-full rounded border border-rule bg-paper px-3 font-mono text-xs text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
          />
          <span className="text-[11px] text-ink-4">
            Anlegen bei console.anthropic.com → API Keys
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="t-label">ElevenLabs</span>
          <input
            type="password"
            name="elevenlabs_key"
            placeholder="xi-…"
            autoComplete="off"
            className="h-11 w-full rounded border border-rule bg-paper px-3 font-mono text-xs text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
          />
          <span className="text-[11px] text-ink-4">
            Anlegen bei elevenlabs.io → Profile → API
          </span>
        </label>

        <div className="flex items-center justify-between gap-3">
          <button
            type="submit"
            formAction={skipByok}
            className="text-xs text-ink-3 transition hover:text-ink-1"
          >
            Überspringen
          </button>
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded border border-action bg-action px-5 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
          >
            Speichern →
          </button>
        </div>
      </form>
    </div>
  );
}
