import { createClient } from "@/lib/supabase/server";
import type { ServiceConnection } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Shared Google OAuth helper used by Gmail + Calendar sync. Refreshes
// the access token if expired, persists the new one, and returns a
// ready-to-use bearer string.
//
// Provider rows are stored in service_connections with provider in
// ('google_calendar', 'gmail'). Both share the same Google identity
// in practice but we keep them separate so the user can revoke each
// independently.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export interface GoogleAuth {
  accessToken: string;
  expiresAt: string;
  refreshed: boolean;
}

interface RefreshReply {
  access_token: string;
  expires_in: number; // seconds
  scope?: string;
  token_type?: string;
}

// Scope for match-functions and token-persistence helpers — explicit
// rather than implied so the webhook (no user session) can pass an
// admin client + user_id while the API routes pass the RLS-scoped
// session client.
export interface SupabaseScope {
  supabase: SupabaseClient;
  userId: string;
}

export async function getGoogleAccess(
  conn: ServiceConnection,
  scope?: SupabaseScope,
): Promise<GoogleAuth> {
  if (conn.access_token?.startsWith("stub_")) {
    throw new Error(
      "Google connection is still a stub — re-connect via OAuth to get real tokens.",
    );
  }
  if (!conn.access_token) {
    throw new Error("No access_token on connection.");
  }

  // If token still has >2 min headroom, use as-is.
  const now = Date.now();
  const expiresMs = conn.token_expires_at
    ? new Date(conn.token_expires_at).getTime()
    : 0;
  if (expiresMs - now > 120_000) {
    return {
      accessToken: conn.access_token,
      expiresAt: conn.token_expires_at ?? new Date(now + 3600_000).toISOString(),
      refreshed: false,
    };
  }

  if (!conn.refresh_token) {
    throw new Error(
      "Access token expired and no refresh_token stored — re-connect.",
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing — set in .env.local",
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: conn.refresh_token,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google token refresh ${res.status}: ${detail}`);
  }
  const reply = (await res.json()) as RefreshReply;
  const newExpires = new Date(now + reply.expires_in * 1000).toISOString();

  // Persist refreshed token so subsequent calls don't pay the round-trip.
  const supabase = scope?.supabase ?? (await createClient());
  await supabase
    .from("service_connections")
    .update({
      access_token: reply.access_token,
      token_expires_at: newExpires,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conn.id);

  return {
    accessToken: reply.access_token,
    expiresAt: newExpires,
    refreshed: true,
  };
}

// Match an attendee or sender email to a known person. Returns the
// person id if found, else null. Used by both calendar and gmail
// sync to wire ingested rows up to people automatically.
//
// Always requires an explicit scope so callers from webhook (admin
// client + user_id) and API routes (session client) both get
// correctly user-bounded results.
export async function matchPersonByEmail(
  email: string,
  scope: SupabaseScope,
): Promise<string | null> {
  if (!email) return null;
  const lower = email.trim().toLowerCase();
  if (!lower) return null;

  const { supabase, userId } = scope;
  const { data: legacy } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", userId)
    .ilike("email", lower)
    .limit(1)
    .maybeSingle();
  if (legacy?.id) return legacy.id;

  // Fallback: scan recent people and match in JS — keeps the query
  // simple. For large datasets we'd build a proper email-index table.
  const { data: rows } = await supabase
    .from("people")
    .select("id, emails")
    .eq("user_id", userId)
    .not("emails", "is", null);
  for (const row of rows ?? []) {
    const arr = (row.emails as Array<{ value?: string }> | null) ?? [];
    if (arr.some((e) => e.value?.toLowerCase() === lower)) {
      return row.id as string;
    }
  }
  return null;
}

// Match by phone number — used by WhatsApp and SMS channels. Strips
// non-digit chars from both sides for tolerance ("+49 89 1234" matches
// "+4989-1234" matches "00498912 34").
export async function matchPersonByPhone(
  phone: string,
  scope: SupabaseScope,
): Promise<string | null> {
  const normalize = (s: string) => s.replace(/\D/g, "");
  const target = normalize(phone);
  if (target.length < 5) return null;

  const { supabase, userId } = scope;
  const { data: rows } = await supabase
    .from("people")
    .select("id, phones, phone")
    .eq("user_id", userId);
  for (const row of rows ?? []) {
    if (row.phone && normalize(row.phone) === target) return row.id as string;
    const arr = (row.phones as Array<{ value?: string }> | null) ?? [];
    if (arr.some((p) => p.value && normalize(p.value) === target)) {
      return row.id as string;
    }
  }
  return null;
}
