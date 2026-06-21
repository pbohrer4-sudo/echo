// Central branding / configuration constants for the Cross-Dept Hub.
//
// PUBLIC_NAME is what users see in the UI. It is overridable via the
// NEXT_PUBLIC_APP_NAME env var so a rebrand needs no code change.

export const APP_CONFIG = {
  // Internal code name — used in identifiers, never user-facing.
  CODE_NAME: "cross-dept-hub",

  // User-facing — overridable per ENV.
  PUBLIC_NAME: process.env.NEXT_PUBLIC_APP_NAME || "Cross-Dept",
  PUBLIC_TAGLINE:
    process.env.NEXT_PUBLIC_APP_TAGLINE ||
    "Abteilungsübergreifende Zusammenarbeit, mit optionaler KI.",
  SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "",
} as const;

export type AppConfig = typeof APP_CONFIG;
