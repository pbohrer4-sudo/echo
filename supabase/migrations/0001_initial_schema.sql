-- supabase/migrations/0001_initial_schema.sql
--
-- ECHO — initial public schema baseline (re-captured post-hoc from live DB)
--
-- This file documents the live Supabase schema as of refactor/3-axis-model
-- branch creation (12. Mai 2026). The schema was never versioned through
-- migrations 0001/0011/0012/0013 — those numbers were skipped in the
-- supabase/migrations/ folder because the corresponding ALTER/CREATE
-- statements were applied directly in Supabase Studio.
--
-- This file IS the canonical record of the post-hoc baseline. Migrations
-- 0002 through 0018 (which exist as files in this directory) are additive
-- ALTER/CREATE-IF-NOT-EXISTS statements applied on top of this baseline.
--
-- Generated via `pg_dump --schema-only --no-owner --no-acl --schema=public`
-- against the live db, then filtered to public-schema objects only.
--
-- NOT idempotent — re-running on a fresh database would create tables;
-- on the live database the existing objects would conflict. The intent
-- is documentation, not re-application. For a from-scratch rebuild,
-- apply this file first, then 0002-0018 in order.
--

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


--
-- Name: admin_overview_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_overview_stats() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
--
-- Name: admin_users_list(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_users_list() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
--
-- Name: rate_limit_increment(uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rate_limit_increment(p_user_id uuid, p_key text, p_window_start timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
--
-- Name: rate_limit_sweep(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rate_limit_sweep() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from public.rate_limits where window_start < now() - interval '1 hour';
$$;


--
--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
--
-- Name: connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connections (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    from_person_id uuid NOT NULL,
    to_person_id uuid NOT NULL,
    relationship_type text,
    strength integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT connections_strength_check CHECK (((strength >= 0) AND (strength <= 100))),
    CONSTRAINT different_people CHECK ((from_person_id <> to_person_id))
);


--
--
-- Name: deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    pipeline_id uuid NOT NULL,
    stage_id text NOT NULL,
    title text NOT NULL,
    person_id uuid,
    organization_id uuid,
    value numeric,
    currency text,
    expected_close_date date,
    probability integer,
    status text DEFAULT 'open'::text NOT NULL,
    field_values jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT deals_probability_check CHECK (((probability IS NULL) OR ((probability >= 0) AND (probability <= 100)))),
    CONSTRAINT deals_status_check CHECK ((status = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text])))
);


--
--
-- Name: debriefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.debriefs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    summary text,
    interaction_ids uuid[] DEFAULT '{}'::uuid[],
    action_ids uuid[] DEFAULT '{}'::uuid[],
    duration_sec integer,
    audio_url text,
    created_at timestamp with time zone DEFAULT now()
);


--
--
-- Name: interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.interactions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    person_ids uuid[] DEFAULT '{}'::uuid[],
    type text NOT NULL,
    source text NOT NULL,
    summary text,
    transcript text,
    sentiment text,
    topics text[] DEFAULT '{}'::text[],
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT interactions_sentiment_check CHECK ((sentiment = ANY (ARRAY['positive'::text, 'neutral'::text, 'tense'::text]))),
    CONSTRAINT interactions_source_check CHECK ((source = ANY (ARRAY['debrief'::text, 'manual'::text, 'calendar'::text]))),
    CONSTRAINT interactions_type_check CHECK ((type = ANY (ARRAY['meeting'::text, 'call'::text, 'email'::text, 'note'::text, 'voice'::text])))
);


--
--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    person_id uuid,
    title text,
    body text,
    tags text[] DEFAULT '{}'::text[],
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notes_source_check CHECK ((source = ANY (ARRAY['voice'::text, 'manual'::text])))
);


--
--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    domain text,
    website text,
    industry text,
    size text,
    hq text,
    description text,
    notes text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    enriched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
--
-- Name: people; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.people (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    company text,
    role text,
    scope text DEFAULT 'both'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    expected_cadence_days integer,
    strength_score integer,
    last_interaction_at timestamp with time zone,
    next_best_action text,
    birthday date,
    phone text,
    email text,
    notes_summary text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    phones jsonb DEFAULT '[]'::jsonb NOT NULL,
    emails jsonb DEFAULT '[]'::jsonb NOT NULL,
    addresses jsonb DEFAULT '[]'::jsonb NOT NULL,
    socials jsonb DEFAULT '[]'::jsonb NOT NULL,
    important_dates jsonb DEFAULT '[]'::jsonb NOT NULL,
    relationships jsonb DEFAULT '[]'::jsonb NOT NULL,
    avatar_url text,
    notes text,
    is_self boolean DEFAULT false NOT NULL,
    organization_id uuid,
    stakeholder_types text[] DEFAULT '{}'::text[] NOT NULL,
    stakeholder_sub_types jsonb DEFAULT '{}'::jsonb NOT NULL,
    geographies jsonb DEFAULT '[]'::jsonb NOT NULL,
    industry text,
    job_function text,
    cta text,
    cta_expires_at timestamp with time zone,
    priority text,
    priority_bucket text,
    priority_set_at timestamp with time zone,
    interests text[] DEFAULT '{}'::text[] NOT NULL,
    depth_override text,
    CONSTRAINT people_depth_override_check CHECK (((depth_override IS NULL) OR (depth_override = ANY (ARRAY['Fremd'::text, 'Bekannt'::text, 'Vertraut'::text, 'Persönlich'::text])))),
    CONSTRAINT people_priority_bucket_check CHECK (((priority_bucket IS NULL) OR (priority_bucket = ANY (ARRAY['this-week'::text, 'next-week'::text, 'later'::text])))),
    CONSTRAINT people_priority_check CHECK (((priority IS NULL) OR (priority = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])))),
    CONSTRAINT people_scope_check CHECK ((scope = ANY (ARRAY['work'::text, 'personal'::text, 'both'::text]))),
    CONSTRAINT people_strength_score_check CHECK (((strength_score >= 0) AND (strength_score <= 100)))
);


--
--
-- Name: pipelines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    entity_type text DEFAULT 'both'::text NOT NULL,
    stages jsonb DEFAULT '[]'::jsonb NOT NULL,
    field_definitions jsonb DEFAULT '[]'::jsonb NOT NULL,
    default_currency text DEFAULT 'EUR'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT pipelines_entity_type_check CHECK ((entity_type = ANY (ARRAY['person'::text, 'organization'::text, 'both'::text])))
);


--
--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    display_name text,
    timezone text DEFAULT 'Europe/Berlin'::text,
    language text DEFAULT 'de'::text,
    voice_id text DEFAULT 'tnSpp4vdxKPjI9w0GnoV'::text,
    debrief_time time without time zone DEFAULT '21:30:00'::time without time zone,
    claude_key_byo text,
    elevenlabs_key_byo text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    model_preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    byo_api_keys jsonb DEFAULT '{}'::jsonb NOT NULL,
    subscription_tier text DEFAULT 'free'::text NOT NULL,
    subscription_status text DEFAULT 'none'::text NOT NULL,
    stripe_customer_id text,
    stripe_subscription_id text,
    subscription_current_period_end timestamp with time zone,
    subscription_cancel_at timestamp with time zone,
    subscription_started_at timestamp with time zone,
    onboarding_progress jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT profiles_subscription_status_check CHECK ((subscription_status = ANY (ARRAY['none'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'incomplete'::text, 'incomplete_expired'::text, 'unpaid'::text, 'paused'::text]))),
    CONSTRAINT profiles_subscription_tier_check CHECK ((subscription_tier = ANY (ARRAY['free'::text, 'basic'::text, 'advanced'::text, 'pro'::text])))
);


--
--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    user_id uuid NOT NULL,
    key text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    person_id uuid,
    text text NOT NULL,
    remind_at timestamp with time zone NOT NULL,
    recurrence text DEFAULT 'once'::text NOT NULL,
    type text DEFAULT 'custom'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT reminders_recurrence_check CHECK ((recurrence = ANY (ARRAY['once'::text, 'weekly'::text, 'monthly'::text, 'yearly'::text]))),
    CONSTRAINT reminders_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'voice'::text, 'ai-generated'::text]))),
    CONSTRAINT reminders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'done'::text, 'snoozed'::text]))),
    CONSTRAINT reminders_type_check CHECK ((type = ANY (ARRAY['check-in'::text, 'birthday'::text, 'promise'::text, 'custom'::text])))
);


--
--
-- Name: service_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    account_label text,
    access_token text,
    refresh_token text,
    token_expires_at timestamp with time zone,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_error text,
    connected_at timestamp with time zone,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT service_connections_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'connected'::text, 'error'::text, 'expired'::text, 'disconnected'::text])))
);


--
--
-- Name: todos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.todos (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    person_id uuid,
    text text NOT NULL,
    due_date date,
    priority text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    source_debrief_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT todos_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT todos_status_check CHECK ((status = ANY (ARRAY['open'::text, 'done'::text, 'cancelled'::text])))
);


--
--
-- Name: workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    nodes jsonb DEFAULT '[]'::jsonb NOT NULL,
    edges jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    default_model_preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT workflows_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'enabled'::text, 'disabled'::text])))
);


--
--
-- Name: connections connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_pkey PRIMARY KEY (id);


--
--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pkey PRIMARY KEY (id);


--
--
-- Name: debriefs debriefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debriefs
    ADD CONSTRAINT debriefs_pkey PRIMARY KEY (id);


--
--
-- Name: interactions interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_pkey PRIMARY KEY (id);


--
--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--
--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
--
-- Name: people people_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_pkey PRIMARY KEY (id);


--
--
-- Name: pipelines pipelines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT pipelines_pkey PRIMARY KEY (id);


--
--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (user_id, key, window_start);


--
--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
--
-- Name: service_connections service_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_connections
    ADD CONSTRAINT service_connections_pkey PRIMARY KEY (id);


--
--
-- Name: service_connections service_connections_user_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_connections
    ADD CONSTRAINT service_connections_user_id_provider_key UNIQUE (user_id, provider);


--
--
-- Name: todos todos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_pkey PRIMARY KEY (id);


--
--
-- Name: workflows workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);


--
--
-- Name: idx_connections_user_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connections_user_from ON public.connections USING btree (user_id, from_person_id);


--
--
-- Name: idx_deals_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deals_active ON public.deals USING btree (user_id) WHERE (deleted_at IS NULL);


--
--
-- Name: idx_deals_organization; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deals_organization ON public.deals USING btree (organization_id);


--
--
-- Name: idx_deals_person; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deals_person ON public.deals USING btree (person_id);


--
--
-- Name: idx_deals_pipeline_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deals_pipeline_stage ON public.deals USING btree (pipeline_id, stage_id, status, deleted_at);


--
--
-- Name: idx_debriefs_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debriefs_user_date ON public.debriefs USING btree (user_id, date DESC);


--
--
-- Name: idx_interactions_user_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_interactions_user_occurred ON public.interactions USING btree (user_id, occurred_at DESC);


--
--
-- Name: idx_notes_user_person; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notes_user_person ON public.notes USING btree (user_id, person_id);


--
--
-- Name: idx_organizations_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_active ON public.organizations USING btree (user_id) WHERE (deleted_at IS NULL);


--
--
-- Name: idx_organizations_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_user_active ON public.organizations USING btree (user_id, deleted_at);


--
--
-- Name: idx_organizations_user_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_user_domain ON public.organizations USING btree (user_id, lower(domain)) WHERE ((domain IS NOT NULL) AND (deleted_at IS NULL));


--
--
-- Name: idx_organizations_user_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_user_name ON public.organizations USING btree (user_id, name);


--
--
-- Name: idx_people_cta_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_people_cta_expires ON public.people USING btree (user_id, cta_expires_at) WHERE (cta_expires_at IS NOT NULL);


--
--
-- Name: idx_people_emails_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_people_emails_gin ON public.people USING gin (emails);


--
--
-- Name: idx_people_interests; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_people_interests ON public.people USING gin (interests);


--
--
-- Name: idx_people_one_self_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_people_one_self_per_user ON public.people USING btree (user_id) WHERE (is_self = true);


--
--
-- Name: idx_people_organization; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_people_organization ON public.people USING btree (organization_id);


--
--
-- Name: idx_people_phones_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_people_phones_gin ON public.people USING gin (phones);


--
--
-- Name: idx_people_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_people_priority ON public.people USING btree (priority, priority_bucket);


--
--
-- Name: idx_people_relationships; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_people_relationships ON public.people USING gin (relationships);


--
--
-- Name: idx_people_stakeholder_types; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_people_stakeholder_types ON public.people USING gin (stakeholder_types);


--
--
-- Name: idx_people_user_last_interaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_people_user_last_interaction ON public.people USING btree (user_id, last_interaction_at DESC);


--
--
-- Name: idx_people_user_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_people_user_name ON public.people USING btree (user_id, name);


--
--
-- Name: idx_pipelines_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipelines_active ON public.pipelines USING btree (user_id) WHERE (deleted_at IS NULL);


--
--
-- Name: idx_pipelines_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipelines_user ON public.pipelines USING btree (user_id, deleted_at);


--
--
-- Name: idx_rate_limits_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limits_window ON public.rate_limits USING btree (window_start);


--
--
-- Name: idx_reminders_user_status_remind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminders_user_status_remind ON public.reminders USING btree (user_id, status, remind_at);


--
--
-- Name: idx_service_connections_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_connections_user_status ON public.service_connections USING btree (user_id, status);


--
--
-- Name: idx_todos_user_status_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_todos_user_status_due ON public.todos USING btree (user_id, status, due_date);


--
--
-- Name: idx_workflows_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflows_active ON public.workflows USING btree (user_id) WHERE (deleted_at IS NULL);


--
--
-- Name: idx_workflows_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflows_user_status ON public.workflows USING btree (user_id, status, deleted_at);


--
--
-- Name: profiles_stripe_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_stripe_customer_id_idx ON public.profiles USING btree (stripe_customer_id) WHERE (stripe_customer_id IS NOT NULL);


--
--
-- Name: profiles_stripe_subscription_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_stripe_subscription_id_idx ON public.profiles USING btree (stripe_subscription_id) WHERE (stripe_subscription_id IS NOT NULL);


--
--
-- Name: uq_organizations_user_name_ci; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_organizations_user_name_ci ON public.organizations USING btree (user_id, lower(TRIM(BOTH FROM name))) WHERE (deleted_at IS NULL);


--
--
-- Name: notes notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notes_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: people people_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER people_updated_at BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: connections connections_from_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_from_person_id_fkey FOREIGN KEY (from_person_id) REFERENCES public.people(id) ON DELETE CASCADE;


--
--
-- Name: connections connections_to_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_to_person_id_fkey FOREIGN KEY (to_person_id) REFERENCES public.people(id) ON DELETE CASCADE;


--
--
-- Name: connections connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connections
    ADD CONSTRAINT connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: deals deals_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
--
-- Name: deals deals_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;


--
--
-- Name: deals deals_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE CASCADE;


--
--
-- Name: deals deals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: debriefs debriefs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debriefs
    ADD CONSTRAINT debriefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: interactions interactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.interactions
    ADD CONSTRAINT interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: notes notes_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;


--
--
-- Name: notes notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: organizations organizations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: people people_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;


--
--
-- Name: people people_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.people
    ADD CONSTRAINT people_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: pipelines pipelines_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT pipelines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: rate_limits rate_limits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: reminders reminders_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;


--
--
-- Name: reminders reminders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: service_connections service_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_connections
    ADD CONSTRAINT service_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: todos todos_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_person_id_fkey FOREIGN KEY (person_id) REFERENCES public.people(id) ON DELETE SET NULL;


--
--
-- Name: todos todos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.todos
    ADD CONSTRAINT todos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: workflows workflows_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: connections Users can delete own connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own connections" ON public.connections FOR DELETE USING ((auth.uid() = user_id));


--
--
-- Name: debriefs Users can delete own debriefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own debriefs" ON public.debriefs FOR DELETE USING ((auth.uid() = user_id));


--
--
-- Name: interactions Users can delete own interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own interactions" ON public.interactions FOR DELETE USING ((auth.uid() = user_id));


--
--
-- Name: notes Users can delete own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own notes" ON public.notes FOR DELETE USING ((auth.uid() = user_id));


--
--
-- Name: people Users can delete own people; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own people" ON public.people FOR DELETE USING ((auth.uid() = user_id));


--
--
-- Name: reminders Users can delete own reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own reminders" ON public.reminders FOR DELETE USING ((auth.uid() = user_id));


--
--
-- Name: todos Users can delete own todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own todos" ON public.todos FOR DELETE USING ((auth.uid() = user_id));


--
--
-- Name: connections Users can insert own connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own connections" ON public.connections FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
--
-- Name: debriefs Users can insert own debriefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own debriefs" ON public.debriefs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
--
-- Name: interactions Users can insert own interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own interactions" ON public.interactions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
--
-- Name: notes Users can insert own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own notes" ON public.notes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
--
-- Name: people Users can insert own people; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own people" ON public.people FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
--
-- Name: reminders Users can insert own reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own reminders" ON public.reminders FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
--
-- Name: todos Users can insert own todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own todos" ON public.todos FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
--
-- Name: connections Users can update own connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own connections" ON public.connections FOR UPDATE USING ((auth.uid() = user_id));


--
--
-- Name: debriefs Users can update own debriefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own debriefs" ON public.debriefs FOR UPDATE USING ((auth.uid() = user_id));


--
--
-- Name: interactions Users can update own interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own interactions" ON public.interactions FOR UPDATE USING ((auth.uid() = user_id));


--
--
-- Name: notes Users can update own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notes" ON public.notes FOR UPDATE USING ((auth.uid() = user_id));


--
--
-- Name: people Users can update own people; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own people" ON public.people FOR UPDATE USING ((auth.uid() = user_id));


--
--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
--
-- Name: reminders Users can update own reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own reminders" ON public.reminders FOR UPDATE USING ((auth.uid() = user_id));


--
--
-- Name: todos Users can update own todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own todos" ON public.todos FOR UPDATE USING ((auth.uid() = user_id));


--
--
-- Name: connections Users can view own connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own connections" ON public.connections FOR SELECT USING ((auth.uid() = user_id));


--
--
-- Name: debriefs Users can view own debriefs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own debriefs" ON public.debriefs FOR SELECT USING ((auth.uid() = user_id));


--
--
-- Name: interactions Users can view own interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own interactions" ON public.interactions FOR SELECT USING ((auth.uid() = user_id));


--
--
-- Name: notes Users can view own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notes" ON public.notes FOR SELECT USING ((auth.uid() = user_id));


--
--
-- Name: people Users can view own people; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own people" ON public.people FOR SELECT USING ((auth.uid() = user_id));


--
--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
--
-- Name: reminders Users can view own reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own reminders" ON public.reminders FOR SELECT USING ((auth.uid() = user_id));


--
--
-- Name: todos Users can view own todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own todos" ON public.todos FOR SELECT USING ((auth.uid() = user_id));


--
--
-- Name: deals Users delete their deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete their deals" ON public.deals FOR DELETE USING ((user_id = auth.uid()));


--
--
-- Name: organizations Users delete their orgs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete their orgs" ON public.organizations FOR DELETE USING ((user_id = auth.uid()));


--
--
-- Name: pipelines Users delete their pipelines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete their pipelines" ON public.pipelines FOR DELETE USING ((user_id = auth.uid()));


--
--
-- Name: rate_limits Users delete their rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete their rate limits" ON public.rate_limits FOR DELETE USING ((user_id = auth.uid()));


--
--
-- Name: service_connections Users delete their service connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete their service connections" ON public.service_connections FOR DELETE USING ((user_id = auth.uid()));


--
--
-- Name: workflows Users delete their workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete their workflows" ON public.workflows FOR DELETE USING ((user_id = auth.uid()));


--
--
-- Name: deals Users insert their deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert their deals" ON public.deals FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
--
-- Name: organizations Users insert their orgs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert their orgs" ON public.organizations FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
--
-- Name: pipelines Users insert their pipelines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert their pipelines" ON public.pipelines FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
--
-- Name: rate_limits Users insert their rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert their rate limits" ON public.rate_limits FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
--
-- Name: service_connections Users insert their service connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert their service connections" ON public.service_connections FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
--
-- Name: workflows Users insert their workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert their workflows" ON public.workflows FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
--
-- Name: deals Users see their deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see their deals" ON public.deals FOR SELECT USING ((user_id = auth.uid()));


--
--
-- Name: organizations Users see their orgs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see their orgs" ON public.organizations FOR SELECT USING ((user_id = auth.uid()));


--
--
-- Name: pipelines Users see their pipelines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see their pipelines" ON public.pipelines FOR SELECT USING ((user_id = auth.uid()));


--
--
-- Name: rate_limits Users see their rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see their rate limits" ON public.rate_limits FOR SELECT USING ((user_id = auth.uid()));


--
--
-- Name: service_connections Users see their service connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see their service connections" ON public.service_connections FOR SELECT USING ((user_id = auth.uid()));


--
--
-- Name: workflows Users see their workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see their workflows" ON public.workflows FOR SELECT USING ((user_id = auth.uid()));


--
--
-- Name: deals Users update their deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update their deals" ON public.deals FOR UPDATE USING ((user_id = auth.uid()));


--
--
-- Name: organizations Users update their orgs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update their orgs" ON public.organizations FOR UPDATE USING ((user_id = auth.uid()));


--
--
-- Name: pipelines Users update their pipelines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update their pipelines" ON public.pipelines FOR UPDATE USING ((user_id = auth.uid()));


--
--
-- Name: rate_limits Users update their rate limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update their rate limits" ON public.rate_limits FOR UPDATE USING ((user_id = auth.uid()));


--
--
-- Name: service_connections Users update their service connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update their service connections" ON public.service_connections FOR UPDATE USING ((user_id = auth.uid()));


--
--
-- Name: workflows Users update their workflows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update their workflows" ON public.workflows FOR UPDATE USING ((user_id = auth.uid()));


--
--
-- Name: connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

--
--
-- Name: deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

--
--
-- Name: debriefs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.debriefs ENABLE ROW LEVEL SECURITY;

--
--
-- Name: interactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

--
--
-- Name: notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

--
--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
--
-- Name: people; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;

--
--
-- Name: pipelines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

--
--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
--
-- Name: rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

--
--
-- Name: reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

--
--
-- Name: service_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_connections ENABLE ROW LEVEL SECURITY;

--
--
-- Name: todos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

--
--
-- Name: workflows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

--
