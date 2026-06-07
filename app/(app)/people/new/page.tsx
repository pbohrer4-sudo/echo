import { QuickAddForm } from "./quick-add-form";
import { APP_CONFIG } from "@/lib/config";
import { listAllCircles } from "@/lib/circles";
import { createClient } from "@/lib/supabase/server";

// Quick-Add Person — Name + Sprache sind Pflicht, Rest optional. Voice-
// Capture vorbefüllt das Formular. Cluster-Block (Tags/Passions/Circles)
// wird als Draft erfasst und beim Submit zusammen mit der Person angelegt.

export default async function NewPersonPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const existingCircles = await listAllCircles();

  // Default contact language (profile setting) presets the required
  // language field so 90%-one-language users don't re-pick every time.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let defaultLanguage = "";
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("default_contact_language")
      .eq("id", user.id)
      .maybeSingle();
    defaultLanguage = (data?.default_contact_language as string | null) ?? "";
  }

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-2xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Neue Person</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Person anlegen
          </h1>
          <p className="text-sm text-ink-3">
            Nur Name ist Pflicht. Den Rest entdeckt {APP_CONFIG.PUBLIC_NAME} über
            die Zeit — oder du füllst nach auf der Detail-Seite.
          </p>
        </header>
        <QuickAddForm
          error={error ? decodeURIComponent(error) : undefined}
          existingCircles={existingCircles}
          defaultLanguage={defaultLanguage}
        />
      </div>
    </div>
  );
}
