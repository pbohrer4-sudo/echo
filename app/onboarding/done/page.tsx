import { APP_CONFIG } from "@/lib/config";
import { StepIndicator } from "../step-indicator";
import { completeOnboarding } from "../actions";

export default async function DoneStep() {
  return (
    <div className="space-y-8">
      <StepIndicator current="done" />
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
          Du bist drin.
        </h1>
        <p className="text-sm leading-relaxed text-ink-3">
          {APP_CONFIG.PUBLIC_NAME} wartet jetzt auf dich. Drei Ideen wo du
          weiter machst:
        </p>
        <ul className="space-y-2 text-sm text-ink-2">
          <li className="flex items-baseline gap-2">
            <span className="text-action">→</span>
            <span>
              <strong className="text-ink-1">Heute-Dashboard</strong> —
              Geburtstage, Reminders, wer überfällig ist. Dein Tages-Anker.
            </span>
          </li>
          <li className="flex items-baseline gap-2">
            <span className="text-action">→</span>
            <span>
              <strong className="text-ink-1">Voice</strong> — sprich rein
              was du gerade erlebt hast. „Treffen mit Marvin, hat ein Kind
              bekommen, Pricing bis Mittwoch." {APP_CONFIG.PUBLIC_NAME} legt
              automatisch Notizen + Reminders an.
            </span>
          </li>
          <li className="flex items-baseline gap-2">
            <span className="text-action">→</span>
            <span>
              <strong className="text-ink-1">Personen</strong> — Tabelle mit
              allen, filterbar nach Kreis, Kanal, Ort. Drag-and-Drop Spalten
              wie Attio.
            </span>
          </li>
        </ul>
      </div>

      <form action={completeOnboarding}>
        <button
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center rounded border border-action bg-action px-5 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
        >
          Los geht's →
        </button>
      </form>
    </div>
  );
}
