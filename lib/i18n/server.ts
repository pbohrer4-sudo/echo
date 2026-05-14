// Server-side i18n: liest die User-Sprache aus profiles.language
// und gibt einen gebundenen t()-Closure zurück. Kein Caching damit
// Sprach-Switches in den Settings sofort greifen.

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LOCALE, t, type Locale, type TranslationKey } from "./dict";

export async function getLocale(): Promise<Locale> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_LOCALE;
  const { data } = await supabase
    .from("profiles")
    .select("language")
    .eq("id", user.id)
    .maybeSingle();
  const raw = (data?.language ?? "").toString().toLowerCase();
  return raw === "en" ? "en" : "de";
}

// Gebundener t() für eine Render-Session — Page lädt einmal die
// Locale, ruft dann mehrmals t().
export function makeT(locale: Locale) {
  return (key: TranslationKey | string) => t(key, locale);
}

// Convenience: holt die Locale + liefert direkt einen t()-Closure.
export async function getT(): Promise<{
  t: (key: TranslationKey | string) => string;
  locale: Locale;
}> {
  const locale = await getLocale();
  return { t: makeT(locale), locale };
}
