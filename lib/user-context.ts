import { createClient } from "@/lib/supabase/server";

export interface UserContext {
  user_id: string;
  email: string | null;
  display_name: string;
  voice_id: string | null;
  language: string;
  claude_key: string | null;
  elevenlabs_key: string | null;
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
    .select("display_name, voice_id, language, claude_key_byo, elevenlabs_key_byo")
    .eq("id", user.id)
    .maybeSingle();

  const display_name =
    profile?.display_name ??
    user.user_metadata?.display_name ??
    user.email?.split("@")[0] ??
    "Patrick";

  return {
    user_id: user.id,
    email: user.email ?? null,
    display_name,
    voice_id: profile?.voice_id ?? null,
    language: profile?.language ?? "de",
    claude_key: profile?.claude_key_byo ?? null,
    elevenlabs_key: profile?.elevenlabs_key_byo ?? null,
  };
}
