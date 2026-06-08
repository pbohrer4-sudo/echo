import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StepIndicator } from "../step-indicator";
import { completeInterests, skipInterests } from "../actions";
import { OnboardingChips } from "../onboarding-chips";

export default async function InterestsStep() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-8">
      <StepIndicator current="interests" />
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
          Was bewegt dich?
        </h1>
        <p className="text-sm text-ink-3">
          Themen + Skills, die dich bewegen — Sport, Musik, Fachgebiete. Gut,
          um Gemeinsamkeiten mit anderen zu finden. Tippe ein Interesse und
          drücke Enter.
        </p>
      </div>

      <form action={completeInterests} className="space-y-6">
        <OnboardingChips
          name="interests"
          placeholder="z.B. Longevity, Klettern, Web3, Klassik …"
        />
        <div className="flex items-center justify-between">
          <button
            type="submit"
            formAction={skipInterests}
            className="text-sm text-ink-3 transition hover:text-ink-1"
          >
            Überspringen
          </button>
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded border border-action bg-action px-5 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
          >
            Weiter →
          </button>
        </div>
      </form>
    </div>
  );
}
