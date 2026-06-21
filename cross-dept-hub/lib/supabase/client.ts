import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client (used by Client Components, e.g. the
// notification poller asks for the session indirectly via API routes, but
// this is here for any client-side auth needs).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
