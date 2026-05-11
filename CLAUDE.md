# CLAUDE.md - Echo Personal CRM

This file provides guidance to Claude Code when working on the Echo Personal CRM project.

## Project Context

Echo is Patrick Bohrer's Personal CRM. There is existing code in this repo that will be refactored / replaced based on a new architectural direction.

Two reference documents in the project root drive all decisions:
- `PERSONAL_CRM_BUILD_BRIEFING.md` - the canonical product specification
- `SPRINT_PLAN.md` - the ticket-by-ticket execution plan

Before making any changes, Claude Code must first complete the Discovery Phase (see below).

## Owner & Communication Style

- Owner: Patrick Bohrer (Head of Growth & Sales at Valoon GmbH)
- Language for UI/UX copy: German
- Language for code, comments, commits: English
- Code style: clean, readable, no over-engineering
- No long em-dashes in user-facing copy (use - or rephrase)
- Always correct German umlauts (ä, ö, ü, ß) in user-facing copy

## Discovery Phase (DO THIS FIRST)

Before writing or changing any code, Claude Code must:

1. Inventory the existing codebase
   - List all top-level folders and their purpose
   - Identify the framework (Next.js? Vite? Other?)
   - Identify the database (Supabase? Postgres? Prisma? Other?)
   - List installed dependencies (package.json)
   - Identify the current data model (DB schema files, migrations, ORM models)
   - Identify the current UI structure (which routes/pages exist)
   - Identify AI integrations (which providers, where called)

2. Produce an Inventory Report in `ECHO_INVENTORY.md` covering:
   - Current architecture summary
   - Current data model (entities and their fields)
   - Current routes and what they do
   - Existing features that work
   - Existing features that are incomplete or broken
   - Code patterns currently used (Server Actions? API routes? Client-side fetches?)

3. Produce a Gap Analysis in `ECHO_GAP_ANALYSIS.md` covering:
   - What from the briefing already exists (keep)
   - What exists but needs to change (refactor)
   - What exists but contradicts the new direction (replace)
   - What is missing entirely (build new)
   - Risk assessment per change (what could break)

4. Present a Migration Plan for Patrick's approval before any code change

Do not start TICKET-001 of the Sprint Plan blindly. The Sprint Plan assumes greenfield. For Echo, we need a Migration Plan first that adapts those tickets to the existing reality.

## Target Architecture

- Frontend: Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- Backend: Supabase (Postgres + Auth + Storage + Edge Functions)
- AI: Anthropic Claude API (Sonnet 4.5 for extraction, Haiku for tag suggestions)
- Enrichment: People Data Labs (LinkedIn data)
- Voice: Deepgram or OpenAI Whisper
- Hosting: Vercel (frontend) + Supabase Cloud (EU region for GDPR)

## Architecture Principles

1. Server Components by default - only use Client Components when state/interactivity required
2. Server Actions for mutations - no separate API routes unless needed for webhooks
3. Type-safe end-to-end - use Supabase generated types + Zod validation
4. Async AI processing - Edge Functions for enrichment jobs, never block UI
5. Optimistic UI updates for AI suggestions (accept/reject feels instant)

## Key Domain Rules

### 3-Achsen-Klassifizierung

Three orthogonal axes - never mix them:
- depth: how close (auto-calculated from interaction frequency, manual override possible)
- purpose: why connected (always manual, 5 options)
- mode: current state (auto-calculated from cadence + AI signals)

If existing code has a different classification logic (e.g. single "stakeholder_type" field mixing depth and purpose), this must be migrated to the 3-axis model, not preserved.

### Tags

- Max 7 per person (enforce in UI and DB)
- Flat, not hierarchical
- 4 clusters: context, topic, value, trigger
- Auto-deduplication suggestions when similar tags exist

### Cadence Defaults (in days)

```typescript
const CADENCE_DEFAULTS = {
  inner_5: 14,
  trusted_15: 30,
  active_50: 90,
  network_150: 180,
  periphery_500: 365,
};
```

### Mode Auto-Transitions

- active -> dormant when last_contact > 2x expected_cadence
- dormant -> reconnect when AI detects trigger (job change, birthday, news)
- Never auto-transition to archive (always manual)

## Migration Strategy Rules

1. Preserve existing data at all costs
   - Never run destructive migrations without a backup script
   - Every schema change needs a forward migration AND a data migration
   - Old fields stay in DB until new fields are populated and verified

2. Migrate in slices, not in one big bang
   - One axis at a time (start with purpose, then depth, then mode)
   - Old UI keeps working until new UI is in place

3. Always provide a rollback path
   - Each migration is paired with a down migration
   - Document rollback steps in the migration file

4. Test on a branch first
   - Never push migrations directly to main
   - Always test schema changes locally with `supabase db reset` first

## Database Conventions

- Use uuid for all primary keys (generated server-side)
- Use timestamptz for all timestamps
- Use snake_case for column names
- All tables have created_at, updated_at (auto-updated via trigger)
- Soft-delete via archived boolean, never hard-delete person records
- Row-Level-Security enabled on all tables, filtered by user_id

## AI Integration Rules

1. Never auto-apply AI output - always create a Suggestion row for user confirmation
2. Always include reasoning in suggestions - transparency for the user
3. Cache enrichment results for 30 days
4. Rate-limit AI calls per user (max 100 Claude calls/day in MVP)
5. Graceful degradation - if AI fails, save the person without enrichment, retry in background

## Things to NEVER do

- Don't delete existing data without a backup script and explicit Patrick approval
- Don't refactor multiple unrelated areas in one PR
- Don't add fields not specified in the briefing without asking Patrick first
- Don't use ORMs that abstract Supabase (use the official client directly)
- Don't introduce shadcn alternatives (stick with shadcn for consistency)
- Don't auto-categorize people without showing it as a suggestion
- Don't store sensitive data (phone, email) in plaintext logs
- Don't make sync API calls to AI providers from the request path
- Don't build pipeline/deal management features (that's HubSpot's job)
- Don't proceed past Discovery Phase without Patrick's explicit migration plan approval

## Things to ALWAYS do

- Always check PERSONAL_CRM_BUILD_BRIEFING.md for canonical spec
- Always check ECHO_INVENTORY.md before touching existing code
- Always preserve umlauts in German strings (no ae/oe/ue/ss substitutions)
- Always use environment variables for API keys (never hardcode)
- Always validate user input with Zod before DB writes
- Always set up Row-Level-Security on new tables
- Always git-commit before destructive operations
