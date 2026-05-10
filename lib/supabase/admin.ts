import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Admin client for webhook handlers and other routes that have no
// user session. Uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS,
// so callers MUST enforce user_id correctness explicitly in their
// queries. Never accept a user_id from the request body — always
// resolve it from a verified server-side source (e.g. matching a
// webhook-bearer secret to a service_connections row).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY missing — add to .env.local for webhook routes.",
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
