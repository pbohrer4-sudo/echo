# MIGRATION_PLAN.md

Finaler Migration-Plan vom IST-Stand (Stand: ECHO_INVENTORY.md) zum
Soll-Stand (PERSONAL_CRM_BUILD_BRIEFING.md), kalibriert mit Patricks
Antworten auf die 10 Discovery-Fragen.

**Warte-Status:** ungeführt bis Patrick „Migration Plan freigegeben - start Phase 0" sagt.

Stand: 11. Mai 2026

---

## Patricks Decisions (autoritativ)

| # | Decision | Migration-Impact |
|---|---|---|
| 1 | Pipelines+Deals: hidden behalten | Phase F: Sidebar entlinken, Routes → 404 für neue User. Code+Tabellen bleiben. |
| 2 | Workflow-Editor: keep for now | Kein Removal. Bleibt funktional. |
| 3 | Multi-Model-Catalog: behalten | Kein Trim. Alle 14 Catalog-Einträge bleiben. /models bleibt. |
| 4 | Gamification: keep für jetzt | Kein Removal. Streaks-Tab bleibt. |
| 5 | Quick-Add: 4-Felder + Advanced-Toggle | Phase C2: neue Form mit 4 Briefing-Feldern, expandierbar um 7 Zusatzfelder. |
| 6 | `/` Voice-Console bleibt | Heute-Dashboard kommt auf neue Route `/heute`. |
| 7 | `scope`-Spalte: löschen | Phase F: drop nach Verifikation purpose-Migration. |
| 8 | stakeholder→purpose: Suggestion-Flow | Phase A: Migration-Skript schreibt suggestions-Rows statt direkter Felder. |
| 9 | Supabase EU: bestätigt | Kein Action. |
| 10 | `deleted_at`: behalten | CLAUDE.md-Korrektur in Phase 0. |

**Advanced-Toggle-Felder (Quick-Add)**:
company, role, phone (1x), email (1x), tags (mit Cluster-Hint), met_date, met_location

---

## Gesamt-Aufwand

| Phase | Dauer | Risiko |
|---|---|---|
| 0 - Sicherheit + Re-Capture | 0,5 d | Niedrig |
| A - Datenmodell-Migration | 3 d | Mittel |
| B - Server-Layer | 2 d | Mittel |
| C - UI | 4-5 d | Hoch |
| D - KI-Pipeline | 3 d | Mittel |
| E - Push + Sonntags-Puls | 2 d | Hoch (iOS) |
| F - Cleanup | 1-2 d | Hoch (destruktiv) |
| **Total** | **15-17 d** | |

---

## Phase 0 - Sicherheitsnetz + Re-Capture (0,5 d)

**Ziel:** Backup, Branch, vollständige Migration-History im Repo.

**Tasks:**

1. **Git-Sicherheitsnetz**
   ```
   git checkout -b refactor/3-axis-model
   git tag pre-refactor-snapshot
   ```

2. **Schema-Snapshot** (für Diff-Vergleich am Ende)
   ```
   node --env-file=.env.local scripts/inspect-schema.mjs > schema-snapshot-pre-refactor.txt
   ```

3. **Daten-Backup**
   - Supabase Studio: `pg_dump` aller User-Daten als SQL + JSON-Export pro Tabelle
   - Lokal speichern als `backup-vor-refactor.sql`

4. **Fehlende Migrationen re-capturen** (0001/0011/0012/0013)
   - Via PostgREST + pg_dump die DDL für people/interactions/notes/reminders/todos/debriefs/connections rekonstruieren
   - Als neue Datei `0001_initial_schema.sql` (idempotent mit `create table if not exists`)
   - Optional: 0011/0012/0013 wenn klar trennbar; sonst alle in 0001

5. **CLAUDE.md-Korrektur**
   - Sektion "Database Conventions": Zeile „Soft-delete via `archived` boolean" → „Soft-delete via `deleted_at timestamptz` (Echo convention; siehe ECHO_INVENTORY.md)"

6. **Commit** mit Tag, push branch

**Acceptance:**
- Branch existiert, Tag existiert
- `backup-vor-refactor.sql` lokal
- 0001_initial_schema.sql committed
- CLAUDE.md updated
- Build grün

**Keine Code-Änderungen in `/app`, `/components`, `/lib`.**

---

## Phase A - Datenmodell-Migration (3 d)

**Ziel:** Neues Schema neben dem alten. Alte Felder bleiben, neue werden parallel geschrieben.

### A1 - Suggestions-Tabelle (zuerst!)

**Warum zuerst:** alle nachfolgenden A-Migrationen schreiben suggestions-Rows statt direkter Datenupdates.

```sql
create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  person_id uuid references public.people(id) on delete cascade not null,
  suggestion_type text check (suggestion_type in (
    'tag','cadence','cta','connection','reconnect',
    'depth_change','mode_change','merge_duplicate',
    'purpose_mapping','how_we_met_extract','field_enrichment'
  )) not null,
  payload jsonb not null,
  reasoning text,
  status text default 'pending' check (status in ('pending','accepted','rejected','dismissed')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);
create index idx_suggestions_pending on public.suggestions(user_id, status) where status = 'pending';
create index idx_suggestions_person on public.suggestions(person_id, created_at desc);
-- RLS-Policies (4 Policies) wie bei allen anderen Tabellen
```

**Server-Helpers:**
- `lib/suggestions.ts`: `createSuggestion()`, `acceptSuggestion()`, `rejectSuggestion()`, `dismissSuggestion()`
- `types.ts`: SuggestionRow, SuggestionType, SuggestionStatus

### A2 - Tags-System

```sql
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  name text not null,
  cluster text check (cluster in ('context','topic','value','trigger')) not null,
  created_by text default 'user' check (created_by in ('user','ai_suggested','ai_extracted')),
  usage_count integer default 0,
  created_at timestamptz default now(),
  unique(user_id, lower(name))
);

create table public.person_tags (
  person_id uuid references public.people(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade,
  primary key (person_id, tag_id)
);

-- 7-Tag-Limit via Trigger
create or replace function public.enforce_person_tag_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.person_tags where person_id = new.person_id) >= 7 then
    raise exception 'Max 7 tags pro Person';
  end if;
  return new;
end;
$$;
create trigger trg_person_tag_limit before insert on public.person_tags
  for each row execute function public.enforce_person_tag_limit();
```

**Migration-Skript:** bestehende `people.tags[]` → `tags` + `person_tags`-Rows, Default `cluster='topic'`. Bestehende `organizations.tags[]` + `notes.tags[]` analog.

**Cluster-Re-Klassifizierung** läuft danach als Background-Job (AI Sonnet): pro Tag-Name eine Suggestion mit cluster-Vorschlag und reasoning.

### A3 - Goldfeld how_we_met + Met-Felder

```sql
alter table public.people
  add column if not exists how_we_met text,
  add column if not exists met_date date,
  add column if not exists met_location text,
  add column if not exists met_event text;
```

**Migration-Skript:** für bestehende Personen mit `notes != null` AI-Prompt: „Extrahiere aus diesen Notizen das wie-wir-uns-kennengelernt-haben — falls vorhanden". Output → Suggestion-Row mit suggestion_type='how_we_met_extract'.

### A4 - purpose-Achse

```sql
alter table public.people
  add column if not exists purpose text
    check (purpose in ('personal','family','business_active','business_latent','aspirational'));
```

**Migration-Skript pro Person** (Suggestion-Flow, kein direkter Write):

| Heutige Indikatoren | Vorgeschlagener purpose |
|---|---|
| `scope='work'` + stakeholder ∋ {Kunde, Partner, Mitarbeiter, Investor} | `business_active` |
| `scope='work'` + stakeholder ∋ {Service-Provider, Multiplikator, Media, Regulator, Mentor} | `business_latent` |
| `scope='personal'` + stakeholder ∋ {Privat} ODER stakeholder leer | `personal` |
| `scope='personal'` + Beziehungs-Label ∋ {Partner, Familie, Kind, Eltern, Geschwister} | `family` |
| `scope='both'` ODER kein klarer Match | AI klassifiziert via how_we_met + notes, fallback `business_latent` |
| Aspirational-Indikator | nie automatisch — bleibt manuell |

Output pro Person: Suggestion-Row mit `suggestion_type='purpose_mapping'`, reasoning erklärt warum.

### A5 - depth-Achse

```sql
alter table public.people
  add column if not exists depth text
    check (depth in ('inner_5','trusted_15','active_50','network_150','periphery_500')),
  add column if not exists depth_source text default 'auto'
    check (depth_source in ('auto','manual_override'));
```

**Auto-Calc-Algorithmus** (Briefing 4.1):
```
interactions_count_12mo = COUNT(interactions WHERE person_ids @> ARRAY[p.id]
                                                AND occurred_at > now() - interval '365 days')
depth =
  CASE
    WHEN count >= 24 THEN 'inner_5'
    WHEN count >= 12 THEN 'trusted_15'
    WHEN count >= 4  THEN 'active_50'
    WHEN count >= 2  THEN 'network_150'
    WHEN count >= 1  THEN 'periphery_500'
    ELSE NULL  -- triggert mode=dormant separat
  END
```

**Migration-Skript:** initial-Depth-Calc pro Person als Suggestion (depth_change), reasoning enthält die Interaction-Count + Algorithmus-Branch.

**Cron-Edge-Function:** weekly Sunday 02:00 UTC, recalculate depth für alle Personen mit `depth_source='auto'`.

### A6 - mode-Achse + Auto-Transitions

```sql
alter table public.people
  add column if not exists mode text default 'active'
    check (mode in ('active','nurture','dormant','reconnect','archive')),
  add column if not exists next_nudge_at timestamptz;

create index if not exists idx_people_mode on public.people(user_id, mode);
create index if not exists idx_people_next_nudge on public.people(user_id, next_nudge_at)
  where mode = 'active' and deleted_at is null;
```

**Cron-Edge-Function daily 03:00 UTC** (Briefing 4.3):
- `active → dormant` wenn `last_interaction_at + 2 * expected_cadence_days < now()`
- `dormant → reconnect` wenn Trigger (erstmal nur birthday in next 7d via important_dates)
- `next_nudge_at = last_interaction_at + expected_cadence_days`

### A7 - Person-Felder ergänzen

```sql
alter table public.people
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists linkedin_url text,
  add column if not exists photo_url text,
  add column if not exists current_location text,
  add column if not exists home_location text,
  add column if not exists "function" text
    check ("function" in ('Founder','Exec','Operator','IC','Investor','Advisor','Student','Other')),
  add column if not exists industry_enum text
    check (industry_enum in (
      'Tech','FinTech','HealthTech','Construction','Consumer',
      'Industrial','Public','Media','Education','Other'
    ));
```

**Migration-Skripte:**
- `name` → `first_name` + `last_name` (split bei letztem Space)
- `avatar_url` → `photo_url` (Spiegel-Copy, beide halten gleichen Wert)
- bestehendes `industry` text → `industry_enum` via AI-Suggestion wenn nicht 1:1 mappbar
- `job_function` → `function` analog (Suggestion bei Freitext-Mismatch)
- `home_location` und `current_location` aus `geographies` JSONB extrahieren (wo `kind in ('home','current')`)

### A8 - Interactions erweitern

```sql
alter table public.interactions
  add column if not exists direction text
    check (direction in ('inbound','outbound','mutual')),
  add column if not exists duration_minutes integer,
  add column if not exists ai_extracted_facts jsonb;
```

**Source-Enum erweitern:** `voice_note`, `email_forward`, `whatsapp_export`, `linkedin_dm` neue Werte erlauben.

**Risk: Mittel.** Alle Migrationen sind additiv. Keine Drops.

---

## Phase B - Server-Layer (2 d)

### B1 - Suggestions-Schreib-Pipeline

**Alle AI-Writes laufen über Suggestions:**
- Voice-Console Tool-Use: create_person, update_person → schreibt jetzt erst Suggestion mit Diff-Payload
- Smart-Reminders: schon Suggestion-Pattern, nur Persistenz hinzufügen
- Inline-Duplicate-Check: existiert schon
- Calendar/Gmail Person-Match: heute schreibt direkt → schreibt Suggestion
- Org-Enrich: heute schreibt direkt → schreibt Suggestion

**Neue API-Endpunkte:**
- `POST /api/suggestions/[id]/accept`
- `POST /api/suggestions/[id]/reject`
- `POST /api/suggestions/[id]/dismiss`

### B2 - Server-Actions selektiv

Neue Mutations als Server-Actions (statt API-Routen). Existing routes parallel.

### B3 - PDL-Enrichment-Pipeline

- ENV: `PEOPLE_DATA_LABS_API_KEY`
- Neue Tabelle `pdl_cache` (key, payload, expires_at)
- Edge-Function `enrich-person` (Supabase Edge oder Vercel Background Function)
- Triggered nach createPerson, async
- Output → Suggestion (linkedin_url, photo_url, role, company, location)

### B4 - Tag-Cluster + Dedup-Engine

- `/api/tags/suggest-cluster` (Haiku 4.5)
- `/api/tags/dedup-scan` (Levenshtein + Plural)
- Cron weekly: dedup-scan → Suggestion

**Risk: Mittel.** Parallel-Lauf alter Pfade reduziert Risiko.

---

## Phase C - UI (4-5 d)

### C1 - 3-Achsen-Badge

Komponenten: `DepthBadge`, `PurposeBadge`, `ModeBadge`. Klick öffnet Sheet mit 5 Options pro Achse + (für depth+mode) Auto-Source-Toggle.

Auf Person-Detail Block 1 (Header) — ersetzt aktuelles Stakeholder-Badge-Set.

### C2 - Quick-Add neu

`/people/new`: 4-Felder-Default + Advanced-Toggle (7 Felder).

Server-Action löst nach Save:
- PDL-Enrichment (async)
- how_we_met-Extraction (async, schreibt Suggestions)
- Redirect zu Person-Detail

### C3 - Suggestion-Card-Stack

Block 3 auf Person-Detail. Alle `pending` Suggestions pro Person. Accept/Reject/Adjust. Optimistic UI.

### C4 - Heute-Dashboard

Neue Route `/heute`. Sidebar-Eintrag vor „Voice".

- Section 1: Überfällige CTAs (cta_expires_at < today)
- Section 2: Today-CTAs (cta_expires_at = today)
- Section 3: Pending Suggestions (last 5)
- Section 4: Cadence-Overdue (mode='active', next_nudge_at < now, limit 5)

### C5 - People-Liste

Filter umstellen: depth, purpose, mode, tag-cluster. Volltext-Suche bleibt. Sortierung: depth (closest first), dann last_interaction_at.

### C6 - Tag-UI mit Cluster-Picker

Add-Tag Combobox mit Cluster-Hint. Tag-Chips farbcodiert. 7-Tag-Limit visual.

**Risk: Hoch (UI-heavy).** Pro Schritt einzeln freigeben, vor jedem Schritt Beschreibung + File-Liste.

---

## Phase D - KI-Pipeline (3 d)

### D1 - how_we_met Extraction Pipeline

`/api/extract-context` mit Briefing-11.1-Prompt. Triggered von Quick-Add. Schreibt Suggestions.

### D2 - Voice-Note-STT

`/api/voice/transcribe`. Whisper (stabiler für DE) oder Deepgram (schneller). Audio-Upload zu Supabase Storage. Transcript → bestehende /api/extract-Pipeline.

### D3 - Reconnect-Trigger-Engine

Cron daily, scan dormant people, check triggers (birthday in 7d, später PDL-job-change). Generate reconnect Suggestion.

### D4 - Reconnect-Message-Draft

`/api/messages/draft-reconnect` mit Briefing-11.3-Prompt. 3 Varianten (Casual WA / Pro Email / LinkedIn).

### D5 - Email-Forward-Endpoint

`/api/email/inbound` via SendGrid Inbound Parse oder Mailgun Route. `crm-add@…` parst, matcht User über Token im Subject, schreibt Suggestion.

**Risk: Mittel.** External-Service-Kosten + Quota-Management.

---

## Phase E - Push + Sonntags-Puls (2 d)

### E1 - PWA Setup

- `manifest.json`
- Service Worker
- Install-Prompt
- Offline-ready Basics

### E2 - Web Push API

- `Notification.requestPermission()`
- Push-Subscriptions in `push_subscriptions`-Tabelle
- `/api/push/send`

### E3 - Sonntags-Puls Push

Cron Sun 19:00 lokale Zeit (per User-Timezone). Algorithmus aus Briefing 6.2. Push mit Deep-Link.

### E4 - Mobile Swipe-Gesten

Touch-Handler. Rechts = kontaktiert (logs Interaction), Links = snooze (1w/1mo/custom).

**Risk: Hoch (iOS-Quirks, Notification-Permission-UX).**

---

## Phase F - Cleanup (1-2 d)

**Jedes Drop einzeln freigeben.** Vor jedem Drop: grep dass keine Reads/Writes mehr existieren.

1. **Pipelines hidden**
   - Sidebar-NavLink entfernen
   - `/pipelines/*` → `notFound()` für non-Patrick-User (oder generell hidden via feature flag)
   - Tabellen + Routes bleiben im Code

2. **Alt-Spalten droppen** (nach Verifikation alle Reads/Writes umgestellt):
   - `people.scope`
   - `people.stakeholder_types`
   - `people.stakeholder_sub_types`
   - `people.strength_score`
   - `people.depth_override`
   - `people.industry` (text) — ersetzt durch `industry_enum`
   - `people.job_function` (text) — ersetzt durch `function`
   - `people.tags` (text[]) — ersetzt durch tags + person_tags
   - `people.phone`, `people.email`, `people.birthday` — Legacy-Single-Werte

3. **Tote `connections`-Tabelle droppen**

4. **`organizations.tags` (text[])** → falls zu tags-System migriert

5. **`notes.tags` (text[])** → analog

6. **Doppelte 0018-Migration** konsolidieren

7. **Final-Diff:** `schema-snapshot-post-refactor.txt` vs pre-refactor → review

**Risk: Hoch (destruktiv).** Pre-Drop-Backup pro Tabelle, post-Drop-Verifikation.

---

## Definition of Done (pro Phase)

- TypeScript no `any`
- Zod-Validation auf neuen Inputs
- RLS verifiziert
- Loading + Error + Empty States
- Mobile getestet (375px)
- Deutsche Umlaute korrekt
- Build grün
- Server-Actions für neue Mutations, parallele alte API-Routes
- Migrations-Pair (forward + manual rollback-Doku im SQL-Header)

---

## Was nicht passiert (bewusst)

- Pipelines + Deals werden **nicht entfernt** (Patrick: hidden behalten)
- Workflow-Editor wird **nicht entfernt** (Patrick: keep for now)
- Multi-Model-Catalog wird **nicht getrimmt** (Patrick: behalten)
- Gamification wird **nicht entfernt** (Patrick: keep für jetzt)
- Voice-Console wird **nicht von `/` verschoben** (Patrick: bleibt)

Diese Echo-Pluspunkte stehen über das Briefing hinaus. Im Briefing 14 ("Was bewusst NICHT gebaut wird") gelten weiter als Briefing-Direction, Echo hat sie aber pragmatisch da und Patrick behält sie.

---

## Approval-Trigger

Nach Lesen + ggf. Korrekturen sag „**Migration Plan freigegeben - start Phase 0**".

Dann startet Phase 0 mit **Beschreibung vor Ausführung** für jede einzelne Aktion:
- Git-Branch + Tag: zeige Befehle vor
- Schema-Snapshot: zeige Output-Path vor
- Daten-Backup: bitte dich um Supabase-Studio-Action
- 0001 Re-Capture: zeige SQL vor Commit
- CLAUDE.md-Korrektur: zeige Diff vor

**Bis dahin keine Code-Änderungen.**
