-- 0001 — Platform prerequisites for the Cross-Dept Hub.
--
-- A clean baseline with only what the hub needs (no CRM tables):
--   1. update_updated_at_column() — generic updated_at trigger function,
--      used by every hub table.
--   2. rate_limits + rate_limit_increment() — per-user token bucket backing
--      the AI rate limiter.
--   3. service_connections — stores the Microsoft Graph token from SSO so
--      SharePoint filing / Graph email can act on the user's behalf
--      (optional; the hub falls back to the MS_GRAPH_TOKEN env var).
--
-- All hub tables follow in 0002+ (project management, filing, notifications,
-- AI settings, projects, feedback).

-- 1. updated_at trigger helper -----------------------------------------------

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"()
  RETURNS "trigger"
  LANGUAGE "plpgsql"
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. Rate limiting -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "key" text NOT NULL,
  "window_start" timestamptz NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "key", "window_start")
);

CREATE INDEX IF NOT EXISTS "idx_rate_limits_window"
  ON "public"."rate_limits" ("window_start");

ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their rate limits" ON "public"."rate_limits"
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert their rate limits" ON "public"."rate_limits"
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update their rate limits" ON "public"."rate_limits"
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users delete their rate limits" ON "public"."rate_limits"
  FOR DELETE USING (user_id = auth.uid());

-- Atomic increment used by lib/rate-limit.ts (SECURITY DEFINER so it can
-- upsert regardless of the per-row policies above).
CREATE OR REPLACE FUNCTION "public"."rate_limit_increment"(
  "p_user_id" uuid,
  "p_key" text,
  "p_window_start" timestamptz
) RETURNS integer
  LANGUAGE "plpgsql"
  SECURITY DEFINER
  SET "search_path" TO 'public'
AS $$
declare
  v_count integer;
begin
  insert into public.rate_limits (user_id, key, window_start, count, updated_at)
  values (p_user_id, p_key, p_window_start, 1, now())
  on conflict (user_id, key, window_start)
  do update set count = rate_limits.count + 1, updated_at = now()
  returning count into v_count;
  return v_count;
end;
$$;

GRANT ALL ON FUNCTION "public"."rate_limit_increment"(uuid, text, timestamptz)
  TO "anon", "authenticated", "service_role";

-- 3. Service connections (Microsoft Graph token store) -----------------------

CREATE TABLE IF NOT EXISTS "public"."service_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "provider" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "account_label" text,
  "access_token" text,
  "refresh_token" text,
  "token_expires_at" timestamptz,
  "scopes" text[] NOT NULL DEFAULT '{}',
  "config" jsonb NOT NULL DEFAULT '{}',
  "last_error" text,
  "connected_at" timestamptz,
  "last_used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  CONSTRAINT "service_connections_status_check"
    CHECK (status IN ('pending', 'connected', 'error', 'expired', 'disconnected')),
  CONSTRAINT "service_connections_user_id_provider_key" UNIQUE ("user_id", "provider")
);

CREATE INDEX IF NOT EXISTS "idx_service_connections_user_status"
  ON "public"."service_connections" ("user_id", "status");

CREATE TRIGGER "service_connections_updated_at" BEFORE UPDATE
  ON "public"."service_connections"
  FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

ALTER TABLE "public"."service_connections" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their service connections" ON "public"."service_connections"
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert their service connections" ON "public"."service_connections"
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update their service connections" ON "public"."service_connections"
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users delete their service connections" ON "public"."service_connections"
  FOR DELETE USING (user_id = auth.uid());
