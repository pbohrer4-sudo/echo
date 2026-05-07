// Model registry — one source of truth for which models the platform
// knows about, what they cost, what they can do. Adding a new model =
// add a row here. The /models page renders this directly, settings
// stores preference IDs that match `id` here.

export type ProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "mistral"
  | "meta"
  | "elevenlabs"
  | "deepgram";

export interface Provider {
  id: ProviderId;
  name: string;
  glyph: string; // 1-2 letters as fallback when no logo set
  color: string; // hex without # — used for the glyph badge
  byo_field: string | null; // key in profile.byo_api_keys, null if no BYO supported
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    glyph: "C",
    color: "c87a55",
    byo_field: "anthropic",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    glyph: "OA",
    color: "10a37f",
    byo_field: "openai",
  },
  google: {
    id: "google",
    name: "Google",
    glyph: "G",
    color: "4285f4",
    byo_field: "google",
  },
  mistral: {
    id: "mistral",
    name: "Mistral",
    glyph: "M",
    color: "ff7000",
    byo_field: "mistral",
  },
  meta: {
    id: "meta",
    name: "Meta",
    glyph: "Ll",
    color: "1877f2",
    byo_field: null,
  },
  elevenlabs: {
    id: "elevenlabs",
    name: "ElevenLabs",
    glyph: "EL",
    color: "8a52ff",
    byo_field: "elevenlabs",
  },
  deepgram: {
    id: "deepgram",
    name: "Deepgram",
    glyph: "DG",
    color: "13ef93",
    byo_field: "deepgram",
  },
};

export type ModelCapability =
  | "chat"
  | "tools"
  | "vision"
  | "stream"
  | "long-ctx"
  | "audio-out"
  | "audio-in";

export interface CatalogModel {
  id: string; // "<provider>/<model-id>" — used as preference value
  provider: ProviderId;
  family: string; // "Claude Sonnet 4", "GPT-5", "Gemini 2.5"
  name: string; // human-readable name shown in the table
  // Pricing in USD per 1M tokens. null when not applicable (TTS).
  input_usd: number | null;
  output_usd: number | null;
  // For TTS: USD per 1M characters
  per_chars_usd: number | null;
  context_window_k: number | null;
  capabilities: ModelCapability[];
  // True when ECHO can actually route tasks to this model today.
  // False = listed in catalog as "future" / aspirational.
  available: boolean;
  // Brief one-liner shown under the model name in compact rows.
  blurb?: string;
}

// Prices reflect public list prices as of late 2025 — update freely.
// `available: true` means lib/ai.ts already knows how to dispatch to
// this model. Today only Anthropic + ElevenLabs are wired; the rest
// are future-of-the-platform placeholders so the registry shows the
// shape we're growing into.

export const MODELS: CatalogModel[] = [
  // ───────── Anthropic (active) ─────────
  {
    id: "anthropic/claude-opus-4-7",
    provider: "anthropic",
    family: "Claude Opus 4",
    name: "Claude Opus 4.7",
    input_usd: 15,
    output_usd: 75,
    per_chars_usd: null,
    context_window_k: 1000,
    capabilities: ["chat", "tools", "vision", "stream", "long-ctx"],
    available: true,
    blurb: "Top-Tier-Reasoning, 1M-Context — für komplexe Workflows.",
  },
  {
    id: "anthropic/claude-sonnet-4-6",
    provider: "anthropic",
    family: "Claude Sonnet 4",
    name: "Claude Sonnet 4.6",
    input_usd: 3,
    output_usd: 15,
    per_chars_usd: null,
    context_window_k: 200,
    capabilities: ["chat", "tools", "vision", "stream", "long-ctx"],
    available: true,
    blurb: "Default für Voice-Loop, Extract, Enrich, Pulse, Recap.",
  },
  {
    id: "anthropic/claude-haiku-4-5",
    provider: "anthropic",
    family: "Claude Haiku 4",
    name: "Claude Haiku 4.5",
    input_usd: 1,
    output_usd: 5,
    per_chars_usd: null,
    context_window_k: 200,
    capabilities: ["chat", "tools", "vision", "stream"],
    available: true,
    blurb: "Schnell + günstig. Ideal für Bulk-Klassifizierung.",
  },

  // ───────── OpenAI (planned) ─────────
  {
    id: "openai/gpt-5",
    provider: "openai",
    family: "GPT-5",
    name: "GPT-5",
    input_usd: 1.25,
    output_usd: 10,
    per_chars_usd: null,
    context_window_k: 400,
    capabilities: ["chat", "tools", "vision", "stream", "long-ctx"],
    available: false,
  },
  {
    id: "openai/gpt-5-mini",
    provider: "openai",
    family: "GPT-5",
    name: "GPT-5 Mini",
    input_usd: 0.25,
    output_usd: 2,
    per_chars_usd: null,
    context_window_k: 400,
    capabilities: ["chat", "tools", "vision", "stream"],
    available: false,
  },
  {
    id: "openai/gpt-4.1",
    provider: "openai",
    family: "GPT-4.1",
    name: "GPT-4.1",
    input_usd: 2,
    output_usd: 8,
    per_chars_usd: null,
    context_window_k: 1000,
    capabilities: ["chat", "tools", "vision", "stream", "long-ctx"],
    available: false,
  },
  {
    id: "openai/o3",
    provider: "openai",
    family: "OpenAI o-series",
    name: "OpenAI o3",
    input_usd: 2,
    output_usd: 8,
    per_chars_usd: null,
    context_window_k: 200,
    capabilities: ["chat", "tools", "vision", "stream"],
    available: false,
    blurb: "Reasoning-optimiert für tiefe Recherche-Ketten.",
  },

  // ───────── Google (planned) ─────────
  {
    id: "google/gemini-2.5-pro",
    provider: "google",
    family: "Gemini 2.5",
    name: "Gemini 2.5 Pro",
    input_usd: 2.5,
    output_usd: 15,
    per_chars_usd: null,
    context_window_k: 2000,
    capabilities: ["chat", "tools", "vision", "stream", "long-ctx"],
    available: false,
    blurb: "2M-Context für komplette Email-Threads als Input.",
  },
  {
    id: "google/gemini-2.5-flash",
    provider: "google",
    family: "Gemini 2.5",
    name: "Gemini 2.5 Flash",
    input_usd: 0.3,
    output_usd: 2.5,
    per_chars_usd: null,
    context_window_k: 1000,
    capabilities: ["chat", "tools", "vision", "stream", "long-ctx"],
    available: false,
  },
  {
    id: "google/gemini-3-pro",
    provider: "google",
    family: "Gemini 3",
    name: "Gemini 3 Pro",
    input_usd: 2.5,
    output_usd: 15,
    per_chars_usd: null,
    context_window_k: 2000,
    capabilities: ["chat", "tools", "vision", "stream", "long-ctx"],
    available: false,
  },

  // ───────── Mistral (planned) ─────────
  {
    id: "mistral/mistral-large-3",
    provider: "mistral",
    family: "Mistral Large",
    name: "Mistral Large 3",
    input_usd: 2,
    output_usd: 6,
    per_chars_usd: null,
    context_window_k: 128,
    capabilities: ["chat", "tools", "stream"],
    available: false,
    blurb: "EU-gehostet. Wenn Datenresidenz wichtiger als Performance.",
  },

  // ───────── Meta / Open (planned) ─────────
  {
    id: "meta/llama-4-405b",
    provider: "meta",
    family: "Llama 4",
    name: "Llama 4 405B",
    input_usd: 1.5,
    output_usd: 1.5,
    per_chars_usd: null,
    context_window_k: 256,
    capabilities: ["chat", "tools", "stream"],
    available: false,
    blurb: "Open-Weights. Self-hostable für volle Kontrolle.",
  },

  // ───────── Audio out: ElevenLabs (active) ─────────
  {
    id: "elevenlabs/eleven_flash_v2_5",
    provider: "elevenlabs",
    family: "Flash v2.5",
    name: "Flash v2.5 (Sarah Eve)",
    input_usd: null,
    output_usd: null,
    per_chars_usd: 75,
    context_window_k: null,
    capabilities: ["audio-out", "stream"],
    available: true,
    blurb: "Default-Stimme. Latenz unter 200ms.",
  },
  {
    id: "elevenlabs/eleven_multilingual_v2",
    provider: "elevenlabs",
    family: "Multilingual v2",
    name: "Multilingual v2",
    input_usd: null,
    output_usd: null,
    per_chars_usd: 180,
    context_window_k: null,
    capabilities: ["audio-out"],
    available: true,
    blurb: "Höhere Stimmen-Qualität, dafür langsamer.",
  },

  // ───────── Audio in (planned) ─────────
  {
    id: "deepgram/nova-3",
    provider: "deepgram",
    family: "Nova 3",
    name: "Nova 3 (de-DE)",
    input_usd: null,
    output_usd: null,
    per_chars_usd: null,
    context_window_k: null,
    capabilities: ["audio-in", "stream"],
    available: false,
    blurb: "Server-seitige STT als Alternative zur Web Speech API.",
  },
];

// ───────── Tasks ─────────
// Each task in the app picks a model from the catalog. The mapping
// lives in profiles.model_preferences keyed by these IDs.

export const TASKS = [
  {
    id: "chat",
    label: "Chat",
    description:
      "Freier Voice-Loop ohne strukturierte Extraktion (alter /api/chat-Pfad).",
    requires: ["chat"] as ModelCapability[],
    default_model: "anthropic/claude-sonnet-4-6",
  },
  {
    id: "extract",
    label: "Extract",
    description:
      "Voice → Tool-Use → CRM-Daten. Hier landet der Hauptanteil der Tokens.",
    requires: ["chat", "tools"] as ModelCapability[],
    default_model: "anthropic/claude-sonnet-4-6",
  },
  {
    id: "enrich",
    label: "Enrich",
    description:
      "Org-Auto-Enrich (Branche, Größe, HQ aus Wissensbasis).",
    requires: ["chat", "tools"] as ModelCapability[],
    default_model: "anthropic/claude-sonnet-4-6",
  },
  {
    id: "vision",
    label: "Vision",
    description:
      "Visitenkarten-Scan und perspektivisch jedes andere Bild-zu-Daten.",
    requires: ["vision", "tools"] as ModelCapability[],
    default_model: "anthropic/claude-sonnet-4-6",
  },
  {
    id: "pulse",
    label: "Sonntags-Puls",
    description: "Wochenrhythmus-Digest, einmal pro Woche.",
    requires: ["chat", "long-ctx"] as ModelCapability[],
    default_model: "anthropic/claude-sonnet-4-6",
  },
  {
    id: "recap",
    label: "Rückblick",
    description: "Monats- und Jahresrückblick mit Aggregaten + Narrative.",
    requires: ["chat", "long-ctx"] as ModelCapability[],
    default_model: "anthropic/claude-sonnet-4-6",
  },
  {
    id: "vibe",
    label: "Vibe (Workflow-Generator)",
    description:
      "Natural-Language → Workflow-Graph im Visual Editor.",
    requires: ["chat", "tools"] as ModelCapability[],
    default_model: "anthropic/claude-sonnet-4-6",
  },
  {
    id: "tts",
    label: "Text-to-Speech",
    description: "ECHOs Stimme (ElevenLabs).",
    requires: ["audio-out"] as ModelCapability[],
    default_model: "elevenlabs/eleven_flash_v2_5",
  },
  {
    id: "stt",
    label: "Speech-to-Text",
    description:
      "Aktuell Browser-nativ (Web Speech API). Server-STT optional.",
    requires: ["audio-in"] as ModelCapability[],
    default_model: "",
  },
] as const;

export type TaskId = (typeof TASKS)[number]["id"];

// ───────── Lookups ─────────

export function modelById(id: string | null | undefined): CatalogModel | null {
  if (!id) return null;
  return MODELS.find((m) => m.id === id) ?? null;
}

export function modelsForCapabilities(
  caps: readonly ModelCapability[],
): CatalogModel[] {
  return MODELS.filter((m) => caps.every((c) => m.capabilities.includes(c)));
}

export function modelsByProvider(): Record<ProviderId, CatalogModel[]> {
  const grouped: Record<string, CatalogModel[]> = {};
  for (const m of MODELS) {
    (grouped[m.provider] ??= []).push(m);
  }
  return grouped as Record<ProviderId, CatalogModel[]>;
}

export const CAPABILITY_LABEL: Record<ModelCapability, string> = {
  chat: "Chat",
  tools: "Tools",
  vision: "Vision",
  stream: "Streaming",
  "long-ctx": "Long-Context",
  "audio-out": "TTS",
  "audio-in": "STT",
};
