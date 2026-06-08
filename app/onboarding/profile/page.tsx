import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LANGUAGES } from "@/lib/types";
import { StepIndicator } from "../step-indicator";
import { completeProfile } from "../actions";

export default async function ProfileStep() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, language, debrief_time")
    .eq("id", user.id)
    .maybeSingle();

  // Sane defaults — Browser-Timezone auf Client würde feiner sein,
  // aber für SSR reicht Europe/Berlin als deutsche-App-Default.
  const tz = profile?.timezone ?? "Europe/Berlin";
  const lang = profile?.language ?? "de";
  const debriefRaw = (profile?.debrief_time ?? "21:00") as string;
  // debrief_time kommt als 'HH:MM:SS' aus Postgres — wir wollen 'HH:MM' im input.
  const debrief = debriefRaw.slice(0, 5);

  return (
    <div className="space-y-8">
      <StepIndicator current="profile" />
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
          Ein paar Basics.
        </h1>
        <p className="text-sm text-ink-3">
          Zeitzone für korrekte Geburtstage und Reminders. Debrief-Zeit ist
          dein abendlicher Wecker — wir fragen dich dann nach dem Tag.
        </p>
      </div>

      <form action={completeProfile} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="t-label">Zeitzone</span>
          <select
            name="timezone"
            defaultValue={tz}
            className="h-11 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
          >
            <option value="Europe/Berlin">Europe/Berlin (DE)</option>
            <option value="Europe/Vienna">Europe/Vienna (AT)</option>
            <option value="Europe/Zurich">Europe/Zurich (CH)</option>
            <option value="Europe/London">Europe/London (UK)</option>
            <option value="America/New_York">America/New York (US-East)</option>
            <option value="America/Los_Angeles">America/LA (US-West)</option>
            <option value="UTC">UTC</option>
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="t-label">Sprache</span>
          <select
            name="language"
            defaultValue={lang}
            className="h-11 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="t-label">Debrief-Zeit (abendlicher Wecker)</span>
          <input
            type="time"
            name="debrief_time"
            defaultValue={debrief}
            className="h-11 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="t-label">Deine Hauptsprache</span>
            <select
              name="primary_language"
              defaultValue="Deutsch"
              className="h-11 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="t-label">Zweitsprache (optional)</span>
            <select
              name="secondary_language"
              defaultValue=""
              className="h-11 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
            >
              <option value="">—</option>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>

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
