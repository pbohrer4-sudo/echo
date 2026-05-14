"use client";

// Client-side i18n: Context-Provider der die Locale vom Server-Layout
// runterreicht + ein useT()-Hook für Client-Components.

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, t, type Locale, type TranslationKey } from "./dict";

const Ctx = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useLocale(): Locale {
  return useContext(Ctx);
}

export function useT(): (key: TranslationKey | string) => string {
  const locale = useContext(Ctx);
  return (key) => t(key, locale);
}
