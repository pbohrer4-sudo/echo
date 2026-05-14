// Dezenter Step-Indikator — 5 Dots, der aktuelle ist gefüllt + breiter,
// vorherige sind als „done" markiert. Bewusst nicht klickbar (Wizard
// soll linear durchlaufen — Skip ist explizit per Button).

import { ONBOARDING_STEPS, type OnboardingStep } from "@/lib/onboarding";

interface Props {
  current: OnboardingStep;
}

export function StepIndicator({ current }: Props) {
  const idx = ONBOARDING_STEPS.indexOf(current);
  return (
    <div className="mb-8 flex items-center gap-1.5" aria-label="Fortschritt">
      {ONBOARDING_STEPS.map((step, i) => {
        const isActive = i === idx;
        const isDone = i < idx;
        return (
          <span
            key={step}
            className={`h-1 rounded-full transition-all ${
              isActive
                ? "w-8 bg-action"
                : isDone
                  ? "w-4 bg-action/40"
                  : "w-4 bg-rule"
            }`}
            aria-current={isActive ? "step" : undefined}
            aria-label={`Schritt ${i + 1} von ${ONBOARDING_STEPS.length}`}
          />
        );
      })}
    </div>
  );
}
