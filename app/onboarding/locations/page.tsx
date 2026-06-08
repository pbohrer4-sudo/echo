import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StepIndicator } from "../step-indicator";
import { completeLocations, skipLocations } from "../actions";

const inputClass =
  "h-11 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20";

export default async function LocationsStep() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-8">
      <StepIndicator current="locations" />
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
          Wo bist du zu Hause?
        </h1>
        <p className="text-sm text-ink-3">
          Aktueller Wohnort + Herkunft. Hilft später, Nähe und gemeinsame Orte
          zu Kontakten zu erkennen.
        </p>
      </div>

      <form action={completeLocations} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="t-label">Aktueller Wohnort</span>
          <input
            type="text"
            name="current_location"
            placeholder="z.B. Regensburg"
            className={inputClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="t-label">Herkunft (optional)</span>
          <input
            type="text"
            name="home_location"
            placeholder="z.B. München"
            className={inputClass}
          />
        </label>

        <div className="flex items-center justify-between">
          <button
            type="submit"
            formAction={skipLocations}
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
