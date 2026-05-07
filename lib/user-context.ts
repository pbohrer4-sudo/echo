import { createClient } from "@/lib/supabase/server";

export interface UserContext {
  user_id: string;
  email: string | null;
  display_name: string;
  voice_id: string | null;
  language: string;
  claude_key: string | null;
  elevenlabs_key: string | null;
  // Per-task model preferences from profiles.model_preferences. Empty
  // object when nothing's configured — lib/ai.ts falls back to defaults.
  model_preferences: Record<string, string>;
  // BYO API keys per provider (e.g. { anthropic: "sk-…", openai: "sk-…" }).
  // Legacy claude_key / elevenlabs_key columns mirror the same data
  // for backwards compat with code that hasn't been migrated yet.
  byo_keys: Record<string, string>;
}

// Resolves the current user + their profile in a single helper. Returns
// null when nobody is logged in (so route handlers can short-circuit
// to 401). BYO keys are returned as null when not set; callers fall
// back to the shared environment defaults.
export async function getUserContext(): Promise<UserContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "display_name, voice_id, language, claude_key_byo, elevenlabs_key_byo, model_preferences, byo_api_keys",
    )
    .eq("id", user.id)
    .maybeSingle();

  const display_name =
    profile?.display_name ??
    user.user_metadata?.display_name ??
    user.email?.split("@")[0] ??
    "Patrick";

  const byo_keys =
    (profile?.byo_api_keys as Record<string, string> | null) ?? {};
  // Mirror legacy single-column keys into the byo map so older code
  // paths don't have to know about the new structure.
  if (profile?.claude_key_byo && !byo_keys.anthropic) {
    byo_keys.anthropic = profile.claude_key_byo;
  }
  if (profile?.elevenlabs_key_byo && !byo_keys.elevenlabs) {
    byo_keys.elevenlabs = profile.elevenlabs_key_byo;
  }

  return {
    user_id: user.id,
    email: user.email ?? null,
    display_name,
    voice_id: profile?.voice_id ?? null,
    language: profile?.language ?? "de",
    claude_key: profile?.claude_key_byo ?? null,
    elevenlabs_key: profile?.elevenlabs_key_byo ?? null,
    model_preferences:
      (profile?.model_preferences as Record<string, string> | null) ?? {},
    byo_keys,
  };
}
