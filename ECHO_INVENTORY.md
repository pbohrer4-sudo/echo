# ECHO_INVENTORY.md

Discovery-Phase Inventur des bestehenden Echo Personal CRM Codebases. Snapshot des IST-Stands vor Migration auf das Briefing-Ziel.

Stand: 11. Mai 2026
Branch: main
Letzter Commit vor Discovery: a10ad0f (Settings als Inline-Tab)

---

## 1. Architektur-Zusammenfassung

### Stack

| Layer | Technologie | Version | Bemerkung |
|---|---|---|---|
| Framework | Next.js | 16.2.4 (App Router) | Nicht Next.js 14 wie Briefing vorsieht |
| Runtime | React | 19.2.4 | |
| Build | Webpack (nicht Turbopack) | | `--webpack`-Flag im dev-Script, weil Turbopack Voice/Server-Action Probleme machte |
| Sprache | TypeScript | strict mode | |
| UI | Tailwind CSS 4 | | + tw-animate-css für animate-in utilities |
| UI-Komponenten | shadcn/ui + @base-ui/react ^1.4.1 | | shadcn ist installiert, aber meiste Komponenten sind custom mit roher Tailwind (kein systematischer Einsatz der shadcn-Primitives) |
| Database | Supabase (Postgres + RLS + Auth) | @supabase/ssr ^0.10.2, @supabase/supabase-js ^2.105.1 | EU-Region nicht verifiziert |
| Hosting | Vercel (per vercel.json) | Region fra1 | DSGVO-Region OK |
| AI Text | Anthropic SDK | ^0.92.0 (Claude Sonnet 4.6 default) | |
| AI Voice TTS | ElevenLabs (Sarah Eve, eleven_flash_v2_5) | direkter HTTP, kein SDK | |
| AI Voice STT | Browser Web Speech API | client-side, kein Server-STT | |
| Visual Editor | @xyflow/react | ^12.10.2 | Workflow-Editor |
| Payments | Stripe | ^22.1.1 | nur Dependency, keine Routen/Logik integriert |
| Sonstiges | lucide-react, react-hook-form, zod (Annahme) | | Validation-Pattern nicht durchgängig verifiziert |

### Top-Level-Folder

```
app/                Next.js App Router (Pages + API)
  (app)/            Auth-protected Routes (Layout + Sidebar)
  api/              REST-Endpoints für Mutations/Webhooks
  globals.css       Design Tokens (Direction B / Ledger × Geist)
components/         UI-Komponenten (52 Files, fast alle Client-Components)
  ui/               Vereinzelte shadcn-Wrapper
lib/                Domain-Logik + Server-Helper (38 Files)
  supabase/         server.ts (RLS-Client), admin.ts (Service-Role)
  ai.ts, claude.ts, elevenlabs.ts, prompts.ts, model-catalog.ts
  + duplicates.ts, smart-reminders.ts, cadence.ts, gamification.ts, debriefs.ts
  + people.ts, organizations.ts, pipelines.ts, workflows.ts, connections-catalog.ts
  + calendar-sync.ts, email-sync.ts, whatsapp.ts, whatsapp-inbox.ts, google.ts, oauth-providers.ts
  + search.ts, vcard.ts, business-card.ts, profile-depth.ts, recurrence.ts
  + tab-status.ts, recap.ts, pulse.ts, inbox.ts, integrations.ts, rate-limit.ts
  + tools.ts (EXTRACTION_TOOLS für Claude Tool-Use), text.ts, utils.ts
  + types.ts, stakeholder-taxonomy.ts, relationship.ts, workflow-catalog.ts
supabase/migrations/   SQL-Migrationen (siehe Schema-Sektion)
scripts/               inspect-schema.mjs (live-Schema-Dump), verify-connections.mjs
vercel.json            Cron-Schedule (Sunday-Pulse + sync-all)
package.json           Scripts: dev (webpack), build, lint
CLAUDE.md, PERSONAL_CRM_BUILD_BRIEFING.md, SPRINT_PLAN.md, ECHO_SETUP.md  (Discovery-Inputs)
```

### Build-Workflow

- `npm run dev` läuft `next dev --webpack` (NICHT Turbopack)
- `npm run build` läuft `next build` (Turbopack OK hier)
- `npm run lint` läuft ESLint 9
- Kein Test-Suite vorhanden — Verifikation per Build + Browser-Smoke-Test
- `node --env-file=.env.local scripts/inspect-schema.mjs` dumped live Schema via PostgREST OpenAPI

---

## 2. Datenmodell

Schema-Inspect via PostgREST OpenAPI (`scripts/inspect-schema.mjs`) am 11. Mai 2026 ausgeführt. **14 öffentliche Tabellen.**

### Migrationen im Repo

```
0002_profiles_trigger.sql              auto-create profile row on auth.users insert
0003_contacts_fields.sql               JSONB multi-value fields on people
0004_self_person.sql                   is_self boolean + partial unique index
0005_organizations.sql                 organizations table
0006_workflows.sql                     workflows table
0007_pipelines.sql                     pipelines + deals tables
0008_model_preferences.sql             jsonb model_preferences + byo_api_keys on profiles
0009_workflow_models.sql               default_model_preferences on workflows
0010_search_sync_inbox.sql             pg_trgm + external_events + external_messages + wa_messages
0014_relationship_dimensions.sql       stakeholder_types/sub_types, geographies, cta, priority, interests, depth_override
0015_service_connections.sql           service_connections table für OAuth
0016_organization_uniqueness_and_indexes.sql   dedup + perf indices
0017_rate_limits.sql                   rate_limits + atomic increment function
0018_admin_stats_functions.sql         admin_overview_stats() + admin_users_list()
0018_dedup_merge.sql                   merge_people() + merge_organizations() + jsonb_dedup()
```

**Fehlende Migrationen:** `0001` (people-Init), `0011`, `0012`, `0013`. Vermutlich direkt in der Supabase-Studio angelegt oder gelöscht. Tabellen wie `people`, `interactions`, `notes`, `reminders`, `todos`, `debriefs`, `connections` existieren in der live-DB, sind aber nicht in einer Migration im Repo dokumentiert.

### Tabellen-Übersicht (live)

| Tabelle | Cols | Status |
|---|---|---|
| people | 40 | Kern-Entität, sehr breit |
| organizations | 15 | First-class entity |
| interactions | 11 | `person_ids uuid[]` (Array, kein single FK) |
| notes | 9 | tags als text[] |
| reminders | 10 | recurrence/type/status/source |
| todos | 9 | priority/status, source_debrief_id |
| debriefs | 9 | interaction_ids[], action_ids[], audio_url, duration_sec |
| connections | 7 | from_person_id/to_person_id Graph-Tabelle — **parallel zur JSONB people.relationships** |
| pipelines | 11 | jsonb stages + field_definitions |
| deals | 18 | full deal management |
| workflows | 11 | jsonb nodes + edges + default_model_preferences |
| service_connections | 16 | OAuth-Tokens + sync state in config jsonb |
| profiles | 20 | inkl. stripe_*, subscription_*, onboarding_progress |
| rate_limits | 5 | composite PK (user_id, key, window_start) |

Plus aus Migration 0010 (nicht in obigem Dump getailed): `external_events`, `external_messages`, `wa_messages`.

### Detail: `people` (40 Spalten — Kern-Konflikt-Punkt)

```
Identität:           id*, user_id*, name*, company, role, scope*
Multi-Werte (JSONB): phones, emails, addresses, socials, important_dates, relationships, geographies, stakeholder_sub_types
Arrays (text[]):     tags, stakeholder_types, interests
Klassifizierung:     industry, job_function, cta, cta_expires_at, priority (A/B/C), priority_bucket, priority_set_at
Beziehungs-Modell:   strength_score (int 0-100), depth_override (text, free), expected_cadence_days
Self:                is_self (bool, partial unique index per user_id)
Org-FK:              organization_id
Legacy:              phone (text), email (text), birthday (date) — single-Wert Spiegel
Avatar/Notes:        avatar_url, notes (freitext), notes_summary (AI), next_best_action
Cadence:             last_interaction_at, expected_cadence_days
Soft-Delete:         deleted_at
```

**Vs. Briefing Person-Entity:**
- Fehlt: `first_name`, `last_name` separat, `linkedin_url`, `photo_url` (wir haben `avatar_url`), `met_date`, `met_location`, `met_event`, `how_we_met` (Goldfeld), `current_location`, `home_location`, `function` (Enum), `next_nudge_at`
- Hat aber: stakeholder_types/sub_types, geographies, cta/priority/depth_override, strength_score, scope, is_self, complete JSONB multi-value Modell
- **Klassifizierungs-Konflikt**: das aktuelle Modell mischt `stakeholder_types` (mehrfache Typen) + `purpose` (Briefing: single enum) + `depth_override` (Briefing: depth enum + depth_source). Die Briefing-3-Achsen sind als Felder NICHT vorhanden.

### Detail: `interactions`

```
id*, user_id*, person_ids uuid[], type*, source*, summary, transcript, sentiment, topics text[], occurred_at*, created_at
```

**Vs. Briefing:** Hat `transcript` + `topics` (Briefing nicht), aber fehlt `direction` (inbound/outbound/mutual), `duration_minutes`, `ai_extracted_facts`. Die `person_ids`-Array-Form ist ungewöhnlich (Briefing: single `person_id`), erlaubt aber Gruppen-Meetings ohne Duplikat-Rows.

### Detail: `connections` (Achtung — separate Tabelle)

```
id*, user_id*, from_person_id*, to_person_id*, relationship_type, strength int, created_at
```

Das ist ein Graph-Edge-Modell, parallel zur JSONB `people.relationships`-Spalte. Wird vermutlich nicht aktiv geschrieben (Code-Pfade gehen alle über die JSONB-Spalte). Tote Tabelle.

### Keine `suggestions`-Tabelle vorhanden

Das Briefing fordert ein Suggestions-Modell (3.4) mit Status pending/accepted/rejected/dismissed. Echo hat das aktuell ad-hoc: Smart-Reminders (lib/smart-reminders.ts) generiert Vorschläge in-memory ohne Persistenz, der User klickt Anlegen/Verwerfen direkt. **Fehlt komplett.**

### Keine `tags`-Tabelle mit Cluster-System

Das Briefing fordert eine eigene `tags`-Tabelle mit Cluster-Enum (context/topic/value/trigger) + `person_tags` Junction-Table. Echo speichert Tags als `text[]` auf `people.tags`, `organizations.tags`, `notes.tags`. **Kein semantisches Cluster, kein usage_count, keine Dedup-Engine, kein 7-Tag-Limit.**

### SQL-Funktionen (live)

- `merge_people(uuid, uuid)` — atomares Merge mit FK-Repointing
- `merge_organizations(uuid, uuid)` — atomares Merge
- `jsonb_dedup(jsonb)` — Helper für JSONB-Array-Dedup
- `admin_overview_stats()` — Dashboard-Stats
- `admin_users_list()` — User-Liste
- `rate_limit_increment(uuid, text, timestamptz, integer)` — atomarer Counter
- `rate_limit_sweep()` — Cleanup

### RLS-Status

Alle 14 öffentlichen Tabellen haben RLS mit `user_id = auth.uid()`-Policies für SELECT/INSERT/UPDATE/DELETE. Konsistent durchgezogen.

### Soft-Delete-Konvention

`deleted_at timestamptz`-Spalte auf allen User-Daten-Tabellen. Queries filtern via `.is("deleted_at", null)`. Briefing fordert `archived boolean` — semantisch ähnlich, syntaktisch anders.

---

## 3. Routes-Map

### Auth-Protected Pages (`app/(app)/`)

```
/                                Voice-Console (Chat-Style, persistiert über localStorage)
/debrief                         Wecker + subtiler Debrief-Trigger
/people                          Liste mit Filter (Scope/Stakeholder/Priority) + Such-Banner
  /new                           Quick-Add-Formular (extensiv, ca. 30+ Felder)
  /import                        vCard-Import mit Auto-Dedup
  /duplicates                    Hoch/Mittel/Niedrig-Bands + Merge-UI
  /[id]                          Person-Detail (Tabs: Profil/Streaks/Payments/Settings für self)
  /[id]/edit                     Person-Bearbeiten (sticky save bar)
/organizations                   Liste + Banner + Duplicates-Tab
  /new, /[id], /[id]/edit
  /duplicates
/pipelines                       Sales-Boards
  /new, /[id], /[id]/settings
  /[id]/deals/new, /[id]/deals/[did]
/inbox                           Reminders + Todos + WhatsApp-Strip (nav: "Reminders" mit Badge)
/rhythmus                        Cadence-Buckets (drifting/due-soon/on-rhythm/no-contact/no-cadence) + Smart-Reminders-Panel
/pulse                           Sonntags-Pulse-Generator
/recap                           Daten-Rückblick mit AI-Erzählung
/integrations                    Voice Vibe Integrations (visual orchestrator)
  /workflows                     Workflow-Liste (inline status + delete)
  /workflows/[id]                React-Flow Editor + per-Node Modell-Override
/connections                     OAuth-Verbindungen
  /[provider]                    Google Calendar / Gmail / WhatsApp / Stub-Provider Setup
/models                          14-Model Catalog (7 Provider) + Per-Task Preferences + BYO Keys
/profile                         Redirect auf /people/[self_id]
/settings                        Redirect auf /people/[self_id]?tab=settings
```

### Auth-Routes

```
/login                           E-Mail Magic-Link (Supabase Auth)
/callback                        OAuth Callback
```

### API-Routes (`app/api/`)

```
POST /api/chat                              Voice-Console Chat (chatForTask)
POST /api/extract                           Tool-Use Extraction (Sonnet 4.6, EXTRACTION_TOOLS)
POST /api/extract/commit                    Persist extracted tool-calls
POST /api/voice/synthesize                  ElevenLabs TTS
POST /api/recap                             Wöchentlicher Recap
POST /api/sunday-pulse                      Sonntags-Pulse-Generator
POST /api/scan-business-card                Claude Vision OCR
POST /api/enrich-organization               AI Org-Enrichment
GET  /api/search                            pg_trgm-basierte globale Suche
GET  /api/address-search                    OSM Nominatim Proxy
GET  /api/people/duplicate-check            Inline-Duplikat-Warnung im New-Form
GET  /api/duplicates/people, organizations  Liste der Pairs
POST /api/duplicates/people, organizations  Merge (ruft SQL-Funktionen)
POST /api/calendar/sync                     Google Calendar Pull
POST /api/email/sync                        Gmail Pull
GET  /api/whatsapp/webhook                  Meta Verify Challenge
POST /api/whatsapp/webhook                  Cloud API Message Ingestion (HMAC validated)
POST /api/whatsapp/send                     Outbound WA Message
POST /api/whatsapp/messages/[id]/read       Mark read
GET  /api/reminders/smart                   AI Smart-Reminder-Suggestions
POST /api/reminders/smart                   Commit Suggestion → reminders row
GET  /api/reminders/due                     Liste fälliger Reminders
POST /api/debriefs/finalize                 Save Debrief + Streak-Berechnung
POST /api/import/vcard                      Parse + Dedup-Preview
POST /api/import/vcard/commit               Insert people
GET  /api/people/[id]/dates.ics             iCal-Export für wichtige Daten
GET  /api/oauth/[provider]/start            Auth-URL bauen (echt für google_*, stub sonst)
GET  /api/oauth/[provider]/callback         Code-Exchange (echt für google_*, stub sonst)
POST /api/workflows/generate                AI-generierter Workflow
GET  /api/cron/sync-all                     Vercel Cron Endpoint (CRON_SECRET-protected)
```

---

## 4. Existierende Features (funktional)

### Voice & Capture
- **Voice-Console (`/`)** — Web Speech API (de-DE) → Claude Tool-Use → ElevenLabs TTS. Chat-Style-Verlauf mit localStorage-Persistenz (200 Items), Action-Chips für committed Tool-Calls, Text-Composer als Fallback, ⌘+K Search, Leertaste-Mic-Shortcut.
- **Tool-Use Pipeline** — `create_person`, `update_person`, `log_interaction`, `create_note`, `create_reminder`, `create_todo`, `suggest_replies`. Confirm-Card vor Persist (Briefing-konform: "Niemals auto-apply").
- **Business-Card-Scan** — Claude Vision OCR + Extraction → Person-Vorschlag.

### People CRM
- **Vollständige Person-Detail-Page** mit 40 Feldern, JSONB-Multi-Werten, Stakeholder-Taxonomie, Geographien, CTA mit Ablaufdatum, Priorität A/B/C
- **vCard-Import** — Parser für 3.0/4.0, Auto-Dedup auf Name (case-insensitive), Auto-Org-Resolve
- **Duplicate-Detection + Merge** — JS-Pairwise-Scoring (Name-Trigram + Email + Telefon + Firma), Confidence-Bands, atomares SQL-Merge mit FK-Repointing
- **Inline-Duplikat-Warnung** im New-Form
- **Adresse-Autocomplete** — OSM Nominatim mit Multi-Field-Composition
- **Sticky-Save-Bar** — Portal-based mit FormData-Snapshot Dirty-Detection

### Organizations
- Vollständige CRUD inkl. Domain-Uniqueness, Auto-Enrich via AI, Duplicate-Detection + Merge

### Reminders / Inbox (`/inbox`)
- Liste fälliger Reminders + Todos, sortiert nach `remind_at`
- WhatsApp-Inbox-Strip (ungelesene Nachrichten oben mit Antworten-Button)
- Nav-Badge mit Count überfälliger Reminders

### Cadence / Rhythmus
- Buckets: on-rhythm / due-soon / drifting / no-contact / no-cadence
- Smart-Reminders-Panel (AI-vorgeschlagen, User akzeptiert → reminders row)
- `lib/cadence.ts` mit `listCadenceRows()`

### Debrief / Streaks / Gamification
- Wecker-Seite `/debrief` mit Live-Uhr + Time-Picker + WebAudio Triple-Beep + Snooze
- Debrief-Flow als Voice-Multi-Phase ablauf
- Streak-Tracking (current + longest) in `lib/debriefs.ts`
- Gamification-Dashboard mit XP, Level (500 XP/Level), 16 Erfolge

### Sunday-Pulse
- `/api/sunday-pulse` + Cron in vercel.json (Sonntag 18:00 UTC)
- AI-erzeugter Wochenrückblick mit stale-people + Geburtstage + offene Tasks
- UI `/pulse` mit Pulse-Runner

### Recap
- `/api/recap` + UI `/recap`
- AI-erzählter Daten-Rückblick

### Search
- Globales ⌘+K-Modal mit pg_trgm-Backend
- localStorage: Recent-Queries (6) + Recent-Hits (8)
- Server-Component-Portal, Esc/↑↓↵-Keyboard

### Sync-Integrationen
- **Google Calendar Sync** — echte OAuth (`/api/oauth/google_calendar/callback` Code-Exchange), `runCalendarSync(scope, conn)` mit Session- + Cron-Dual-Entry, external_events Upsert, Attendee-Match → Meeting-Interaktion
- **Gmail Sync** — echte OAuth, external_messages, Sender/Recipient-Match → Email-Interaktion
- **WhatsApp Cloud API** — Webhook mit HMAC-SHA256-Verifikation, wa_messages-Ingestion, Match auf Phone → Interaction; Send-Endpoint mit Inbox-Reply-UI + Person-Profile-Send-Box
- **Vercel Cron `/api/cron/sync-all`** stündlich mit CRON_SECRET-Auth

### Multi-Model AI-Catalog
- 14 Modelle über 7 Provider in `lib/model-catalog.ts`, nur Anthropic + ElevenLabs `available: true`
- Per-Task / Per-Workflow / Per-Node Model-Override
- BYO API-Keys (claude, elevenlabs) im Profile

### Workflows (Voice Vibe Integrations)
- Visual Editor mit @xyflow/react, Custom Nodes mit Glyph-Badge, FlowEdge mit travelling Dot
- Inline Status + Delete in Workflow-Liste
- `/api/workflows/generate` AI-generierter Workflow
- Per-Node Modell-Override im rechten Config-Panel
- **Kein Runtime/Executor** — Workflows werden nur designed, nicht ausgeführt

### Profile (Self)
- Vier Tabs: Profil / Streaks / Payments / Settings (alle inline, animate-in)
- TabStatusOverview pro Tab (Chancen + Probleme mit Icon + Detail + Deep-Link)
- Settings-Tab inline mit Form (display_name, language, voice_id, debrief_time, BYO Keys)

### Admin
- `/admin` Dashboard mit `admin_overview_stats()` + `admin_users_list()` (SECURITY DEFINER SQL-Funktionen)
- Gate via `ADMIN_EMAILS` env var

### Sicherheits-Layer
- Rate-Limits (rate_limits-Tabelle + atomarer Counter)
- HMAC-Signaturprüfung für WhatsApp-Webhook
- RLS durchgängig auf allen 14 Tabellen
- Service-Role-Client (`lib/supabase/admin.ts`) nur für Webhook-Routen ohne Session

---

## 5. Halbfertige / Scaffold-only Features

| Feature | Status | Was fehlt |
|---|---|---|
| **OpenAI / Google / Mistral / Meta / Deepgram Provider** | Catalog-only | `lib/ai.ts` dispatched bei Non-Anthropic-Wahl Fallback auf Sonnet 4.6 mit `console.warn`. Echte Provider-SDKs nicht installiert. |
| **Workflow-Runtime** | Editor + Generator vorhanden | Kein Executor — Workflows werden nicht ausgeführt. Keine Trigger-Verdrahtung zu Voice/Events. |
| **Stripe / Payments** | SDK installiert (^22.1.1) + `payments-tab.tsx` Placeholder + 6 stripe_*-Spalten auf profiles | Keine Routes (/api/stripe/*), keine Webhook-Verarbeitung, keine Subscription-Logik |
| **Calendar/Gmail Sync** | Code komplett wired | Patrick muss in Google Cloud Console OAuth-Credentials erstellen + `GOOGLE_CLIENT_ID/SECRET` in `.env.local` setzen |
| **WhatsApp Cloud API** | Code komplett wired | Patrick muss in Meta Business Manager Phone + Webhook konfigurieren + 4 ENV-Variablen setzen + service_connections-Row mit phone_number_id-Config anlegen |
| **PDL / LinkedIn Enrichment** | Komplett nicht vorhanden | Briefing fordert PDL für `linkedin_url`, `photo_url`, `role`, `company`, `location`. Aktuell keine Enrichment-Pipeline. |
| **Voice-Note STT (Server-side)** | Nicht implementiert | Web Speech API läuft client-only. Briefing fordert Deepgram oder Whisper für lange Voice-Notes. |
| **Email-Forward-Endpoint** | Nicht implementiert | Briefing 5.3 fordert `crm-add@…`-Forward. Aktuell nur Gmail-Pull, kein Inbound-Forward-Receiver. |
| **PWA / Push-Notifications** | Nicht implementiert | Wecker funktioniert nur wenn Tab offen. Briefing 6.1 fordert Sonntag-19:00 Push. |
| **Tag-Cluster-System (context/topic/value/trigger)** | Nicht vorhanden | Tags sind heute flache text[]-Arrays auf people/orgs/notes ohne semantische Klassifizierung. |
| **Tag-Limit max 7 pro Person** | Nicht enforced | Weder UI noch DB-Check; Datalist erlaubt beliebig viele. |
| **Tag-Dedup-Engine** | Nicht vorhanden | Briefing 7.2 fordert Levenshtein/Plural-Bereinigung. |
| **Suggestions-Tabelle + Lifecycle** | Nicht vorhanden | Aktuell keine persistierten AI-Vorschläge mit pending/accepted/rejected/dismissed. |
| **3-Achsen-Klassifizierung (depth/purpose/mode)** | Konfligierend | Aktuell `stakeholder_types[]` + `priority` + `depth_override` + `scope` + Cadence-Buckets — mischt die Achsen, hat keine Auto-Mode-Transitionen. |
| **how_we_met / met_date / met_location** | Nicht vorhanden | Briefing-Goldfeld fehlt komplett. |
| **first_name / last_name / linkedin_url / photo_url / current_location / home_location** | Nicht als separate Spalten | `name` ist single field, `avatar_url` statt `photo_url`. |
| **`function` Enum** | Nicht vorhanden | Briefing fordert Founder/Exec/Operator/IC/Investor/Advisor/Student/Other. `job_function` ist freitext. |
| **`industry` Enum** | Freitext statt Enum | Briefing fordert 10er-Enum. |
| **CTA-Priority `cta_priority` (a/b/c)** | Verwirrt mit `priority` | Aktuell `priority` (A/B/C, person-level) + `cta` (single text field). Briefing trennt CTA mit eigener Priority. |
| **next_nudge_at** | Nicht vorhanden | Berechnung läuft on-demand in `lib/cadence.ts`, nicht persistiert. |
| **person_relationships Junction-Table** | Vorhanden als tote `connections`-Tabelle + parallel als JSONB | Briefing fordert eigene Junction-Tabelle, Echo hat beides (das eine ungenutzt, das andere die echte Source). |

---

## 6. Code-Patterns

### Mutations
- **Hauptsächlich API-Routen** (POST/GET endpoints unter `app/api/*`) statt Server Actions
- Wenige Server Actions: `app/(app)/people/actions.ts`, `app/(app)/organizations/actions.ts`, `app/(app)/connections/actions.ts`, `app/(app)/settings/actions.ts`, `app/(app)/integrations/workflows/actions.ts`
- Briefing-Direction: Server Actions als Default, API-Routen nur für Webhooks

### Data Fetching
- Server-Components rufen direkt `createClient()` (RLS-Client mit Cookie-Session) → `supabase.from(...)`
- Client-Components nutzen `fetch("/api/...")`
- Kein generierter Type-Layer (`supabase gen types` nicht im Build-Flow) — Types stehen manuell in `lib/types.ts`

### Validation
- Zod ist installiert (`react-hook-form` + zod-Resolver vermutet) — aber durchgängige Server-Side-Validation per Zod nicht verifiziert
- Type-Coercion bei API-Inputs oft per `unknown` + Manual-Cast (Risiko)

### Auth-Check in API-Routen
- Pattern: `const ctx = await getUserContext(); if (!ctx) return 401;`
- Wirkt durchgängig — keine Bypass-Pfade gesichtet

### Cron / Background
- Vercel Cron (`vercel.json`) für `/api/sunday-pulse` (Sonntag 18:00 UTC) + `/api/cron/sync-all` (stündlich)
- Keine Supabase Edge Functions — alle Jobs laufen auf Vercel Serverless
- Briefing-Direction: Edge Functions für async AI-Enrichment

### AI-Calls
- Synchron im Request-Pfad (Voice-Console wartet auf Sonnet-Response). Briefing fordert async via Edge Functions, "never block UI".
- Tool-Use über Anthropic SDK direkt in `lib/claude.ts`
- Prompts in `lib/prompts.ts` mit Anthropic Cache-Control für stabile System-Prompts
- Rate-Limits per-User per-Window in `rate_limits`-Tabelle (atomar via SQL-Function)

### Soft-Delete-Pattern
- `deleted_at timestamptz` durchgängig
- Queries filtern `.is("deleted_at", null)`
- Konflikt mit Briefing `archived boolean` — semantisch ähnlich

### UI-State
- Sehr viel localStorage für client-State (`echo:chat:v1`, `echo:alarm:v1`, `echo:search:recent-*`)
- Server-Komponenten-Default, Client-Components nur wo Interaktivität nötig
- Sticky-Save-Bar via React Portal — vermeidet `overflow-x: hidden`-Falle der `<main>`

### Komponenten-Stil
- Tailwind 4 mit Design-Token-Layer (Direction B: paper/ink/action/signal)
- Custom-Komponenten überwiegen über shadcn-Primitives (shadcn installiert aber wenig integriert)
- German UI Copy, English Code-Comments — konform zum Briefing

### Branch-Konvention
- Aktuell alles auf `main`. Branch-pro-Migrationsphase aus ECHO_SETUP.md noch nicht praktiziert.

---

## 7. Briefing-Konflikt-Punkte (Vorausblick)

Zur Aufnahme in `ECHO_GAP_ANALYSIS.md`. Hier kompakte Übersicht.

| Konflikt | Echo-IST | Briefing-SOLL | Risiko |
|---|---|---|---|
| Pipelines + Deals | Voll implementiert, eigener Bereich | Briefing 14: "Klassisches Pipeline-Management - HubSpot's Job" — bewusst nicht | Replace/Remove |
| Workflow-Editor / Voice Vibe Integrations | @xyflow/react Editor + Generator | Nicht im Briefing, kein Runtime/Executor | Replace/Remove |
| Multi-Model-Catalog mit 14 Modellen | `/models` Page + per-Task Preferences | Briefing 9: Anthropic + ElevenLabs only, PDL + Whisper/Deepgram | Refactor/Trim |
| Stakeholder-Klassifizierung | `stakeholder_types[]` + `stakeholder_sub_types` jsonb | 3-Achsen depth/purpose/mode | Refactor (große Migration) |
| Tags-Modell | text[]-Array auf people/orgs/notes | Eigene Tabelle mit cluster-Enum + 7er-Limit + Dedup | Refactor (Schema-Migration) |
| Person-Fields | `name` single, `avatar_url`, kein `linkedin_url` etc. | first_name/last_name/linkedin_url/photo_url/met_event/how_we_met/etc. | Build new fields |
| AI-Suggestions-Persistenz | Ad-hoc in-memory | Suggestions-Tabelle mit pending/accepted/rejected/dismissed | Build new |
| AI-Enrichment-Pipeline | Keine (außer Org-Enrich) | PDL für Person-Enrich | Build new |
| Voice-STT-Server-Side | Browser-only Web Speech API | Deepgram oder Whisper für Voice-Notes | Build new |
| Sonntags-Puls | Cron läuft + UI da, aber **kein Push** | Push-Notification Sonntag 19:00 + 1-Klick-Aktionen | Build new (PWA) |
| Mode Auto-Transitions | Keine (active → dormant) | Active→dormant @ 2x cadence, dormant→reconnect bei Trigger | Build new |
| Depth Auto-Calculation | Aktuelle Cadence-Buckets sind nicht depth | Briefing 4.1 Algorithmus: ≥24 Interaktionen/12mo → inner_5 etc. | Build new |
| Email-Forward-Endpoint | Nicht vorhanden | crm-add@… per Email-Forward | Build new |
| Visitenkarten-OCR | Vorhanden (Claude Vision) | Briefing OK, schon implementiert | Keep |
| Voice-Note-Add | Voice-Console läuft, aber keine 20-60s Voice-Note → Transcript → Extract | Briefing 5.2 exakt das | Build new |
| Migration-Praxis | Alle Tabellen-Inits außerhalb der dateibasierten Migrations | Briefing erwartet vollständige Migrations | Refactor (Schema-Re-Capture) |

---

## 8. Anomalien & Tech-Debt

1. **Migrations 0001, 0011, 0012, 0013 fehlen im Repo.** Kern-Tabellen (people, interactions, reminders, todos, notes, debriefs) sind in der live-DB aber nicht über Migrations-Dateien dokumentiert. Re-Capture nötig vor Refactor.

2. **`connections`-Tabelle ist tote Parallele zu `people.relationships`.** Beide modellieren Person-zu-Person-Beziehungen, nur eine wird benutzt.

3. **`interactions.person_ids uuid[]` statt single FK.** Erlaubt Gruppen-Interaktionen, weicht aber von Briefing ab (`person_id` single). Migration-Risiko.

4. **Non-streaming Claude-Calls in Voice-Console.** Latenz-Risiko für lange Antworten. Briefing fordert "async AI processing, never block UI".

5. **Smart-Reminders nutzt keine Suggestions-Tabelle.** Generiert in-memory, User-Klick committet direkt zu `reminders`. Konflikt mit Briefing-Lifecycle.

6. **Webhook-Signature für WhatsApp ist da, für Gmail/Google Calendar (Push) wäre noch keiner nötig (Pull-Modell).**

7. **Tag-Limit max 7 nicht enforced** — weder DB-Constraint noch UI-Check noch DB-Trigger.

8. **Stripe-SDK installiert ohne Routen.** Toter Code-Pfad.

9. **`profile.subscription_*`-Spalten vorhanden, aber keine Set/Update-Logik.** UI in `payments-tab.tsx` ist Placeholder.

10. **Workflow-Executor fehlt.** Visual Editor + Generator existieren, Workflows werden nicht ausgeführt.

11. **Gamification (Streaks/XP/Level) nicht im Briefing.** Wird Patrick als Feature behalten wollen?

12. **`scope: work/personal/both`** auf people — orthogonal zum Briefing-`purpose`. Möglicher Mapping-Konflikt.

13. **Stakeholder-Subtypes als jsonb-Map** (Record<Type, string[]>) ist Echo-spezifisch. Briefing kennt kein zweistufiges Modell.

14. **Doppelte 0018-Migration** (`0018_admin_stats_functions.sql` + `0018_dedup_merge.sql`). Funktional getrennt aber gleiche Nummer.

---

## 9. Quantifizierung

| Bereich | LOC ungefähr | Files | Briefing-Match |
|---|---|---|---|
| Routes (app/) | ~13.000 | 34 Pages + 32 API-Routes | ~60% |
| Lib (lib/) | ~8.000 | 38 Files | ~50% |
| Components (components/) | ~10.000 | 52 Files | ~40% |
| DB-Schema | 18 Migrationen + 4 fehlend | 14 Tabellen | ~50% |
| AI-Layer | Voll vorhanden mit Tool-Use | Anthropic + ElevenLabs | ~70% |
| Sync (Calendar/Gmail/WA) | Voll wired | scaffold pending OAuth creds | ~95% |
| Klassifizierung | Stakeholder-Modell (eigene Erfindung) | 3-Achsen-Modell (Briefing) | ~30% |
| Tag-System | Flache text[]-Arrays | Cluster-Enum + Junction-Table | ~20% |
| Suggestions | Keine Persistenz | Tabelle mit Lifecycle | 0% |
| Pipelines/Deals | Voll | Aus Scope ausgeschlossen | -1 (conflict) |

**Grober Delta-Indikator**: ca. 45-55% des bestehenden Codes passt direkt oder mit kleinen Anpassungen zum Briefing-Ziel. ~25% muss refactored werden (insb. Klassifizierung + Tags). ~20% sollte entfernt werden (Pipelines/Workflows/Multi-Model-Catalog). ~10% muss neu gebaut werden (Suggestions, PDL, Push, Voice-STT, Mode-Transitions).

Per ECHO_SETUP.md-Heuristik:
- "<40% ersetzen → Refactor": passt knapp
- ">70% ersetzen → Parallel-Neubau": überschritten wir nicht
- **Empfehlung: Refactor in Phasen, kein Parallel-Neubau.**

---

Ende der Inventur. Nächster Schritt: `ECHO_GAP_ANALYSIS.md`.
