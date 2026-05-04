import { createClient } from "@/lib/supabase/server";
import { getDebriefContext } from "@/lib/debriefs";
import { DebriefFlow } from "@/components/debrief-flow";

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
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl space-y-10">
        <header className="space-y-2">
          <p className="t-label">Abendlicher Debrief</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Heute Abend
          </h1>
          <p className="text-sm text-ink-3">
            Sprich frei. ECHO strukturiert mit, du bestätigst pro Schritt.
            Ziel: 3 Minuten, hart cap bei 5.
          </p>
        </header>

        <DebriefFlow displayName={displayName} context={context} />
      </div>
    </div>
  );
}
