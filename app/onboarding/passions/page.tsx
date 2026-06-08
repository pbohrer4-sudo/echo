import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StepIndicator } from "../step-indicator";
import { completePassions, skipPassions } from "../actions";
import { OnboardingChips } from "../onboarding-chips";

export default async function PassionsStep() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-8">
      <StepIndicator current="passions" />
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
          Deine Leidenschaften.
        </h1>
        <p className="text-sm text-ink-3">
          Identitätsstiftende Leidenschaften — was dich ausmacht, jenseits von
          Beruf. Maximal fünf, ganz bewusst: das Wesentliche.
        </p>
      </div>

      <form action={completePassions} className="space-y-6">
        <OnboardingChips
          name="passions"
          placeholder="z.B. Bergsteigen, Jazz, Kochen …"
          max={5}
          color="passion"
        />
        <div className="flex items-center justify-between">
          <button
            type="submit"
            formAction={skipPassions}
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
