import { createClient } from "@/lib/supabase/server";
import { getDebriefContext } from "@/lib/debriefs";
import { AlarmClock } from "@/components/alarm-clock";
import { DebriefTrigger } from "@/components/debrief-trigger";

export default async function DebriefPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName =
    user?.user_metadata?.display_name ??
    user?.email?.split("@")[0] ??
    "Patrick";

  const context = await getDebriefContext();

  return (
    <div className="px-6 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-xl space-y-8">
        <header className="space-y-1 text-center">
          <p className="t-label">Gute Nacht</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-1">
            Wecker für morgen
          </h1>
        </header>

        {/* Hero: alarm clock — primary surface, set time + snooze + sound */}
        <AlarmClock />

        {/* Subtle: debrief CTA below — supporting role, no auto-talk */}
        <div className="pt-4">
          <DebriefTrigger displayName={displayName} context={context} />
        </div>
      </div>
    </div>
  );
}
