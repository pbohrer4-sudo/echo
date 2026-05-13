// Onboarding-State (Briefing v3 §Onboarding-Wizard).
//
// Wird in profiles.onboarding_progress als jsonb gespeichert. Schema
// bewusst minimal — wir tracken welche Schritte fertig sind und
// wann die Person das Onboarding insgesamt abgeschlossen hat. Das
// reicht für die Gate-Logik im AppLayout (redirect wenn !completed)
// und um die Wizard-Steps idempotent wiederholbar zu machen.

import { createClient } from "@/lib/supabase/server";

export const ONBOARDING_STEPS = [
  "welcome",
  "profile",
  "byok",
  "first_person",
  "done",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingProgress {
  completed_steps: OnboardingStep[];
  completed_at: string | null;
  // skipped speichert die User-Choices, falls jemand byok/first_person
  // explizit übersprungen hat — fürs Admin-Tracking + späteres Nudge.
  skipped: OnboardingStep[];
}

export function emptyProgress(): OnboardingProgress {
  return { completed_steps: [], completed_at: null, skipped: [] };
}

export function isComplete(p: OnboardingProgress | null | undefined): boolean {
  if (!p) return false;
  return Boolean(p.completed_at);
}

// Nächster Schritt nach Reihenfolge ONBOARDING_STEPS. Schritte die in
// completed_steps ODER skipped stehen, werden als „erledigt" gewertet
// fürs Routing. Liefert 'done' wenn alles durch ist.
export function nextStep(p: OnboardingProgress): OnboardingStep {
  const done = new Set([...p.completed_steps, ...p.skipped]);
  for (const step of ONBOARDING_STEPS) {
    if (!done.has(step)) return step;
  }
  return "done";
}

export async function getOnboardingProgress(): Promise<OnboardingProgress> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return emptyProgress();
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_progress")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !data) return emptyProgress();
  return normalize(data.onboarding_progress);
}

function normalize(raw: unknown): OnboardingProgress {
  if (!raw || typeof raw !== "object") return emptyProgress();
  const r = raw as Record<string, unknown>;
  const validSteps = new Set<OnboardingStep>(ONBOARDING_STEPS);
  const filterSteps = (input: unknown): OnboardingStep[] => {
    if (!Array.isArray(input)) return [];
    const out: OnboardingStep[] = [];
    for (const v of input) {
      if (typeof v === "string" && validSteps.has(v as OnboardingStep)) {
        out.push(v as OnboardingStep);
      }
    }
    return out;
  };
  return {
    completed_steps: filterSteps(r.completed_steps),
    completed_at:
      typeof r.completed_at === "string" ? r.completed_at : null,
    skipped: filterSteps(r.skipped),
  };
}

export async function markStepDone(
  step: OnboardingStep,
  options: { skipped?: boolean } = {},
): Promise<OnboardingProgress> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return emptyProgress();

  const current = await getOnboardingProgress();

  const completed_steps = new Set(current.completed_steps);
  const skipped = new Set(current.skipped);
  if (options.skipped) skipped.add(step);
  else completed_steps.add(step);

  // 'done' wird als finaler Schritt explizit erst gesetzt wenn der User
  // den letzten Screen bestätigt — completed_at sperrt den Gate offen.
  const next: OnboardingProgress = {
    completed_steps: Array.from(completed_steps),
    skipped: Array.from(skipped),
    completed_at:
      step === "done" ? new Date().toISOString() : current.completed_at,
  };

  await supabase
    .from("profiles")
    .update({
      onboarding_progress: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  return next;
}

export async function resetOnboarding(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("profiles")
    .update({
      onboarding_progress: emptyProgress(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
}
