-- Suggestions table — central queue für alle AI-Vorschläge, die der
-- User später bestätigt/ablehnt statt direkt geschrieben zu werden.
--
-- Background: bis jetzt schreiben AI-Pipelines (Voice-Console Tool-Use,
-- Org-Enrich, Inline-Duplicate-Check, Calendar/Gmail-Match) ihre
-- Ergebnisse direkt in die Ziel-Tabellen (people/interactions/notes).
-- Das geht solange Patrick alles selbst gesprochen hat — sobald wir
-- aber asynchrone Sources (PDL-Enrichment, Email-Forward,
-- WhatsApp-Export, Stakeholder-Mapping-Migration) auf den Weg bringen,
-- braucht es einen Approval-Step zwischen "AI hat erkannt" und
-- "Daten gespeichert".
--
-- Diese Tabelle ist der Approval-Queue. Jede pending-Row ist ein
-- nicht-bestätigter Vorschlag mit Payload (Diff) + Reasoning (warum die
-- AI das vorschlägt). User klickt auf Person-Detail oder Heute-Dashboard
-- accept/reject/dismiss → status wechselt + resolved_at gesetzt.

create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  person_id uuid references public.people(id) on delete cascade not null,
  suggestion_type text not null,
  payload jsonb not null,
  reasoning text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint suggestions_type_check check (suggestion_type in (
    -- Briefing 3.4: 11 Suggestion-Typen.
    'tag',              -- Tag-Cluster-Mapping oder Tag-Dedup
    'cadence',          -- Cadence-Anpassung (z.B. von 30d auf 90d)
    'cta',              -- Neuer Call-to-Action mit Ablaufdatum
    'connection',       -- Neue Beziehung zu anderer Person erkannt
    'reconnect',        -- Reconnect-Trigger (birthday, job-change)
    'depth_change',     -- Depth-Achse anpassen (active_50 → trusted_15)
    'mode_change',      -- Mode-Achse anpassen (active → dormant)
    'merge_duplicate',  -- Mögliches Duplikat zu existierender Person
    'purpose_mapping',  -- Migration: scope/stakeholder_types → purpose
    'how_we_met_extract', -- AI extrahiert how_we_met aus existierender notes
    'field_enrichment'  -- Generisches Feld-Update (PDL, Auto-Enrich)
  )),
  constraint suggestions_status_check check (status in (
    'pending', 'accepted', 'rejected', 'dismissed'
  ))
);

alter table public.suggestions enable row level security;

drop policy if exists "Users see their suggestions" on public.suggestions;
create policy "Users see their suggestions"
  on public.suggestions for select
  using (user_id = auth.uid());

drop policy if exists "Users insert their suggestions" on public.suggestions;
create policy "Users insert their suggestions"
  on public.suggestions for insert
  with check (user_id = auth.uid());

drop policy if exists "Users update their suggestions" on public.suggestions;
create policy "Users update their suggestions"
  on public.suggestions for update
  using (user_id = auth.uid());

drop policy if exists "Users delete their suggestions" on public.suggestions;
create policy "Users delete their suggestions"
  on public.suggestions for delete
  using (user_id = auth.uid());

-- Hot path: Heute-Dashboard zeigt alle pending suggestions des Users.
-- Partial-Index hält den Index klein, weil resolved Rows nie geserved
-- werden (außer auf Person-Detail, dafür haben wir den zweiten Index).
create index if not exists idx_suggestions_pending
  on public.suggestions (user_id, created_at desc)
  where status = 'pending';

-- Person-Detail-Page zeigt alle Suggestions (pending + historische)
-- für eine Person, neueste zuerst.
create index if not exists idx_suggestions_person
  on public.suggestions (person_id, created_at desc);

notify pgrst, 'reload schema';
