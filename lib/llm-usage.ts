import type { SupabaseClient } from "@supabase/supabase-js";

// Per-Call-Log für AI-Aufrufe. Wird von jeder AI-Route NACH dem
// Anthropic-/ElevenLabs-Call eingeschossen. Schreibt direkt mit dem
// user-scoped Supabase-Client (RLS erzwingt user_id = auth.uid()).
//
// Cost-Berechnung passiert clientseitig damit das DB-Schema generisch
// bleibt und Preisänderungen nur einen Code-Push brauchen, kein
// Migration.

// Approximate token pricing — Mai 2026. Wenn Anthropic die Preise
// ändert oder ein anderes Modell genutzt wird, hier nachziehen.
// Werte in cents (€-Cent) pro Token, also $-Preis × 100 × 0.92 wäre
// genauer für EUR — wir tracken in cent-Einheiten unabhängig von der
// Währung; admin_overview rendert als Zahl, nicht als €-Symbol.
//
// Sonnet 4.6 official: $3 / 1M input, $15 / 1M output
//   → 0.0003 cents per input token, 0.0015 cents per output token
const ANTHROPIC_PRICING: Record<
  string,
  { input_per_token_cents: number; output_per_token_cents: number }
> = {
  "claude-sonnet-4-6": {
    input_per_token_cents: 0.0003,
    output_per_token_cents: 0.0015,
  },
  // Fallback für unbekannte Modelle — gleicher Preis wie Sonnet
  default: {
    input_per_token_cents: 0.0003,
    output_per_token_cents: 0.0015,
  },
};

// ElevenLabs Multilingual v2 ~ $0.18 per 1000 chars → 0.018 cents/char
const ELEVENLABS_PER_CHAR_CENTS = 0.018;

export function calculateCostCents(params: {
  provider: "anthropic" | "elevenlabs";
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  characters?: number;
}): number {
  if (params.provider === "anthropic") {
    const pricing =
      (params.model && ANTHROPIC_PRICING[params.model]) ||
      ANTHROPIC_PRICING.default;
    return (
      (params.inputTokens ?? 0) * pricing.input_per_token_cents +
      (params.outputTokens ?? 0) * pricing.output_per_token_cents
    );
  }
  if (params.provider === "elevenlabs") {
    return (params.characters ?? 0) * ELEVENLABS_PER_CHAR_CENTS;
  }
  return 0;
}

export interface LogParams {
  supabase: SupabaseClient;
  userId: string;
  endpoint: string;
  provider: "anthropic" | "elevenlabs";
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  characters?: number;
  latencyMs?: number;
  status?: "ok" | "error" | "rate_limited";
}

// Fire-and-forget logging — Failures dürfen NIE den User-Request
// blockieren. Wir awaiten zwar (sonst gibt's potenziell unhandled
// promise rejections in serverless), aber fangen alle Errors.
export async function logUsage(params: LogParams): Promise<void> {
  try {
    const cost = calculateCostCents({
      provider: params.provider,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      characters: params.characters,
    });
    await params.supabase.from("llm_usage_log").insert({
      user_id: params.userId,
      endpoint: params.endpoint,
      provider: params.provider,
      model: params.model ?? null,
      input_tokens: params.inputTokens ?? 0,
      output_tokens: params.outputTokens ?? 0,
      characters: params.characters ?? 0,
      cost_cents: cost,
      latency_ms: params.latencyMs ?? null,
      status: params.status ?? "ok",
    });
  } catch (err) {
    console.error("logUsage failed:", err);
  }
}

// Convenience-Wrapper für Anthropic — extracts usage from a typical
// SDK response shape and logs.
export async function logAnthropic(args: {
  supabase: SupabaseClient;
  userId: string;
  endpoint: string;
  model: string;
  usage: { input_tokens?: number; output_tokens?: number } | null;
  latencyMs: number;
  status?: "ok" | "error" | "rate_limited";
}): Promise<void> {
  await logUsage({
    supabase: args.supabase,
    userId: args.userId,
    endpoint: args.endpoint,
    provider: "anthropic",
    model: args.model,
    inputTokens: args.usage?.input_tokens ?? 0,
    outputTokens: args.usage?.output_tokens ?? 0,
    latencyMs: args.latencyMs,
    status: args.status ?? "ok",
  });
}
