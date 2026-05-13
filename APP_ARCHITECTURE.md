# Echo Personal CRM - Full Architecture Map

> Plain-English visual map of every part of the app and how they connect.
> Generated from the live codebase (May 2026).

---

## 1. Big Picture - 30,000ft View

```
┌─────────────────────────────────────────────────────────────────────┐
│                           PATRICK'S BROWSER                         │
│                                                                     │
│  Voice Mic ──► Web Speech API (browser built-in, German de-DE)      │
│  Keyboard  ──► Text Composer                                        │
│  Touch/Click ► Page UI (React 19, Tailwind 4)                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        VERCEL (Frankfurt fra1)                      │
│                                                                     │
│  Next.js 16 App Router                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Server Components│  │  Server Actions  │  │   API Routes     │  │
│  │  (page.tsx files)│  │  (actions.ts)    │  │  (route.ts files)│  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
│                                                                     │
│  lib/ (Domain Logic - 38 files)                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  claude.ts │ elevenlabs.ts │ cadence.ts │ people.ts │ ...    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Vercel Cron Jobs (scheduled background tasks)                      │
└──────────┬──────────────────────────────────────────────┬──────────┘
           │                                              │
           ▼                                              ▼
┌──────────────────────┐              ┌───────────────────────────────┐
│   SUPABASE (EU)      │              │       EXTERNAL SERVICES       │
│                      │              │                               │
│  Postgres DB         │              │  Anthropic (Claude Sonnet)    │
│  Auth (Magic Link)   │              │  ElevenLabs (TTS voice)       │
│  Row-Level Security  │              │  Google (Calendar + Gmail)    │
│  SQL Functions       │              │  Meta / WhatsApp Cloud API    │
│  Storage             │              │  OSM Nominatim (addresses)    │
└──────────────────────┘              └───────────────────────────────┘
```

---

## 2. Pages (What Patrick Sees)

Every page lives under `app/(app)/` and requires login. Auth routes are at `app/login` and `app/callback`.

```
NAVIGATION SIDEBAR
│
├── /                    VOICE CONSOLE (home page)
│                        Chat-style interface, mic button,
│                        text composer fallback, ⌘+K search
│
├── /people              PEOPLE LIST
│   ├── /new             Add person form (30+ fields)
│   ├── /import          Upload a .vcf / vCard file
│   ├── /duplicates      Find + merge duplicate contacts
│   └── /[id]            PERSON DETAIL PAGE
│       └── /edit        Edit form with sticky save bar
│
├── /organizations       ORGANIZATION LIST
│   ├── /new             Add org form
│   ├── /duplicates      Find + merge duplicate orgs
│   └── /[id]            Org detail
│       └── /edit        Edit form
│
├── /inbox               INBOX (nav badge shows overdue count)
│                        Reminders + Todos + WhatsApp strip
│
├── /rhythmus            CADENCE DASHBOARD
│                        5 buckets: on-rhythm / due-soon /
│                        drifting / no-contact / no-cadence
│                        + AI Smart Reminders panel
│
├── /debrief             DAILY DEBRIEF
│                        Alarm clock + voice-guided review
│
├── /pulse               SUNDAY PULSE
│                        Weekly relationship digest
│
├── /recap               DATA RECAP
│                        AI-narrated stats overview
│
├── /integrations        WORKFLOW EDITOR (visual, @xyflow/react)
│   └── /workflows
│       └── /[id]        Node-based flow editor
│
├── /connections         OAUTH SERVICE CONNECTIONS
│   └── /[provider]      Setup page (Google Calendar, Gmail, WhatsApp)
│
├── /models              AI MODEL CATALOG
│                        14 models, per-task preferences, BYO keys
│
├── /profile             → redirects to /people/[self_id]
└── /settings            → redirects to /people/[self_id]?tab=settings
```

The **Person Detail page** (`/people/[id]`) is the most complex page. For Patrick's own profile it shows 4 tabs: **Profil / Streaks / Payments / Settings**.

---

## 3. API Routes (What the Server Handles)

These are pure HTTP endpoints called by the browser or external services (webhooks, crons).

```
AI & VOICE
├── POST /api/chat                  Voice Console brain (calls Claude Sonnet)
├── POST /api/extract               Extract contact data from text via Claude tool-use
├── POST /api/extract/commit        Save what Claude extracted to the DB
├── POST /api/voice/synthesize      Text → spoken audio via ElevenLabs
├── POST /api/scan-business-card    Photo → contact data via Claude Vision
├── POST /api/enrich-organization   Enrich org info with AI
├── POST /api/recap                 Generate weekly recap narrative
└── POST /api/sunday-pulse          Generate Sunday digest

PEOPLE & SEARCH
├── GET  /api/search                Full-text search (pg_trgm)
├── GET  /api/address-search        Address autocomplete (proxies OSM Nominatim)
├── GET  /api/people/duplicate-check  Warn before saving a duplicate
├── GET  /api/duplicates/people     List probable duplicate pairs
├── POST /api/duplicates/people     Merge two people (SQL atomic merge)
├── GET  /api/duplicates/organizations
└── POST /api/duplicates/organizations

IMPORT / EXPORT
├── POST /api/import/vcard          Parse .vcf and preview with dedup check
├── POST /api/import/vcard/commit   Actually insert the parsed contacts
└── GET  /api/people/[id]/dates.ics Download iCal file of key dates

REMINDERS
├── GET  /api/reminders/smart       AI-suggested reminders (context-aware)
├── POST /api/reminders/smart       Accept a suggestion → creates reminder row
└── GET  /api/reminders/due         List of overdue/upcoming reminders

DEBRIEF
└── POST /api/debriefs/finalize     Save debrief + recalculate streaks

SYNC INTEGRATIONS
├── POST /api/calendar/sync         Pull events from Google Calendar
├── POST /api/email/sync            Pull emails from Gmail
├── GET  /api/whatsapp/webhook      Meta verification challenge
├── POST /api/whatsapp/webhook      Receive WhatsApp messages (HMAC-validated)
├── POST /api/whatsapp/send         Send a WhatsApp message
└── POST /api/whatsapp/messages/[id]/read  Mark message as read

OAUTH FLOW
├── GET  /api/oauth/[provider]/start     Build the auth URL, redirect to provider
└── GET  /api/oauth/[provider]/callback  Exchange code for tokens, save to DB

WORKFLOWS
├── POST /api/workflows/generate    AI generates a workflow node graph

CRON (called by Vercel Scheduler)
└── GET  /api/cron/sync-all         Runs calendar + email sync for all users
                                    (protected by CRON_SECRET header)
```

---

## 4. The Library Layer (Business Logic)

`lib/` is where the real logic lives. Server components and API routes import from here. Nothing in `lib/` is browser-only (except when called from Client Components via fetch).

```
AI & VOICE
├── claude.ts           Anthropic SDK wrapper - chatForTask(), streamForTask()
├── ai.ts               Dispatcher that routes to the right provider
│                       (currently only Anthropic + ElevenLabs are real;
│                        others log a warning and fall back to Sonnet)
├── elevenlabs.ts       ElevenLabs TTS - synthesizeSpeech()
├── prompts.ts          All system prompt strings (with cache-control headers)
├── tools.ts            EXTRACTION_TOOLS definition for Claude tool-use
│                       (create_person, update_person, log_interaction,
│                        create_note, create_reminder, create_todo, suggest_replies)
└── model-catalog.ts    14-model catalog across 7 providers

PEOPLE & RELATIONSHIPS
├── people.ts           People CRUD helpers
├── organizations.ts    Organization CRUD helpers
├── duplicates.ts       Pairwise scoring (name trigram + email + phone + company)
├── relationship.ts     Relationship type definitions
├── stakeholder-taxonomy.ts  Stakeholder types + subtypes
├── connections-catalog.ts   Connection type labels
└── profile-depth.ts    Depth/strength score calculations

SCHEDULING & CADENCE
├── cadence.ts          listCadenceRows() - groups people into 5 buckets
├── smart-reminders.ts  AI-powered reminder suggestions (in-memory, not persisted)
├── recurrence.ts       Recurring reminder calculations
└── debriefs.ts         Debrief logic + streak calculation

CONTENT & SUMMARIES
├── recap.ts            Weekly recap generation
├── pulse.ts            Sunday pulse generation
├── inbox.ts            Inbox item aggregation
└── tab-status.ts       Tab health checks (opportunities + problems per tab)

SYNC & INTEGRATIONS
├── calendar-sync.ts    Google Calendar → external_events → interactions
├── email-sync.ts       Gmail → external_messages → interactions
├── whatsapp.ts         WhatsApp message processing
├── whatsapp-inbox.ts   WhatsApp inbox aggregation
├── google.ts           Google OAuth token management
├── oauth-providers.ts  Provider configs (Google, WhatsApp stubs)
└── integrations.ts     service_connections helpers

UTILITIES
├── supabase/server.ts  RLS-aware Supabase client (uses cookie session)
├── supabase/admin.ts   Service-role client (webhooks that have no user session)
├── search.ts           pg_trgm search query builder
├── vcard.ts            vCard 3.0/4.0 parser
├── business-card.ts    Business card scan + extraction
├── rate-limit.ts       Atomic rate limit check via SQL function
├── gamification.ts     XP, levels, 16 achievement badges
├── workflows.ts        Workflow helpers
├── pipelines.ts        Pipeline/deal helpers
├── text.ts             Text utilities
├── utils.ts            General utilities
└── types.ts            Shared TypeScript types (hand-maintained)
```

---

## 5. Database (Supabase / Postgres)

14 public tables. All have `user_id` + Row-Level Security. All have `created_at` / `updated_at`. Soft-delete via `deleted_at`.

```
CORE CONTACT DATA
┌────────────────────────────────────────────────────────┐
│  people (40 columns)                                   │
│  ─────────────────────────────────────────────────     │
│  id, user_id, name, company, role, scope               │
│  phones[], emails[], addresses[], socials[] (JSONB)    │
│  tags[] (text array, flat, no cluster system yet)      │
│  stakeholder_types[], stakeholder_sub_types (JSONB)    │
│  strength_score, depth_override, expected_cadence_days │
│  priority (A/B/C), cta, cta_expires_at                 │
│  last_interaction_at, next_best_action                 │
│  notes (freetext), notes_summary (AI), avatar_url      │
│  organization_id → organizations                       │
│  is_self (one row per user is their own profile)       │
│  deleted_at (soft-delete)                              │
└────────────────────────────────────────────────────────┘
          │ organization_id
          ▼
┌────────────────────────────────────────────────────────┐
│  organizations (15 columns)                            │
│  id, user_id, name, domain, industry, size             │
│  website, description, tags[], notes                   │
│  deleted_at                                            │
└────────────────────────────────────────────────────────┘

ACTIVITY DATA
┌────────────────────────────────────────────────────────┐
│  interactions (11 columns)                             │
│  id, user_id, person_ids[] (multiple people OK)        │
│  type, source, summary, transcript, sentiment          │
│  topics[], occurred_at                                 │
└────────────────────────────────────────────────────────┘

┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐
│  notes (9 cols) │  │  reminders       │  │  todos (9 cols)│
│  person_id      │  │  (10 cols)       │  │  person_id     │
│  content        │  │  person_id       │  │  title         │
│  tags[]         │  │  remind_at       │  │  priority      │
│                 │  │  recurrence      │  │  status        │
│                 │  │  type, status    │  │  source_debrief│
└─────────────────┘  └──────────────────┘  └────────────────┘

┌────────────────────────────────────────────────────────┐
│  debriefs (9 columns)                                  │
│  user_id, interaction_ids[], action_ids[]              │
│  audio_url, duration_sec, summary                      │
└────────────────────────────────────────────────────────┘

SYNC DATA (from external services)
┌─────────────────────┐  ┌──────────────────────┐  ┌──────────────┐
│  external_events    │  │  external_messages   │  │  wa_messages │
│  (Google Calendar)  │  │  (Gmail)             │  │  (WhatsApp)  │
│  matched to people  │  │  matched to people   │  │  per contact │
└─────────────────────┘  └──────────────────────┘  └──────────────┘

OAUTH TOKENS
┌────────────────────────────────────────────────────────┐
│  service_connections (16 columns)                      │
│  user_id, provider, status                             │
│  access_token, refresh_token, token_expires_at         │
│  config (JSONB) - e.g. { phone_number_id: "..." }      │
│  last_synced_at, sync_cursor                           │
└────────────────────────────────────────────────────────┘

USER PROFILE
┌────────────────────────────────────────────────────────┐
│  profiles (20 columns)                                 │
│  id → auth.users                                       │
│  display_name, language, voice_id, debrief_time        │
│  model_preferences (JSONB), byo_api_keys (JSONB)       │
│  onboarding_progress (JSONB)                           │
│  stripe_customer_id, subscription_* (placeholder)     │
└────────────────────────────────────────────────────────┘

RATE LIMITING
┌───────────────────────────────┐
│  rate_limits (5 columns)      │
│  user_id, key, window_start   │
│  count (atomic via SQL fn)    │
└───────────────────────────────┘

PIPELINES (out-of-briefing-scope but built)
┌──────────────────────────────┐  ┌──────────────────────────────┐
│  pipelines (11 cols)         │  │  deals (18 cols)             │
│  stages (JSONB)              │  │  pipeline_id, person_id      │
│  field_definitions (JSONB)   │  │  full deal management        │
└──────────────────────────────┘  └──────────────────────────────┘

WORKFLOWS (visual editor, no runtime)
┌────────────────────────────────────────────────────────┐
│  workflows (11 columns)                                │
│  nodes (JSONB), edges (JSONB)                          │
│  default_model_preferences (JSONB)                     │
└────────────────────────────────────────────────────────┘

SQL FUNCTIONS (server-side logic)
  merge_people(uuid, uuid)           Atomic merge with FK repointing
  merge_organizations(uuid, uuid)    Atomic merge
  jsonb_dedup(jsonb)                 JSONB array deduplication
  rate_limit_increment(...)          Atomic counter increment
  rate_limit_sweep()                 Cleanup expired windows
  admin_overview_stats()             Admin dashboard aggregates
  admin_users_list()                 Admin user list
```

---

## 6. Authentication Flow

```
Patrick visits any (app)/* page
        │
        ▼
  middleware.ts checks for session cookie
        │
        ├── NO SESSION ──► redirect to /login
        │
        └── HAS SESSION ──► page renders normally

/login page
  Patrick enters email
        │
        ▼
  Supabase sends Magic Link email
        │
        ▼
  Patrick clicks link ──► /callback
        │
        ▼
  /callback exchanges code for session cookie
        │
        ▼
  redirect to / (Voice Console)
```

---

## 7. Voice Console Flow (The Main Feature)

```
Patrick speaks or types
        │
        ▼ (if voice)
  Browser Web Speech API (de-DE)
  transcribes audio to text
        │
        ▼
  POST /api/chat
  sends: { message, conversationHistory }
        │
        ▼
  lib/claude.ts calls Anthropic Claude Sonnet 4.6
  with EXTRACTION_TOOLS available:
    - create_person
    - update_person
    - log_interaction
    - create_note
    - create_reminder
    - create_todo
    - suggest_replies
        │
        ├── Claude responds with TEXT ──► shown as chat bubble
        │
        └── Claude responds with TOOL CALL ──► shown as Confirm Card
                                                (Patrick must approve)
                    │
                    ▼ (Patrick clicks "Anlegen")
              POST /api/extract/commit
              writes to Supabase DB
              (people / interactions / notes / reminders / todos)

VOICE RESPONSE (when response is text):
  POST /api/voice/synthesize
  sends text to ElevenLabs (Sarah Eve, eleven_flash_v2_5)
  receives audio blob
  browser plays it
```

---

## 8. Contact Sync Flows

### Google Calendar Sync
```
Trigger: Patrick visits /connections and clicks "Sync"
     OR: Vercel Cron runs /api/cron/sync-all every hour

  POST /api/calendar/sync
        │
        ▼
  lib/calendar-sync.ts
  loads service_connections row (has OAuth tokens)
  calls Google Calendar API
  gets events since last sync cursor
        │
        ▼
  For each event with attendees:
    match attendee email → people.emails JSONB
    upsert → external_events table
    create interaction row (type: 'meeting')
  update service_connections.last_synced_at
```

### Gmail Sync
```
Same pattern as Calendar:
  POST /api/email/sync
  → lib/email-sync.ts
  → Google Gmail API
  → match sender/recipient → people.emails
  → upsert external_messages
  → create interaction (type: 'email')
```

### WhatsApp Receive
```
Meta sends webhook ──► POST /api/whatsapp/webhook
        │
        ▼
  Verify HMAC-SHA256 signature (WEBHOOK_SECRET env var)
        │
        ▼
  lib/whatsapp.ts processes message
  match sender phone number → people.phones JSONB
  insert → wa_messages table
  create interaction (type: 'whatsapp')

Patrick replies via inbox:
  POST /api/whatsapp/send
  → calls Meta Cloud API with phone_number_id from service_connections.config
```

### OAuth Setup (Google)
```
Patrick clicks "Verbinden" on /connections/google_calendar
        │
        ▼
  GET /api/oauth/google_calendar/start
  builds Google auth URL with scopes
  redirects Patrick to Google consent screen
        │
        ▼ (Patrick approves)
  GET /api/oauth/google_calendar/callback
  exchanges auth code for access + refresh tokens
  saves tokens → service_connections row
  redirects back to /connections
```

---

## 9. AI Enrichment Flows

### Business Card Scan
```
Patrick takes photo on /people/new
        │
        ▼
  POST /api/scan-business-card
  sends image to Claude Vision (claude-sonnet-4-6)
  Claude reads card → returns structured JSON
        │
        ▼
  Pre-fills /people/new form
  Patrick reviews + saves
```

### Smart Reminders (Rhythmus Page)
```
Patrick opens /rhythmus
        │
        ▼
  GET /api/reminders/smart
  lib/smart-reminders.ts:
    loads overdue cadence contacts
    calls Claude with context
    Claude returns suggested reminder text + due date
        │
        ▼
  Shown as suggestion cards (IN MEMORY - not persisted yet)
  Patrick clicks "Anlegen"
        │
        ▼
  POST /api/reminders/smart
  creates reminder row in DB
```

### Organization Enrichment
```
Patrick saves an organization
        │
        ▼
  POST /api/enrich-organization
  sends org name + domain to Claude
  Claude returns industry, size, description guesses
        │
        ▼
  Pre-fills org fields
  Patrick confirms
```

---

## 10. Scheduled Background Jobs (Vercel Cron)

```
vercel.json defines two cron schedules:

SUNDAY 18:00 UTC ──► POST /api/sunday-pulse
  lib/pulse.ts:
    loads Patrick's stale contacts (overdue cadence)
    loads upcoming birthdays
    loads open todos
    calls Claude to write narrative digest
    saves result

EVERY HOUR ──► GET /api/cron/sync-all
  (requires CRON_SECRET header)
  loops over all service_connections rows
    where status = 'active'
  calls:
    runCalendarSync() for google_calendar connections
    runEmailSync() for google_gmail connections
```

---

## 11. Cadence / Rhythmus Logic

```
People in DB have:
  expected_cadence_days  (how often to stay in touch)
  last_interaction_at    (when last contacted)

lib/cadence.ts listCadenceRows():
  calculates days_since_contact for each person
  compares to expected_cadence_days

Bucket assignment:
  on-rhythm   → days_since <= expected
  due-soon    → days_since in (expected, expected * 1.5]
  drifting    → days_since in (expected * 1.5, expected * 2]
  no-contact  → last_interaction_at is null
  no-cadence  → expected_cadence_days is null

/rhythmus page shows 5 columns with people cards
Smart Reminders panel on right shows AI suggestions
```

---

## 12. Debrief + Streak Flow

```
Patrick opens /debrief
  Clock shows current time
  Time picker to set alarm
  WebAudio triple-beep when alarm triggers

Debrief starts (voice-guided multi-phase):
  Phase 1: "Was hast du heute erledigt?"
  Phase 2: "Wen hast du getroffen?"
  Phase 3: "Was planst du morgen?"

  Each phase uses Voice Console pipeline
  (Web Speech → /api/chat → Claude → ElevenLabs)

At end: POST /api/debriefs/finalize
  saves debrief row (interaction_ids, action_ids, audio_url)
  lib/debriefs.ts recalculates:
    current_streak (consecutive days with a debrief)
    longest_streak (all-time record)
    XP points earned
  updates profiles row
```

---

## 13. Duplicate Detection + Merge

```
While typing in /people/new:
  GET /api/people/duplicate-check?name=...&email=...
  lib/duplicates.ts pairwise scoring:
    name similarity (trigram)  → 0-40 pts
    email match                → +30 pts
    phone match                → +20 pts
    company match              → +10 pts
  shows inline warning if score > 60

/people/duplicates page:
  GET /api/duplicates/people
  runs all-pairs scoring across Patrick's contacts
  groups into High (>80) / Medium (60-80) / Low (40-60)

Patrick clicks "Zusammenführen":
  POST /api/duplicates/people { keep_id, merge_id }
  calls Supabase SQL function merge_people(keep, merge):
    repoints all interactions.person_ids
    repoints all notes.person_id
    repoints all reminders.person_id
    merges JSONB fields (phones, emails, etc.)
    soft-deletes the duplicate (deleted_at = now())
    atomic transaction (no partial merges)
```

---

## 14. Search

```
Patrick presses ⌘+K
  Search modal opens (Server Component portal)

Patrick types query:
  GET /api/search?q=...
  lib/search.ts builds pg_trgm query:
    searches people.name, people.company
    searches organizations.name
    searches notes.content
  returns ranked results

Results show as grouped list:
  People / Organizations / Notes
  click → navigate to detail page

Recent searches saved in localStorage (6 items)
Recent hits saved in localStorage (8 items)
```

---

## 15. Component Architecture

```
components/
├── ui/                    shadcn wrappers (button, card, etc.)
│                          Note: mostly custom Tailwind components are used
│                          instead - shadcn is installed but underused
│
├── Voice Console components
│   ├── voice-console.tsx  Main chat UI + mic button
│   ├── chat-bubble.tsx    Message display
│   └── confirm-card.tsx   Tool-call approval card
│
├── People components
│   ├── person-form.tsx    30+ field add/edit form
│   ├── person-card.tsx    List item card
│   ├── person-detail.tsx  Full detail view with tabs
│   └── sticky-save-bar.tsx  React Portal save bar (avoids overflow issues)
│
├── Org components
│   └── (similar pattern to people)
│
├── Cadence / Inbox
│   ├── cadence-bucket.tsx  Single bucket column
│   ├── reminder-card.tsx   Reminder item
│   └── smart-reminder-suggestion.tsx  AI suggestion card
│
├── Sync / Integration
│   ├── connection-card.tsx  OAuth provider setup card
│   └── workflow-editor.tsx  @xyflow/react canvas + custom nodes
│
├── Layout
│   ├── sidebar.tsx         Left nav with badge on Inbox
│   ├── search-modal.tsx    ⌘+K global search
│   └── tab-status.tsx      Health indicator per tab
│
└── Profile / Settings
    ├── profile-tabs.tsx    4-tab layout (Profil/Streaks/Payments/Settings)
    ├── streaks-tab.tsx     XP + streak + 16 achievements
    ├── payments-tab.tsx    Placeholder (Stripe not wired)
    └── settings-tab.tsx    BYO keys + voice + debrief time
```

---

## 16. Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL         Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY    Supabase anon key (RLS enforced)
SUPABASE_SERVICE_ROLE_KEY        Service role (webhook routes only)

ANTHROPIC_API_KEY                Claude API key
ELEVENLABS_API_KEY               ElevenLabs TTS key

GOOGLE_CLIENT_ID                 Google OAuth app
GOOGLE_CLIENT_SECRET             Google OAuth app secret

WHATSAPP_PHONE_NUMBER_ID         Meta Business phone number ID
WHATSAPP_ACCESS_TOKEN            Meta long-lived token
WHATSAPP_WEBHOOK_SECRET          HMAC verification secret
WHATSAPP_BUSINESS_ACCOUNT_ID     Meta business account ID

CRON_SECRET                      Vercel cron authorization header

ADMIN_EMAILS                     Comma-separated admin emails
```

---

## 17. What Is Built vs. What Is Placeholder

```
STATUS KEY:  ✅ Fully working  |  ⚠️ Wired but needs config  |  🚧 Scaffold only  |  ❌ Not started

FEATURE                          STATUS   NOTES
──────────────────────────────────────────────────────────────────────────────
Voice Console (chat + mic)        ✅       Web Speech + Claude + ElevenLabs
Contact CRUD (people/orgs)        ✅       Full 40-field form
vCard Import                      ✅       v3.0 + v4.0, with dedup preview
Business Card OCR                 ✅       Claude Vision
Duplicate Detection + Merge       ✅       Pairwise scoring + SQL atomic merge
Global Search (⌘+K)               ✅       pg_trgm backend
Cadence Buckets (/rhythmus)       ✅       5 bucket algorithm
Smart Reminders                   ✅       AI suggestions, in-memory only
Debrief Flow                      ✅       Voice-guided, streak tracking
Gamification (XP/streaks)         ✅       16 achievements, level system
Sunday Pulse                      ✅       Cron + UI runner
Recap                             ✅       AI narrative
Workflow Editor (visual)          ✅       @xyflow/react canvas + AI generate
Admin Dashboard                   ✅       Stats + user list (SECURITY DEFINER)
Google Calendar Sync              ⚠️       Code ready, needs GOOGLE_CLIENT_ID
Gmail Sync                        ⚠️       Code ready, needs GOOGLE_CLIENT_ID
WhatsApp Webhook                  ⚠️       Code ready, needs Meta Business config
Rate Limiting                     ✅       Atomic SQL counter
RLS on all tables                 ✅       Consistent, all 14 tables
Workflow Runtime/Executor         🚧       Editor exists, nothing runs the flows
Payments / Stripe                 🚧       SDK installed, routes not built
Push Notifications (PWA)          ❌       Alarm only works with tab open
PDL / LinkedIn Enrichment         ❌       Not started
Server-side STT (Deepgram)        ❌       Browser-only Web Speech API today
Email Forward (crm-add@...)       ❌       Not started
Suggestions table (AI lifecycle)  ❌       Smart reminders not persisted
3-Axis classification             ❌       Current model mixes depth/purpose/mode
Tag cluster system                ❌       Flat text arrays today
how_we_met / met_date fields      ❌       Missing from schema
first_name / last_name separate   ❌       Single 'name' field today
```

---

## 18. Key Data Flows Summary

```
VOICE INPUT → Claude → Tool Call → Confirm → DB write → ElevenLabs → Audio out

CALENDAR/GMAIL → OAuth tokens in service_connections
              → Hourly cron pulls events/emails
              → Matches to people by email
              → Creates interactions

WHATSAPP     → Meta webhook → HMAC check → wa_messages → interactions

DUPLICATE    → Pairwise JS scoring → SQL atomic merge function

CADENCE      → expected_cadence_days vs last_interaction_at
              → 5 buckets → Smart Reminder AI suggestions

DEBRIEF      → Voice console multi-phase → finalize API → streak calc

SUNDAY       → Vercel Cron Sunday 18:00 → Claude narrative → /pulse UI

AUTH         → Magic Link email → callback → session cookie → middleware
```
