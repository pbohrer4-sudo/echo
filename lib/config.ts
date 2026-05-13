// Zentrale Branding- und Konfigurations-Konstante (Briefing v3 #1).
//
// Code-Name (CODE_NAME = "echo") bleibt für immer im Code, in
// DB-Tabellen-Namen, in API-Pfaden, in Repository, in Comments.
//
// Public-Name (PUBLIC_NAME) ist das, was User in der UI sehen — über
// ENV-Variable steuerbar damit ein Rebrand ohne Code-Refactor möglich
// ist. Default ist "Echo" (kein Visual-Surprise gegenüber aktuellem
// Stand). Patrick kann via `.env.local` auf "Kindra" oder einen
// anderen Public-Namen umschalten.
//
// USAGE in UI: niemals `Echo`/`Kindra` hardcoden. Stattdessen
// `APP_CONFIG.PUBLIC_NAME` referenzieren. Wo der Code-Name relevant
// ist (Logging, Identifier in iCal-PRODID, User-Agent gegen Nominatim,
// AI-Prompts intern): „ECHO"/`echo` darf bleiben.

export const APP_CONFIG = {
  // Bleibt für immer. Niemand sieht das, nur Developer.
  CODE_NAME: "echo",
  BUNDLE_ID: "com.placeholder.kindra",

  // User-facing — per ENV überschreibbar.
  PUBLIC_NAME: process.env.NEXT_PUBLIC_APP_NAME || "Echo",
  PUBLIC_TAGLINE:
    process.env.NEXT_PUBLIC_APP_TAGLINE ||
    "Dein persönliches Gedächtnis für Beziehungen",
  DOMAIN: process.env.NEXT_PUBLIC_APP_DOMAIN || "mykindra.ai",

  // Email-Adressen.
  SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hi@mykindra.ai",
  LEGAL_EMAIL: process.env.NEXT_PUBLIC_LEGAL_EMAIL || "legal@mykindra.ai",

  // Marketing.
  TWITTER_HANDLE: process.env.NEXT_PUBLIC_TWITTER_HANDLE || "@mykindra",
} as const;

export type AppConfig = typeof APP_CONFIG;
