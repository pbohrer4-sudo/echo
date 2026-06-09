import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Personal API tokens for headless callers (Siri / Apple Shortcuts, future
// automation). See migration 0046_api_tokens.sql for the storage model.
//
// The raw token is shown to the user exactly once. We persist only its
// SHA-256 hash; resolution re-hashes the incoming bearer and looks it up.

const TOKEN_PREFIX = "echo_";
const TOKEN_BYTES = 24; // 24 bytes → 48 hex chars, plenty of entropy.
const PREFIX_DISPLAY_LEN = 8; // chars of the raw token kept for display.

export interface GeneratedToken {
  // The full plaintext token — return to the user ONCE, never stored.
  raw: string;
  // SHA-256 of `raw`, hex. This is what lands in api_tokens.token_hash.
  hash: string;
  // First few visible chars (incl. the echo_ prefix) for list display.
  prefix: string;
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Mint a fresh token. Caller is responsible for persisting { hash, prefix }
// into api_tokens and surfacing `raw` to the user a single time.
export function generateApiToken(): GeneratedToken {
  const raw = TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString("hex");
  return {
    raw,
    hash: hashToken(raw),
    prefix: raw.slice(0, PREFIX_DISPLAY_LEN),
  };
}

// Pull the bearer token out of an Authorization header. Returns null when
// the header is missing or malformed.
export function bearerFromRequest(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  return token;
}

export interface ResolvedToken {
  user_id: string;
  token_id: string;
  scopes: string[];
}

// Resolve a raw bearer token to its owning user. Uses the service-role
// client (bypasses RLS) because there's no session here — the whole point
// is to authenticate a cookie-less caller. We NEVER trust a user_id from
// the request; it comes only from the matched token row.
//
// Returns null for unknown, revoked, or malformed tokens. On success we
// best-effort bump last_used_at (failures there are non-fatal).
export async function resolveUserIdFromToken(
  raw: string,
): Promise<ResolvedToken | null> {
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_tokens")
    .select("id, user_id, scopes, revoked_at")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();

  if (error || !data) return null;
  if (data.revoked_at) return null;

  void admin
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(({ error: bumpErr }) => {
      if (bumpErr) console.error("[api-token] last_used_at bump failed", bumpErr);
    });

  return {
    user_id: data.user_id,
    token_id: data.id as string,
    scopes: (data.scopes as string[] | null) ?? [],
  };
}
