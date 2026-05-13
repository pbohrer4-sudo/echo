import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { APP_CONFIG } from "@/lib/config";
import { StepIndicator } from "../step-indicator";
import { completeWelcome } from "../actions";

export default async function WelcomeStep() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Default-Name aus profiles.display_name oder email-local-part
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const defaultName =
    profile?.display_name ?? user.email?.split("@")[0] ?? "";

  return (
    <div className="space-y-8">
      <StepIndicator current="welcome" />
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
          Willkommen bei {APP_CONFIG.PUBLIC_NAME}.
        </h1>
        <p className="text-sm leading-relaxed text-ink-3">
          {APP_CONFIG.PUBLIC_NAME} ist dein persönliches CRM — ein Gedächtnis
          für Beziehungen. Wir richten es jetzt in fünf kurzen Schritten ein.
          Du kannst alles später ändern.
        </p>
      </div>

      <form action={completeWelcome} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="t-label">Wie sollen wir dich nennen?</span>
          <input
            type="text"
            name="display_name"
            defaultValue={defaultName}
            required
            placeholder="z.B. Patrick"
            className="h-11 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
          />
          <span className="text-[11px] text-ink-4">
            Das landet als dein Eigen-Profil — von dort baust du deine Welt auf.
          </span>
        </label>
        <div className="flex justify-end">
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
