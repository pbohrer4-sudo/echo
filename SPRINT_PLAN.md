# Sprint Plan - Personal CRM MVP

Ticket-by-ticket execution plan for Claude Code. Work through these in order. Each ticket has clear acceptance criteria.

Note: This plan assumes greenfield. For the Echo refactor, first complete the Discovery Phase (see CLAUDE.md) and adapt this plan to a Migration Plan based on what already exists.

## Sprint 0 - Project Setup (Day 1)

### TICKET-001: Initialize Next.js project
- Create Next.js 14 app with TypeScript, Tailwind, App Router
- Install: @supabase/ssr, @supabase/supabase-js, zod, react-hook-form, @hookform/resolvers, lucide-react, date-fns
- Setup shadcn/ui with `npx shadcn@latest init`
- Add base components: button, input, label, card, select, badge, dialog, sheet, toast, form
- Setup .env.local template with placeholders
- Create folder structure as defined in CLAUDE.md
- Acceptance: `npm run dev` works, base layout renders

### TICKET-002: Setup Supabase project + auth
- Create Supabase project (EU region)
- Setup auth (email/magic-link, single-user mode for MVP)
- Generate TypeScript types: `supabase gen types typescript`
- Create lib/supabase/client.ts and lib/supabase/server.ts
- Create middleware for protected routes
- Build login page at /login
- Acceptance: Patrick can log in, protected pages redirect when not authenticated

## Sprint 1 - Database Schema (Day 2)

### TICKET-003: Create database schema
Create migration files for these tables in order:

persons:

```sql
create table persons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  name text not null,
  first_name text,
  last_name text,
  company text,
  role text,
  industry text check (industry in ('Tech','FinTech','HealthTech','Construction','Consumer','Industrial','Public','Media','Education','Other')),
  function text check (function in ('Founder','Exec','Operator','IC','Investor','Advisor','Student','Other')),
  photo_url text,
  linkedin_url text,

  depth text check (depth in ('inner_5','trusted_15','active_50','network_150','periphery_500')),
  depth_source text default 'auto' check (depth_source in ('auto','manual_override')),
  purpose text check (purpose in ('personal','family','business_active','business_latent','aspirational')) not null,
  mode text default 'active' check (mode in ('active','nurture','dormant','reconnect','archive')),

  how_we_met text,
  met_date date,
  met_location text,

  expected_cadence_days integer,
  last_contact_at timestamptz,
  next_nudge_at timestamptz,

  current_cta text,
  cta_due_at date,
  cta_priority text check (cta_priority in ('a','b','c')),

  home_location text,
  current_location text,

  notes text,
  archived boolean default false
);

create index idx_persons_user on persons(user_id);
create index idx_persons_next_nudge on persons(user_id, next_nudge_at) where archived = false;
create index idx_persons_mode on persons(user_id, mode);
```



tags:

```sql
create table tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  name text not null,
  cluster text check (cluster in ('context','topic','value','trigger')) not null,
  created_by text default 'user' check (created_by in ('user','ai_suggested','ai_extracted')),
  usage_count integer default 0,
  created_at timestamptz default now(),
  unique(user_id, name)
);

create table person_tags (
  person_id uuid references persons(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (person_id, tag_id)
);
```



person_relationships:

```sql
create table person_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  person_id uuid references persons(id) on delete cascade not null,
  related_person_id uuid references persons(id) on delete cascade not null,
  relationship_type text not null,
  label text,
  created_at timestamptz default now(),
  unique(person_id, related_person_id)
);
```



interactions:

```sql
create table interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  person_id uuid references persons(id) on delete cascade not null,
  interaction_type text check (interaction_type in ('call','meeting','email','whatsapp','linkedin_dm','coffee','dinner','event','note','other')) not null,
  direction text check (direction in ('inbound','outbound','mutual')),
  occurred_at timestamptz not null,
  duration_minutes integer,
  summary text,
  sentiment text check (sentiment in ('positive','neutral','negative')),
  ai_extracted_facts jsonb,
  source text default 'manual',
  created_at timestamptz default now()
);

create index idx_interactions_person on interactions(person_id, occurred_at desc);
```



suggestions:

```sql
create table suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  person_id uuid references persons(id) on delete cascade not null,
  suggestion_type text check (suggestion_type in ('tag','cadence','cta','connection','reconnect','depth_change','mode_change','merge_duplicate')) not null,
  payload jsonb not null,
  reasoning text,
  status text default 'pending' check (status in ('pending','accepted','rejected','dismissed')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create index idx_suggestions_pending on suggestions(user_id, status) where status = 'pending';
```


Triggers + RLS: Add updated_at trigger to all tables. Enable RLS on all tables with policy `user_id = auth.uid()`.

- Acceptance: All migrations run, types regenerated, RLS active

## Sprint 2 - Quick-Add Flow (Days 3-4)

### TICKET-004: Build Quick-Add form
- Route: /people/new
- Form fields: name (required), how_we_met (textarea), purpose (radio buttons, 5 options), depth (radio buttons, 5 options + "let AI decide")
- Use react-hook-form + zod schema
- Server Action: createPerson(input) in app/actions/persons.ts
- After save: redirect to person detail page, trigger background enrichment
- Acceptance: Patrick can add a person in <30 seconds, gets redirected to detail page

### TICKET-005: Claude API integration for extraction
- Create lib/ai/claude.ts wrapper
- Create lib/ai/prompts/extract-context.ts with the prompt from briefing section 11.1
- Create lib/ai/extract.ts function extractContext(howWeMet: string) returning typed result
- Use claude-sonnet-4-5
- Server Action: trigger after createPerson, write results to suggestions table
- Acceptance: Adding "Auf der Bauma 2025 getroffen, Head of Digital bei Münchner Bauunternehmen, sucht Foto-Doku-Lösung, Marvin kennt ihn" creates suggestions for company guess, industry=Construction, role=Head of Digital, tags=[bauma-2025, construction-tech, foto-doku], CTA=Demo-Termin

### TICKET-006: PDL enrichment integration
- Create lib/enrichment/pdl.ts with People Data Labs API client
- Function: enrichPerson(name, company?) returning { linkedin_url, photo_url, role, company, location }
- Create Supabase Edge Function enrich-person triggered after person creation
- Cache results in persons table directly (these are facts, not suggestions)
- Skip if no API match (graceful degradation)
- Acceptance: New person gets enriched within 10 seconds when PDL has a match

## Sprint 3 - Person Detail Page (Days 5-7)

### TICKET-007: Person detail page layout
- Route: /people/[id]
- Server Component, fetches person + tags + interactions + pending suggestions
- 7 blocks as per briefing section 8.2
- Mobile-first single column
- Acceptance: All blocks render, data loads server-side

### TICKET-008: Editable 3-axis badges (Block 1)
- Three badges showing depth, purpose, mode
- Click opens a Sheet (drawer) with options
- Server Action: updatePersonClassification(id, axis, value)
- Manual override sets depth_source = 'manual_override'
- Acceptance: Patrick can change any axis with 2 taps

### TICKET-009: CTA block (Block 2)
- Display current_cta, due date, priority
- "Edit CTA" opens form
- Quick action: "Mark done" creates an interaction + clears CTA
- Acceptance: CTA can be set, edited, marked done

### TICKET-010: Suggestion cards (Block 3)
- Render all suggestions with status='pending' for this person
- Each card: type icon, payload preview, reasoning, 3 buttons (Accept/Reject/Adjust)
- Accept: applies the change (creates tag, sets CTA, etc.) and marks suggestion as accepted
- Reject: marks as rejected, AI learns to not suggest this
- Adjust: opens edit dialog before accepting
- Use optimistic UI for instant feedback
- Acceptance: All suggestion types render correctly, accept/reject works

### TICKET-011: Tags block (Block 4)
- Group tags by cluster
- Add new tag: searchable combobox showing existing tags + "create new"
- Remove tag: X button
- Enforce max 7 tags per person
- Acceptance: Tags can be added/removed, 8th tag attempt shows error

### TICKET-012: Relationships block (Block 5)
- List linked persons with relationship type
- Add relationship: searchable person selector + relationship type dropdown
- Click on linked person navigates to their detail page
- Acceptance: Can link two persons bidirectionally

### TICKET-013: Interaction timeline (Block 6)
- Chronological list of interactions
- "Log interaction" button opens form (type, date, summary)
- Server Action: logInteraction(input) - also updates person's last_contact_at and recalculates mode
- Acceptance: Logging interaction updates timeline and triggers mode recalculation

### TICKET-014: Notes block (Block 7)
- Long-form textarea with autosave (debounced)
- Server Action: updatePersonNotes(id, notes)
- Acceptance: Notes save automatically, work offline-friendly

## Sprint 4 - People List + Today View (Days 8-9)

### TICKET-015: People list page
- Route: /people
- Filterable: depth, purpose, mode, tag, search by name
- Default sort: depth (closest first), then last_contact_at
- Virtualized list if >100 entries
- Each row: photo, name, role@company, depth badge, mode badge, last contact
- Acceptance: Can filter and search 100+ contacts smoothly

### TICKET-016: Today view (default landing)
- Route: /today (also /)
- Section 1: Overdue CTAs (cta_due_at < today)
- Section 2: Today's CTAs (cta_due_at = today)
- Section 3: Pending suggestions (all persons, last 5)
- Section 4: Cadence-overdue persons (next_nudge_at < now, mode='active', limit 5)
- Empty state for each section
- Acceptance: Patrick sees what he needs to do today on login

## Sprint 5 - Mode Auto-Calculation + Cadence Engine (Day 10)

### TICKET-017: Cadence calculator
- Function calculateCadence(person) returns expected_cadence_days
- Logic: use depth-based default unless user has manually set
- Trigger: on person insert/update of depth
- Acceptance: New person with depth=trusted_15 gets cadence=30

### TICKET-018: Mode auto-transitions
- Supabase scheduled Edge Function update-modes, runs daily 03:00 UTC
- Logic per briefing section 4.3
- Updates: active -> dormant when last_contact > 2x cadence
- Creates reconnect suggestion when AI detects trigger (Phase 2 enhancement)
- Acceptance: Person with last_contact 60 days ago and cadence 14 gets mode=dormant after next run

### TICKET-019: Depth auto-recalculation
- Edge Function recalculate-depth, runs weekly Sunday 02:00 UTC
- Counts interactions in last 365 days per person
- Updates depth IF depth_source = 'auto'
- Creates suggestion (not auto-apply) if depth would change by 2+ tiers
- Acceptance: Person with 30 interactions in 12 months auto-classified as inner_5

## Sprint 6 - Tag Intelligence (Days 11-12)

### TICKET-020: Tag deduplication suggestions
- Edge Function: detect similar tags (Levenshtein distance, plural forms, capitalization)
- Create merge_duplicate suggestions
- UI: special suggestion type with side-by-side comparison
- Accept: merges tag B into tag A, updates all person_tags
- Acceptance: bauma25 and bauma-2025 get merge suggestion

### TICKET-021: Tag suggestion from similar persons
- When viewing person, calculate top 5 tags from persons with same industry/company
- Display as "Patrick uses these tags for similar people" chips above tag input
- One-click to add
- Acceptance: Adding new person in Construction industry sees construction-tech suggested

## Sprint 7 - Polish + Launch Prep (Days 13-14)

### TICKET-022: Onboarding flow
- First-login wizard: 3 screens explaining 3-axis model
- Pre-fill 3 example persons from Patrick's known network (Marvin, Mirjam, etc.) - or skip
- Acceptance: New user understands the model in <2 minutes

### TICKET-023: Data import from CSV
- Upload CSV with columns: name, email, company, role, notes
- Map columns to fields
- Bulk insert with default purpose=business_latent, mode=active
- Run AI extraction on each row (rate-limited)
- Acceptance: Patrick can import 100 contacts from existing spreadsheet

### TICKET-024: Settings page
- Edit profile name, language preferences
- API key management (for future MCP integration)
- Export all data as JSON
- Delete account
- Acceptance: GDPR-compliant data export works

### TICKET-025: Mobile responsiveness audit
- Test all flows on iPhone-sized viewport
- Fix any horizontal scroll issues
- Verify touch targets >=44px
- Test PWA install prompt
- Acceptance: Fully usable on mobile, can install as PWA

## Definition of Done (for every ticket)

- TypeScript: no `any` types, all functions typed
- Zod validation on all user input
- RLS verified (test as different user)
- Loading + error + empty states present
- Works on mobile (tested at 375px width)
- German umlauts correct in all UI copy
- No console errors in browser
- Server Actions used for mutations (no client-side Supabase mutations in MVP)

## Phase 2 Features (after MVP ships)

Reference only - do NOT build during MVP:
- Sunday Pulse with push notifications
- Voice note input
- Email-forward endpoint
- Visitenkarten-OCR
- LinkedIn Chrome extension
- Connection discovery via embeddings
- Reconnect trigger detection
- WhatsApp message drafts
