-- 0001 — Baseline (production schema squash).
--
-- Generated from the live production database via 'supabase db dump'.
-- Replaces the original 0001-0045 migrations, whose history had become
-- internally contradictory (duplicate version numbers, tables redefined
-- incompatibly across 0020/0026/0027/0030, and at least one non-replayable
-- statement). This single baseline reflects the actual production schema;
-- 0046_audit_fixes.sql applies on top of it.




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."depth_level" AS ENUM (
    'inner_5',
    'trusted_15',
    'active_50',
    'network_150',
    'periphery_500'
);


ALTER TYPE "public"."depth_level" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_overview_stats"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_now timestamptz := now();
  result json;
begin
  select json_build_object(
    'total_users', (select count(*) from auth.users),
    'active_7d', (select count(*) from auth.users where last_sign_in_at >= v_now - interval '7 days'),
    'active_30d', (select count(*) from auth.users where last_sign_in_at >= v_now - interval '30 days'),
    'onboarded', (
      select count(distinct user_id) from public.people
      where is_self = false and deleted_at is null
    ),
    'people_total', (select count(*) from public.people where is_self = false and deleted_at is null),
    'interactions_total', (select count(*) from public.interactions),
    'debriefs_total', (select count(*) from public.debriefs),
    'signups_weekly', (
      select coalesce(json_agg(json_build_object('week', week, 'count', count) order by week), '[]'::json)
      from (
        select date_trunc('week', created_at) as week, count(*) as count
        from auth.users
        where created_at >= v_now - interval '8 weeks'
        group by 1
      ) t
    ),
    'recent_signups', (
      select coalesce(json_agg(json_build_object(
        'id', id, 'email', email, 'created_at', created_at,
        'last_sign_in_at', last_sign_in_at, 'onboarded', onboarded
      ) order by created_at desc), '[]'::json)
      from (
        select u.id, u.email, u.created_at, u.last_sign_in_at,
          exists(select 1 from public.people p where p.user_id = u.id and p.is_self = false and p.deleted_at is null) as onboarded
        from auth.users u order by u.created_at desc limit 10
      ) t
    )
  ) into result;
  return result;
end;
$$;


ALTER FUNCTION "public"."admin_overview_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_users_list"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  result json;
begin
  select coalesce(json_agg(json_build_object(
    'id', u.id, 'email', u.email, 'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'people_count', coalesce(pc.cnt, 0),
    'interactions_count', coalesce(ic.cnt, 0),
    'debriefs_count', coalesce(dc.cnt, 0),
    'onboarded', coalesce(pc.cnt, 0) > 0
  ) order by u.created_at desc), '[]'::json)
  into result
  from auth.users u
  left join (select user_id, count(*) as cnt from public.people where is_self = false and deleted_at is null group by user_id) pc on pc.user_id = u.id
  left join (select user_id, count(*) as cnt from public.interactions group by user_id) ic on ic.user_id = u.id
  left join (select user_id, count(*) as cnt from public.debriefs group by user_id) dc on dc.user_id = u.id;
  return result;
end;
$$;


ALTER FUNCTION "public"."admin_users_list"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_tag_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if (TG_OP = 'INSERT') then
    update public.tags set usage_count = usage_count + 1, updated_at = now()
    where id = new.tag_id;
  elsif (TG_OP = 'DELETE') then
    update public.tags set usage_count = greatest(usage_count - 1, 0), updated_at = now()
    where id = old.tag_id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."bump_tag_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."jsonb_dedup"("arr" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
  from (
    select distinct on (elem) elem, ord
    from (
      select value as elem, ordinality as ord
      from jsonb_array_elements(arr) with ordinality
    ) t
    order by elem, ord
  ) deduped;
$$;


ALTER FUNCTION "public"."jsonb_dedup"("arr" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_organizations"("primary_id" "uuid", "secondary_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  caller uuid := auth.uid();
  p public.organizations;
  s public.organizations;
begin
  if primary_id = secondary_id then
    raise exception 'Cannot merge an organization with itself';
  end if;
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into p from public.organizations where id = primary_id;
  if not found then raise exception 'Primary organization not found'; end if;
  if p.user_id <> caller then raise exception 'Forbidden (primary)'; end if;

  select * into s from public.organizations where id = secondary_id;
  if not found then raise exception 'Secondary organization not found'; end if;
  if s.user_id <> caller then raise exception 'Forbidden (secondary)'; end if;

  -- Repoint FK
  update public.people set organization_id = primary_id where organization_id = secondary_id;
  update public.deals  set organization_id = primary_id where organization_id = secondary_id;

  -- Field-Level-Merge.
  update public.organizations
  set
    domain = coalesce(p.domain, s.domain),
    website = coalesce(p.website, s.website),
    industry = coalesce(p.industry, s.industry),
    size = coalesce(p.size, s.size),
    hq = coalesce(p.hq, s.hq),
    description = coalesce(p.description, s.description),
    notes = case
      when p.notes is null and s.notes is null then null
      when p.notes is null then s.notes
      when s.notes is null then p.notes
      when p.notes = s.notes then p.notes
      else p.notes || E'\n\n— aus Merge —\n' || s.notes
    end,
    tags = (
      select coalesce(array_agg(distinct t), '{}'::text[])
      from unnest(coalesce(p.tags, '{}') || coalesce(s.tags, '{}')) as t
      where t is not null and t <> ''
    ),
    enriched_at = greatest(p.enriched_at, s.enriched_at),
    updated_at = now()
  where id = primary_id;

  update public.organizations
  set deleted_at = now(), updated_at = now()
  where id = secondary_id;

  return primary_id;
end;
$$;


ALTER FUNCTION "public"."merge_organizations"("primary_id" "uuid", "secondary_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_people"("primary_id" "uuid", "secondary_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  caller uuid := auth.uid();
  p public.people;
  s public.people;
begin
  if primary_id = secondary_id then
    raise exception 'Cannot merge a person with itself';
  end if;
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into p from public.people where id = primary_id;
  if not found then raise exception 'Primary person not found'; end if;
  if p.user_id <> caller then raise exception 'Forbidden (primary)'; end if;

  select * into s from public.people where id = secondary_id;
  if not found then raise exception 'Secondary person not found'; end if;
  if s.user_id <> caller then raise exception 'Forbidden (secondary)'; end if;

  -- ── FK-Repointing: interactions (person_ids[] uuid-Array) ──
  update public.interactions
  set person_ids = (
    select array_agg(distinct case when x = secondary_id then primary_id else x end)
    from unnest(person_ids) as x
  )
  where secondary_id = any(person_ids);

  -- ── FK-Repointing: 1:N-Tabellen ──
  update public.notes       set person_id = primary_id where person_id = secondary_id;
  update public.reminders   set person_id = primary_id where person_id = secondary_id;
  update public.todos       set person_id = primary_id where person_id = secondary_id;
  update public.deals       set person_id = primary_id where person_id = secondary_id;
  update public.suggestions set person_id = primary_id where person_id = secondary_id;

  -- ── Junction mit composite-unique: erst Konflikte raus, dann update ──
  -- person_tags (person_id, tag_id)
  delete from public.person_tags
  where person_id = secondary_id
    and tag_id in (select tag_id from public.person_tags where person_id = primary_id);
  update public.person_tags set person_id = primary_id where person_id = secondary_id;

  -- passions (person_id, lower(name)) unique-index
  delete from public.passions
  where person_id = secondary_id
    and lower(name) in (
      select lower(name) from public.passions where person_id = primary_id
    );
  update public.passions set person_id = primary_id where person_id = secondary_id;

  -- person_circles (person_id, circle_id)
  delete from public.person_circles
  where person_id = secondary_id
    and circle_id in (select circle_id from public.person_circles where person_id = primary_id);
  update public.person_circles set person_id = primary_id where person_id = secondary_id;

  -- person_life_events (person_id, life_event_id)
  delete from public.person_life_events
  where person_id = secondary_id
    and life_event_id in (
      select life_event_id from public.person_life_events where person_id = primary_id
    );
  update public.person_life_events set person_id = primary_id where person_id = secondary_id;

  -- person_contacts, person_geographies: keine composite-unique, einfach repointen
  update public.person_contacts    set person_id = primary_id where person_id = secondary_id;
  update public.person_geographies set person_id = primary_id where person_id = secondary_id;

  -- person_relationships: unique (person_id, related_person_id, relationship_type)
  --   + check: related_person_id darf nicht auf sich selbst zeigen
  -- Erst person_id-Seite des Repoints:
  delete from public.person_relationships
  where person_id = secondary_id
    and (
      related_person_id = primary_id  -- würde self-loop nach Repoint
      or (related_person_id, relationship_type) in (
        select related_person_id, relationship_type
        from public.person_relationships where person_id = primary_id
      )
    );
  update public.person_relationships set person_id = primary_id where person_id = secondary_id;

  -- Dann related_person_id-Seite:
  delete from public.person_relationships
  where related_person_id = secondary_id
    and (
      person_id = primary_id  -- self-loop
      or (person_id, relationship_type) in (
        select person_id, relationship_type
        from public.person_relationships where related_person_id = primary_id
      )
    );
  update public.person_relationships set related_person_id = primary_id where related_person_id = secondary_id;

  -- ── JSONB-Beziehungen auf anderen people umschreiben ──
  -- Erst die Fälle wo BEIDES (primary + secondary) drin steht — primary-
  -- Entries werden behalten, secondary fällt mit der nächsten Pass weg.
  update public.people
  set relationships = coalesce((
    select jsonb_agg(rel)
    from jsonb_array_elements(relationships) as rel
    where (rel->>'related_person_id')::uuid <> primary_id
  ), '[]'::jsonb)
  where user_id = caller
    and relationships @> jsonb_build_array(jsonb_build_object('related_person_id', secondary_id))
    and relationships @> jsonb_build_array(jsonb_build_object('related_person_id', primary_id));

  -- Dann secondary → primary umschreiben.
  update public.people
  set relationships = coalesce((
    select jsonb_agg(
      case
        when (rel->>'related_person_id')::uuid = secondary_id
          then jsonb_set(rel, '{related_person_id}', to_jsonb(primary_id::text))
        else rel
      end
    )
    from jsonb_array_elements(relationships) as rel
  ), '[]'::jsonb)
  where user_id = caller
    and relationships @> jsonb_build_array(jsonb_build_object('related_person_id', secondary_id));

  -- ── Field-Level-Merge in primary ──
  update public.people
  set
    -- Scalars: primary wins, fallback auf secondary.
    company = coalesce(p.company, s.company),
    organization_id = coalesce(p.organization_id, s.organization_id),
    role = coalesce(p.role, s.role),
    notes = case
      when p.notes is null and s.notes is null then null
      when p.notes is null then s.notes
      when s.notes is null then p.notes
      when p.notes = s.notes then p.notes
      else p.notes || E'\n\n— aus Merge —\n' || s.notes
    end,
    how_we_met = coalesce(p.how_we_met, s.how_we_met),
    met_date = coalesce(p.met_date, s.met_date),
    met_location = coalesce(p.met_location, s.met_location),
    met_location_geo = coalesce(p.met_location_geo, s.met_location_geo),
    current_location = coalesce(p.current_location, s.current_location),
    current_location_geo = coalesce(p.current_location_geo, s.current_location_geo),
    home_location = coalesce(p.home_location, s.home_location),
    home_location_geo = coalesce(p.home_location_geo, s.home_location_geo),
    depth = coalesce(p.depth, s.depth),
    depth_source = p.depth_source, -- primary's source bleibt
    purpose = coalesce(p.purpose, s.purpose),
    -- mode: primary behält seinen Wert (NOT NULL).
    next_nudge_at = greatest(p.next_nudge_at, s.next_nudge_at),
    last_contact_at = greatest(p.last_contact_at, s.last_contact_at),
    cadence_days = coalesce(p.cadence_days, s.cadence_days),
    linkedin_url = coalesce(p.linkedin_url, s.linkedin_url),
    photo_url = coalesce(p.photo_url, s.photo_url),
    -- JSONB-Arrays: dedup union.
    phones          = jsonb_dedup(coalesce(p.phones, '[]')          || coalesce(s.phones, '[]')),
    emails          = jsonb_dedup(coalesce(p.emails, '[]')          || coalesce(s.emails, '[]')),
    addresses       = jsonb_dedup(coalesce(p.addresses, '[]')       || coalesce(s.addresses, '[]')),
    socials         = jsonb_dedup(coalesce(p.socials, '[]')         || coalesce(s.socials, '[]')),
    important_dates = jsonb_dedup(coalesce(p.important_dates, '[]') || coalesce(s.important_dates, '[]')),
    relationships   = jsonb_dedup(coalesce(p.relationships, '[]')   || coalesce(s.relationships, '[]')),
    updated_at = now()
  where id = primary_id;

  -- ── Secondary soft-deleten ──
  update public.people
  set deleted_at = now(), updated_at = now()
  where id = secondary_id;

  return primary_id;
end;
$$;


ALTER FUNCTION "public"."merge_people"("primary_id" "uuid", "secondary_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rate_limit_increment"("p_user_id" "uuid", "p_key" "text", "p_window_start" timestamp with time zone) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."rate_limit_increment"("p_user_id" "uuid", "p_key" "text", "p_window_start" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rate_limit_sweep"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  delete from public.rate_limits where window_start < now() - interval '1 hour';
$$;


ALTER FUNCTION "public"."rate_limit_sweep"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."circles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "circles_name_not_empty" CHECK (("length"(TRIM(BOTH FROM "name")) > 0))
);


ALTER TABLE "public"."circles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pipeline_id" "uuid" NOT NULL,
    "stage_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "person_id" "uuid",
    "organization_id" "uuid",
    "value" numeric,
    "currency" "text",
    "expected_close_date" "date",
    "probability" integer,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "field_values" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "deals_probability_check" CHECK ((("probability" IS NULL) OR (("probability" >= 0) AND ("probability" <= 100)))),
    CONSTRAINT "deals_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'won'::"text", 'lost'::"text"])))
);


ALTER TABLE "public"."deals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."debriefs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "summary" "text",
    "interaction_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "action_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "duration_sec" integer,
    "audio_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."debriefs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interactions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "person_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "type" "text" NOT NULL,
    "source" "text" NOT NULL,
    "summary" "text",
    "transcript" "text",
    "sentiment" "text",
    "topics" "text"[] DEFAULT '{}'::"text"[],
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "direction" "text",
    "duration_minutes" integer,
    "ai_extracted_facts" "jsonb",
    "external_id" "text",
    "file_path" "text",
    "file_name" "text",
    "file_size_bytes" integer,
    "mime_type" "text",
    CONSTRAINT "interactions_direction_check" CHECK ((("direction" IS NULL) OR ("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text", 'mutual'::"text"])))),
    CONSTRAINT "interactions_sentiment_check" CHECK (("sentiment" = ANY (ARRAY['positive'::"text", 'neutral'::"text", 'tense'::"text"]))),
    CONSTRAINT "interactions_source_check" CHECK (("source" = ANY (ARRAY['debrief'::"text", 'manual'::"text", 'calendar'::"text"]))),
    CONSTRAINT "interactions_type_check" CHECK (("type" = ANY (ARRAY['meeting'::"text", 'call'::"text", 'email'::"text", 'note'::"text", 'voice'::"text"])))
);


ALTER TABLE "public"."interactions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."interactions"."transcript" IS 'Extrahierter Text aus dem hochgeladenen File. Geht in den LLM-Kontext via loadPeopleContext.';



COMMENT ON COLUMN "public"."interactions"."file_path" IS 'Pfad in Supabase Storage (life-events Bucket): {user_id}/interactions/{interaction_id}/{filename}';



CREATE TABLE IF NOT EXISTS "public"."life_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "event_type" "text" NOT NULL,
    "occurred_at" timestamp with time zone NOT NULL,
    "file_path" "text",
    "file_size_bytes" integer,
    "mime_type" "text",
    "thumbnail_path" "text",
    "location_name" "text",
    "google_place_id" "text",
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "life_events_title_not_empty" CHECK (("length"(TRIM(BOTH FROM "title")) > 0)),
    CONSTRAINT "life_events_type_check" CHECK (("event_type" = ANY (ARRAY['photo'::"text", 'document'::"text", 'voice_note'::"text", 'milestone'::"text", 'note'::"text"])))
);


ALTER TABLE "public"."life_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "person_id" "uuid",
    "title" "text",
    "body" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "notes_source_check" CHECK (("source" = ANY (ARRAY['voice'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "domain" "text",
    "website" "text",
    "industry" "text",
    "size" "text",
    "hq" "text",
    "description" "text",
    "notes" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "enriched_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."passions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text",
    CONSTRAINT "passions_name_not_empty" CHECK (("length"(TRIM(BOTH FROM "name")) > 0))
);


ALTER TABLE "public"."passions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."people" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "company" "text",
    "role" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "phones" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "emails" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "addresses" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "socials" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "important_dates" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "relationships" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notes" "text",
    "is_self" boolean DEFAULT false NOT NULL,
    "organization_id" "uuid",
    "how_we_met" "text",
    "met_date" "date",
    "met_location" "text",
    "depth" "text",
    "depth_source" "text" DEFAULT 'auto'::"text" NOT NULL,
    "purpose" "text",
    "mode" "text" DEFAULT 'active'::"text" NOT NULL,
    "next_nudge_at" timestamp with time zone,
    "last_contact_at" timestamp with time zone,
    "cadence_days" integer,
    "linkedin_url" "text",
    "photo_url" "text",
    "current_location" "text",
    "home_location" "text",
    "current_location_geo" "jsonb",
    "home_location_geo" "jsonb",
    "met_location_geo" "jsonb",
    "scope" "text" DEFAULT 'both'::"text" NOT NULL,
    "gift_idea" "text",
    "primary_language" "text",
    "secondary_language" "text",
    "synergies" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "custom_field_values" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "introduced_by" "text",
    "met_with" "text",
    "introduced_by_person_id" "uuid",
    "met_with_person_id" "uuid",
    "synergy_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "people_depth_check" CHECK ((("depth" IS NULL) OR ("depth" = ANY (ARRAY['inner_5'::"text", 'trusted_15'::"text", 'active_50'::"text", 'network_150'::"text", 'periphery_500'::"text"])))),
    CONSTRAINT "people_depth_source_check" CHECK (("depth_source" = ANY (ARRAY['auto'::"text", 'manual_override'::"text"]))),
    CONSTRAINT "people_mode_check" CHECK (("mode" = ANY (ARRAY['active'::"text", 'nurture'::"text", 'cold'::"text", 'dormant'::"text", 'reconnect'::"text", 'archive'::"text"]))),
    CONSTRAINT "people_purpose_check" CHECK ((("purpose" IS NULL) OR ("purpose" = ANY (ARRAY['personal'::"text", 'family'::"text", 'business_active'::"text", 'business_latent'::"text", 'aspirational'::"text"])))),
    CONSTRAINT "people_scope_check" CHECK (("scope" = ANY (ARRAY['work'::"text", 'personal'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."people" OWNER TO "postgres";


COMMENT ON COLUMN "public"."people"."gift_idea" IS 'Freitext-Vorschlag was man dieser Person schenken würde. UI-Label: "Geschenk".';



CREATE TABLE IF NOT EXISTS "public"."person_circles" (
    "person_id" "uuid" NOT NULL,
    "circle_id" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text"
);


ALTER TABLE "public"."person_circles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."person_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "subtype" "text",
    "value" "text" NOT NULL,
    "country_code" character(2),
    "is_primary" boolean DEFAULT false NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "person_contacts_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'phone'::"text", 'whatsapp'::"text", 'linkedin'::"text", 'telegram'::"text", 'signal'::"text", 'sms'::"text", 'calendly'::"text", 'website'::"text", 'instagram'::"text", 'twitter'::"text", 'github'::"text", 'mastodon'::"text", 'bluesky'::"text", 'threads'::"text", 'tiktok'::"text", 'other'::"text"]))),
    CONSTRAINT "person_contacts_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'pdl_enrichment'::"text", 'linkedin'::"text", 'vcard_import'::"text", 'voice_extract'::"text", 'ai_suggested'::"text"])))
);


ALTER TABLE "public"."person_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."person_geographies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "geo_type" "text" NOT NULL,
    "custom_label" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "display_name" "text" NOT NULL,
    "street" "text",
    "postal_code" "text",
    "city" "text",
    "region" "text",
    "country" "text",
    "country_code" character(2),
    "latitude" double precision,
    "longitude" double precision,
    "place_id" "text",
    "precision" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "person_geographies_geo_type_check" CHECK (("geo_type" = ANY (ARRAY['wohnsitz_1'::"text", 'wohnsitz_2'::"text", 'residence'::"text", 'origin'::"text", 'professional_hub'::"text", 'current_location'::"text", 'met_location'::"text", 'custom'::"text"]))),
    CONSTRAINT "person_geographies_precision_check" CHECK (("precision" = ANY (ARRAY['address'::"text", 'city'::"text", 'region'::"text", 'country'::"text"])))
);


ALTER TABLE "public"."person_geographies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."person_life_events" (
    "person_id" "uuid" NOT NULL,
    "life_event_id" "uuid" NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."person_life_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."person_relationships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "related_person_id" "uuid" NOT NULL,
    "relationship_type" "text" NOT NULL,
    "label" "text",
    "created_by" "text" DEFAULT 'user'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "person_relationships_check" CHECK (("person_id" <> "related_person_id")),
    CONSTRAINT "person_relationships_created_by_check" CHECK (("created_by" = ANY (ARRAY['user'::"text", 'ai_suggested'::"text"]))),
    CONSTRAINT "person_relationships_relationship_type_check" CHECK (("relationship_type" = ANY (ARRAY['introduced_by'::"text", 'colleague'::"text", 'co_founder'::"text", 'mentor'::"text", 'mentee'::"text", 'former_manager'::"text", 'family'::"text", 'friend'::"text", 'investor'::"text", 'advisor'::"text", 'partner'::"text", 'spouse'::"text", 'parent'::"text", 'child'::"text", 'sibling'::"text", 'assistant'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."person_relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."person_tags" (
    "person_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text"
);


ALTER TABLE "public"."person_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipelines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "entity_type" "text" DEFAULT 'both'::"text" NOT NULL,
    "stages" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "field_definitions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "default_currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "pipelines_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['person'::"text", 'organization'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."pipelines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "timezone" "text" DEFAULT 'Europe/Berlin'::"text",
    "language" "text" DEFAULT 'de'::"text",
    "voice_id" "text" DEFAULT 'tnSpp4vdxKPjI9w0GnoV'::"text",
    "debrief_time" time without time zone DEFAULT '21:30:00'::time without time zone,
    "claude_key_byo" "text",
    "elevenlabs_key_byo" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "model_preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "byo_api_keys" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "subscription_tier" "text" DEFAULT 'free'::"text" NOT NULL,
    "subscription_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "subscription_current_period_end" timestamp with time zone,
    "subscription_cancel_at" timestamp with time zone,
    "subscription_started_at" timestamp with time zone,
    "onboarding_progress" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "message_style" "text" DEFAULT 'locker'::"text" NOT NULL,
    "custom_field_defs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "custom_date_labels" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "default_contact_language" "text",
    CONSTRAINT "profiles_message_style_check" CHECK (("message_style" = ANY (ARRAY['locker'::"text", 'professionell'::"text"]))),
    CONSTRAINT "profiles_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['none'::"text", 'trialing'::"text", 'active'::"text", 'past_due'::"text", 'canceled'::"text", 'incomplete'::"text", 'incomplete_expired'::"text", 'unpaid'::"text", 'paused'::"text"]))),
    CONSTRAINT "profiles_subscription_tier_check" CHECK (("subscription_tier" = ANY (ARRAY['free'::"text", 'basic'::"text", 'advanced'::"text", 'pro'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "user_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reminders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "person_id" "uuid",
    "text" "text" NOT NULL,
    "remind_at" timestamp with time zone NOT NULL,
    "recurrence" "text" DEFAULT 'once'::"text" NOT NULL,
    "type" "text" DEFAULT 'custom'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "reminders_recurrence_check" CHECK (("recurrence" = ANY (ARRAY['once'::"text", 'weekly'::"text", 'monthly'::"text", 'yearly'::"text"]))),
    CONSTRAINT "reminders_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'voice'::"text", 'ai-generated'::"text"]))),
    CONSTRAINT "reminders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'done'::"text", 'snoozed'::"text"]))),
    CONSTRAINT "reminders_type_check" CHECK (("type" = ANY (ARRAY['check-in'::"text", 'birthday'::"text", 'promise'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."reminders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "account_label" "text",
    "access_token" "text",
    "refresh_token" "text",
    "token_expires_at" timestamp with time zone,
    "scopes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_error" "text",
    "connected_at" timestamp with time zone,
    "last_used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "service_connections_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'connected'::"text", 'error'::"text", 'expired'::"text", 'disconnected'::"text"])))
);


ALTER TABLE "public"."service_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "suggestion_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "reasoning" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    CONSTRAINT "suggestions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "suggestions_type_check" CHECK (("suggestion_type" = ANY (ARRAY['tag'::"text", 'cadence'::"text", 'cta'::"text", 'connection'::"text", 'reconnect'::"text", 'depth_change'::"text", 'mode_change'::"text", 'merge_duplicate'::"text", 'purpose_mapping'::"text", 'how_we_met_extract'::"text", 'field_enrichment'::"text"])))
);


ALTER TABLE "public"."suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "cluster" "text" DEFAULT 'interests'::"text" NOT NULL,
    "created_by" "text" DEFAULT 'user'::"text" NOT NULL,
    "usage_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tags_cluster_check" CHECK (("cluster" = ANY (ARRAY['reminders'::"text", 'interests'::"text", 'potential'::"text", 'origin'::"text"]))),
    CONSTRAINT "tags_created_by_check" CHECK (("created_by" = ANY (ARRAY['user'::"text", 'ai_suggested'::"text", 'ai_extracted'::"text"]))),
    CONSTRAINT "tags_name_not_empty" CHECK (("length"(TRIM(BOTH FROM "name")) > 0))
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."todos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "person_id" "uuid",
    "text" "text" NOT NULL,
    "due_date" "date",
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "source_debrief_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "todos_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "todos_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'done'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."todos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "nodes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "edges" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "default_model_preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "workflows_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'enabled'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."workflows" OWNER TO "postgres";


ALTER TABLE ONLY "public"."circles"
    ADD CONSTRAINT "circles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."debriefs"
    ADD CONSTRAINT "debriefs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."life_events"
    ADD CONSTRAINT "life_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."passions"
    ADD CONSTRAINT "passions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."person_circles"
    ADD CONSTRAINT "person_circles_pkey" PRIMARY KEY ("person_id", "circle_id");



ALTER TABLE ONLY "public"."person_contacts"
    ADD CONSTRAINT "person_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."person_geographies"
    ADD CONSTRAINT "person_geographies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."person_life_events"
    ADD CONSTRAINT "person_life_events_pkey" PRIMARY KEY ("person_id", "life_event_id");



ALTER TABLE ONLY "public"."person_relationships"
    ADD CONSTRAINT "person_relationships_person_id_related_person_id_relationsh_key" UNIQUE ("person_id", "related_person_id", "relationship_type");



ALTER TABLE ONLY "public"."person_relationships"
    ADD CONSTRAINT "person_relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."person_tags"
    ADD CONSTRAINT "person_tags_pkey" PRIMARY KEY ("person_id", "tag_id");



ALTER TABLE ONLY "public"."pipelines"
    ADD CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("user_id", "key", "window_start");



ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_connections"
    ADD CONSTRAINT "service_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_connections"
    ADD CONSTRAINT "service_connections_user_id_provider_key" UNIQUE ("user_id", "provider");



ALTER TABLE ONLY "public"."suggestions"
    ADD CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."todos"
    ADD CONSTRAINT "todos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_circles_user" ON "public"."circles" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_circles_user_lower_name" ON "public"."circles" USING "btree" ("user_id", "lower"("name"));



CREATE INDEX "idx_deals_active" ON "public"."deals" USING "btree" ("user_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_deals_organization" ON "public"."deals" USING "btree" ("organization_id");



CREATE INDEX "idx_deals_person" ON "public"."deals" USING "btree" ("person_id");



CREATE INDEX "idx_deals_pipeline_stage" ON "public"."deals" USING "btree" ("pipeline_id", "stage_id", "status", "deleted_at");



CREATE INDEX "idx_debriefs_user_date" ON "public"."debriefs" USING "btree" ("user_id", "date" DESC);



CREATE INDEX "idx_interactions_user_occurred" ON "public"."interactions" USING "btree" ("user_id", "occurred_at" DESC);



CREATE INDEX "idx_life_events_type" ON "public"."life_events" USING "btree" ("user_id", "event_type") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_life_events_user_occurred" ON "public"."life_events" USING "btree" ("user_id", "occurred_at" DESC) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_notes_user_person" ON "public"."notes" USING "btree" ("user_id", "person_id");



CREATE INDEX "idx_organizations_active" ON "public"."organizations" USING "btree" ("user_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_organizations_user_active" ON "public"."organizations" USING "btree" ("user_id", "deleted_at");



CREATE INDEX "idx_organizations_user_domain" ON "public"."organizations" USING "btree" ("user_id", "lower"("domain")) WHERE (("domain" IS NOT NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "idx_organizations_user_name" ON "public"."organizations" USING "btree" ("user_id", "name");



CREATE INDEX "idx_passions_person" ON "public"."passions" USING "btree" ("person_id");



CREATE UNIQUE INDEX "idx_passions_person_lower_name" ON "public"."passions" USING "btree" ("person_id", "lower"("name"));



CREATE INDEX "idx_passions_user" ON "public"."passions" USING "btree" ("user_id");



CREATE INDEX "idx_people_depth" ON "public"."people" USING "btree" ("user_id", "depth") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_people_emails_gin" ON "public"."people" USING "gin" ("emails");



CREATE INDEX "idx_people_last_contact" ON "public"."people" USING "btree" ("user_id", "last_contact_at" DESC NULLS LAST) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_people_met_date" ON "public"."people" USING "btree" ("user_id", "met_date" DESC NULLS LAST) WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_people_mode" ON "public"."people" USING "btree" ("user_id", "mode") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_people_next_nudge" ON "public"."people" USING "btree" ("user_id", "next_nudge_at") WHERE (("mode" = 'active'::"text") AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "idx_people_one_self_per_user" ON "public"."people" USING "btree" ("user_id") WHERE ("is_self" = true);



CREATE INDEX "idx_people_organization" ON "public"."people" USING "btree" ("organization_id");



CREATE INDEX "idx_people_phones_gin" ON "public"."people" USING "gin" ("phones");



CREATE INDEX "idx_people_purpose" ON "public"."people" USING "btree" ("user_id", "purpose") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_people_relationships" ON "public"."people" USING "gin" ("relationships");



CREATE INDEX "idx_people_user_name" ON "public"."people" USING "btree" ("user_id", "name");



CREATE INDEX "idx_person_circles_circle" ON "public"."person_circles" USING "btree" ("circle_id");



CREATE INDEX "idx_person_tags_tag" ON "public"."person_tags" USING "btree" ("tag_id");



CREATE INDEX "idx_pipelines_active" ON "public"."pipelines" USING "btree" ("user_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_pipelines_user" ON "public"."pipelines" USING "btree" ("user_id", "deleted_at");



CREATE INDEX "idx_ple_event" ON "public"."person_life_events" USING "btree" ("life_event_id");



CREATE INDEX "idx_rate_limits_window" ON "public"."rate_limits" USING "btree" ("window_start");



CREATE INDEX "idx_reminders_user_status_remind" ON "public"."reminders" USING "btree" ("user_id", "status", "remind_at");



CREATE INDEX "idx_service_connections_user_status" ON "public"."service_connections" USING "btree" ("user_id", "status");



CREATE INDEX "idx_suggestions_pending" ON "public"."suggestions" USING "btree" ("user_id", "created_at" DESC) WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_suggestions_person" ON "public"."suggestions" USING "btree" ("person_id", "created_at" DESC);



CREATE INDEX "idx_tags_user_cluster" ON "public"."tags" USING "btree" ("user_id", "cluster");



CREATE UNIQUE INDEX "idx_tags_user_lower_name_cluster" ON "public"."tags" USING "btree" ("user_id", "lower"("name"), "cluster");



CREATE INDEX "idx_tags_user_name" ON "public"."tags" USING "btree" ("user_id", "name");



CREATE INDEX "idx_todos_user_status_due" ON "public"."todos" USING "btree" ("user_id", "status", "due_date");



CREATE INDEX "idx_workflows_active" ON "public"."workflows" USING "btree" ("user_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_workflows_user_status" ON "public"."workflows" USING "btree" ("user_id", "status", "deleted_at");



CREATE INDEX "people_synergies_gin_idx" ON "public"."people" USING "gin" ("synergies");



CREATE INDEX "people_synergy_tags_gin_idx" ON "public"."people" USING "gin" ("synergy_tags");



CREATE INDEX "person_contacts_person_idx" ON "public"."person_contacts" USING "btree" ("person_id");



CREATE INDEX "person_contacts_user_channel_value_idx" ON "public"."person_contacts" USING "btree" ("user_id", "channel", "lower"("value"));



CREATE INDEX "person_geographies_person_idx" ON "public"."person_geographies" USING "btree" ("person_id");



CREATE INDEX "person_geographies_user_city_idx" ON "public"."person_geographies" USING "btree" ("user_id", "lower"("city"));



CREATE INDEX "person_geographies_user_country_idx" ON "public"."person_geographies" USING "btree" ("user_id", "country_code");



CREATE INDEX "person_relationships_person_idx" ON "public"."person_relationships" USING "btree" ("person_id");



CREATE INDEX "person_relationships_related_idx" ON "public"."person_relationships" USING "btree" ("related_person_id");



CREATE UNIQUE INDEX "profiles_stripe_customer_id_idx" ON "public"."profiles" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_stripe_subscription_id_idx" ON "public"."profiles" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE UNIQUE INDEX "uniq_interactions_external_id" ON "public"."interactions" USING "btree" ("user_id", "external_id") WHERE ("external_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_organizations_user_name_ci" ON "public"."organizations" USING "btree" ("user_id", "lower"(TRIM(BOTH FROM "name"))) WHERE ("deleted_at" IS NULL);



CREATE OR REPLACE TRIGGER "notes_updated_at" BEFORE UPDATE ON "public"."notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "people_updated_at" BEFORE UPDATE ON "public"."people" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_tag_usage_delete" AFTER DELETE ON "public"."person_tags" FOR EACH ROW EXECUTE FUNCTION "public"."bump_tag_usage"();



CREATE OR REPLACE TRIGGER "trg_tag_usage_insert" AFTER INSERT ON "public"."person_tags" FOR EACH ROW EXECUTE FUNCTION "public"."bump_tag_usage"();



ALTER TABLE ONLY "public"."circles"
    ADD CONSTRAINT "circles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."debriefs"
    ADD CONSTRAINT "debriefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."life_events"
    ADD CONSTRAINT "life_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."passions"
    ADD CONSTRAINT "passions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."passions"
    ADD CONSTRAINT "passions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_introduced_by_person_id_fkey" FOREIGN KEY ("introduced_by_person_id") REFERENCES "public"."people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_met_with_person_id_fkey" FOREIGN KEY ("met_with_person_id") REFERENCES "public"."people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_circles"
    ADD CONSTRAINT "person_circles_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_circles"
    ADD CONSTRAINT "person_circles_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_contacts"
    ADD CONSTRAINT "person_contacts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_contacts"
    ADD CONSTRAINT "person_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_geographies"
    ADD CONSTRAINT "person_geographies_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_geographies"
    ADD CONSTRAINT "person_geographies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_life_events"
    ADD CONSTRAINT "person_life_events_life_event_id_fkey" FOREIGN KEY ("life_event_id") REFERENCES "public"."life_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_life_events"
    ADD CONSTRAINT "person_life_events_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_relationships"
    ADD CONSTRAINT "person_relationships_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_relationships"
    ADD CONSTRAINT "person_relationships_related_person_id_fkey" FOREIGN KEY ("related_person_id") REFERENCES "public"."people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_relationships"
    ADD CONSTRAINT "person_relationships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_tags"
    ADD CONSTRAINT "person_tags_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_tags"
    ADD CONSTRAINT "person_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pipelines"
    ADD CONSTRAINT "pipelines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_connections"
    ADD CONSTRAINT "service_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suggestions"
    ADD CONSTRAINT "suggestions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suggestions"
    ADD CONSTRAINT "suggestions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todos"
    ADD CONSTRAINT "todos_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."todos"
    ADD CONSTRAINT "todos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can delete own debriefs" ON "public"."debriefs" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own interactions" ON "public"."interactions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own notes" ON "public"."notes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own people" ON "public"."people" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own reminders" ON "public"."reminders" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own todos" ON "public"."todos" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own debriefs" ON "public"."debriefs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own interactions" ON "public"."interactions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own notes" ON "public"."notes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own people" ON "public"."people" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own reminders" ON "public"."reminders" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own todos" ON "public"."todos" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own debriefs" ON "public"."debriefs" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own interactions" ON "public"."interactions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own notes" ON "public"."notes" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own people" ON "public"."people" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own reminders" ON "public"."reminders" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own todos" ON "public"."todos" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own debriefs" ON "public"."debriefs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own interactions" ON "public"."interactions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own notes" ON "public"."notes" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own people" ON "public"."people" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own reminders" ON "public"."reminders" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own todos" ON "public"."todos" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users delete their circles" ON "public"."circles" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users delete their deals" ON "public"."deals" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users delete their life_events" ON "public"."life_events" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users delete their orgs" ON "public"."organizations" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users delete their passions" ON "public"."passions" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users delete their person_circles" ON "public"."person_circles" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."circles"
  WHERE (("circles"."id" = "person_circles"."circle_id") AND ("circles"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users delete their person_life_events" ON "public"."person_life_events" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."life_events"
  WHERE (("life_events"."id" = "person_life_events"."life_event_id") AND ("life_events"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users delete their person_tags" ON "public"."person_tags" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."tags"
  WHERE (("tags"."id" = "person_tags"."tag_id") AND ("tags"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users delete their pipelines" ON "public"."pipelines" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users delete their rate limits" ON "public"."rate_limits" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users delete their service connections" ON "public"."service_connections" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users delete their suggestions" ON "public"."suggestions" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users delete their tags" ON "public"."tags" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users delete their workflows" ON "public"."workflows" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users insert their circles" ON "public"."circles" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users insert their deals" ON "public"."deals" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users insert their life_events" ON "public"."life_events" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users insert their orgs" ON "public"."organizations" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users insert their passions" ON "public"."passions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users insert their person_circles" ON "public"."person_circles" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."circles"
  WHERE (("circles"."id" = "person_circles"."circle_id") AND ("circles"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users insert their person_life_events" ON "public"."person_life_events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."life_events"
  WHERE (("life_events"."id" = "person_life_events"."life_event_id") AND ("life_events"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users insert their person_tags" ON "public"."person_tags" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tags"
  WHERE (("tags"."id" = "person_tags"."tag_id") AND ("tags"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users insert their pipelines" ON "public"."pipelines" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users insert their rate limits" ON "public"."rate_limits" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users insert their service connections" ON "public"."service_connections" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users insert their suggestions" ON "public"."suggestions" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users insert their tags" ON "public"."tags" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users insert their workflows" ON "public"."workflows" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users see their circles" ON "public"."circles" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users see their deals" ON "public"."deals" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users see their life_events" ON "public"."life_events" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users see their orgs" ON "public"."organizations" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users see their passions" ON "public"."passions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users see their person_circles" ON "public"."person_circles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."circles"
  WHERE (("circles"."id" = "person_circles"."circle_id") AND ("circles"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users see their person_life_events" ON "public"."person_life_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."life_events"
  WHERE (("life_events"."id" = "person_life_events"."life_event_id") AND ("life_events"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users see their person_tags" ON "public"."person_tags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tags"
  WHERE (("tags"."id" = "person_tags"."tag_id") AND ("tags"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users see their pipelines" ON "public"."pipelines" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users see their rate limits" ON "public"."rate_limits" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users see their service connections" ON "public"."service_connections" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users see their suggestions" ON "public"."suggestions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users see their tags" ON "public"."tags" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users see their workflows" ON "public"."workflows" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users update their circles" ON "public"."circles" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users update their deals" ON "public"."deals" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users update their life_events" ON "public"."life_events" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users update their orgs" ON "public"."organizations" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users update their passions" ON "public"."passions" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users update their pipelines" ON "public"."pipelines" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users update their rate limits" ON "public"."rate_limits" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users update their service connections" ON "public"."service_connections" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users update their suggestions" ON "public"."suggestions" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users update their tags" ON "public"."tags" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users update their workflows" ON "public"."workflows" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."circles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."debriefs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."life_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."passions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."people" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."person_circles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."person_contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "person_contacts owner delete" ON "public"."person_contacts" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "person_contacts owner insert" ON "public"."person_contacts" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "person_contacts owner read" ON "public"."person_contacts" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "person_contacts owner update" ON "public"."person_contacts" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."person_geographies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "person_geographies owner delete" ON "public"."person_geographies" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "person_geographies owner insert" ON "public"."person_geographies" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "person_geographies owner read" ON "public"."person_geographies" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "person_geographies owner update" ON "public"."person_geographies" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."person_life_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."person_relationships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "person_relationships owner delete" ON "public"."person_relationships" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "person_relationships owner insert" ON "public"."person_relationships" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "person_relationships owner read" ON "public"."person_relationships" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "person_relationships owner update" ON "public"."person_relationships" FOR UPDATE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."person_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipelines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reminders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."todos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflows" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_overview_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_overview_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_users_list"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_users_list"() TO "service_role";



GRANT ALL ON FUNCTION "public"."bump_tag_usage"() TO "anon";
GRANT ALL ON FUNCTION "public"."bump_tag_usage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_tag_usage"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."jsonb_dedup"("arr" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."jsonb_dedup"("arr" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."jsonb_dedup"("arr" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."merge_organizations"("primary_id" "uuid", "secondary_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."merge_organizations"("primary_id" "uuid", "secondary_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_organizations"("primary_id" "uuid", "secondary_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_organizations"("primary_id" "uuid", "secondary_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."merge_people"("primary_id" "uuid", "secondary_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."merge_people"("primary_id" "uuid", "secondary_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_people"("primary_id" "uuid", "secondary_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_people"("primary_id" "uuid", "secondary_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rate_limit_increment"("p_user_id" "uuid", "p_key" "text", "p_window_start" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."rate_limit_increment"("p_user_id" "uuid", "p_key" "text", "p_window_start" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rate_limit_increment"("p_user_id" "uuid", "p_key" "text", "p_window_start" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."rate_limit_sweep"() TO "anon";
GRANT ALL ON FUNCTION "public"."rate_limit_sweep"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rate_limit_sweep"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."circles" TO "anon";
GRANT ALL ON TABLE "public"."circles" TO "authenticated";
GRANT ALL ON TABLE "public"."circles" TO "service_role";



GRANT ALL ON TABLE "public"."deals" TO "anon";
GRANT ALL ON TABLE "public"."deals" TO "authenticated";
GRANT ALL ON TABLE "public"."deals" TO "service_role";



GRANT ALL ON TABLE "public"."debriefs" TO "anon";
GRANT ALL ON TABLE "public"."debriefs" TO "authenticated";
GRANT ALL ON TABLE "public"."debriefs" TO "service_role";



GRANT ALL ON TABLE "public"."interactions" TO "anon";
GRANT ALL ON TABLE "public"."interactions" TO "authenticated";
GRANT ALL ON TABLE "public"."interactions" TO "service_role";



GRANT ALL ON TABLE "public"."life_events" TO "anon";
GRANT ALL ON TABLE "public"."life_events" TO "authenticated";
GRANT ALL ON TABLE "public"."life_events" TO "service_role";



GRANT ALL ON TABLE "public"."notes" TO "anon";
GRANT ALL ON TABLE "public"."notes" TO "authenticated";
GRANT ALL ON TABLE "public"."notes" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."passions" TO "anon";
GRANT ALL ON TABLE "public"."passions" TO "authenticated";
GRANT ALL ON TABLE "public"."passions" TO "service_role";



GRANT ALL ON TABLE "public"."people" TO "anon";
GRANT ALL ON TABLE "public"."people" TO "authenticated";
GRANT ALL ON TABLE "public"."people" TO "service_role";



GRANT ALL ON TABLE "public"."person_circles" TO "anon";
GRANT ALL ON TABLE "public"."person_circles" TO "authenticated";
GRANT ALL ON TABLE "public"."person_circles" TO "service_role";



GRANT ALL ON TABLE "public"."person_contacts" TO "anon";
GRANT ALL ON TABLE "public"."person_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."person_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."person_geographies" TO "anon";
GRANT ALL ON TABLE "public"."person_geographies" TO "authenticated";
GRANT ALL ON TABLE "public"."person_geographies" TO "service_role";



GRANT ALL ON TABLE "public"."person_life_events" TO "anon";
GRANT ALL ON TABLE "public"."person_life_events" TO "authenticated";
GRANT ALL ON TABLE "public"."person_life_events" TO "service_role";



GRANT ALL ON TABLE "public"."person_relationships" TO "anon";
GRANT ALL ON TABLE "public"."person_relationships" TO "authenticated";
GRANT ALL ON TABLE "public"."person_relationships" TO "service_role";



GRANT ALL ON TABLE "public"."person_tags" TO "anon";
GRANT ALL ON TABLE "public"."person_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."person_tags" TO "service_role";



GRANT ALL ON TABLE "public"."pipelines" TO "anon";
GRANT ALL ON TABLE "public"."pipelines" TO "authenticated";
GRANT ALL ON TABLE "public"."pipelines" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."reminders" TO "anon";
GRANT ALL ON TABLE "public"."reminders" TO "authenticated";
GRANT ALL ON TABLE "public"."reminders" TO "service_role";



GRANT ALL ON TABLE "public"."service_connections" TO "anon";
GRANT ALL ON TABLE "public"."service_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."service_connections" TO "service_role";



GRANT ALL ON TABLE "public"."suggestions" TO "anon";
GRANT ALL ON TABLE "public"."suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT ALL ON TABLE "public"."todos" TO "anon";
GRANT ALL ON TABLE "public"."todos" TO "authenticated";
GRANT ALL ON TABLE "public"."todos" TO "service_role";



GRANT ALL ON TABLE "public"."workflows" TO "anon";
GRANT ALL ON TABLE "public"."workflows" TO "authenticated";
GRANT ALL ON TABLE "public"."workflows" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







