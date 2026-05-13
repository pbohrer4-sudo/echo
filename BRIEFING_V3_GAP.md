# Briefing v3 vs Current Echo - Discrepancy Report

> Compares `ECHO_FINAL_UI_BRIEFING.md v3` (uploaded) against the current Echo codebase
> (documented in `APP_ARCHITECTURE.md` + `ECHO_INVENTORY.md`).
> Organized by severity. Use this to decide what to adopt from the new briefing.

---

## Severity Key

- **CRITICAL** - blocks a production launch or causes data loss
- **HIGH** - significant missing feature or wrong architectural direction
- **MEDIUM** - refinement / partial implementation gap
- **ECHO-ONLY** - exists in Echo but briefing explicitly excludes it

---

## 1. Platform Architecture

### CRITICAL - No Capacitor (No Native iOS/Android)

| | Briefing v3 | Echo Today |
|---|---|---|
| Platform | Capacitor 6 + Next.js, one codebase for Web + iOS + Android | Web only (Vercel) |
| Alarm | `@capacitor/local-notifications` (native, fires when app is closed) | Browser WebAudio beep (requires tab open) |
| Contacts | `@capacitor/contacts` (read phone contacts) | Not available |
| Camera | `@capacitor/camera` | Not available |
| Push | `@capacitor/push-notifications` | Not available |
| Sunday Pulse at 19:00 | Native push, fires reliably | Cron exists but no notification delivery |
| Next.js mode | `output: 'export'` (static, no SSR) | Server-rendered (SSR) |

**Impact:** Capacitor requires `output: 'export'` in Next.js config. This breaks Server Components that fetch directly from Supabase - every data fetch must move to the client or API routes. This is a fundamental architecture shift.

**To adopt:** Decide first whether you want iOS/Android. If yes, this affects almost every page. If web-only for now, this item can be deferred but Capacitor changes how SSR vs API routes are structured.

---

### CRITICAL - Table name `people` vs `persons`

| | Briefing v3 | Echo Today |
|---|---|---|
| Core table | `persons` | `people` |

Small but affects every query, every API route, every type. A rename migration with full FK repointing is required.

---

### CRITICAL - Soft-Delete Convention Mismatch

| | Briefing v3 | Echo Today |
|---|---|---|
| Soft-delete | `archived boolean default false` | `deleted_at timestamptz` |
| Filter queries | `.eq('archived', false)` | `.is('deleted_at', null)` |

Every query, every index, every UI filter would need to change.

**Note:** This was documented in `ECHO_GAP_ANALYSIS.md` as a conscious Echo decision. The current Echo convention is semantically richer (you know *when* it was deleted) but conflicts with the briefing.

---

## 2. Tech Stack

### HIGH - State Management Libraries Missing

| | Briefing v3 | Echo Today |
|---|---|---|
| Server state | TanStack Query (React Query) | Direct fetch in Server Components / raw `fetch()` |
| Client state | Zustand | useState / localStorage |

Echo works without these but the briefing expects them as the pattern for all data fetching on the client side.

---

### HIGH - Rate Limiting Backend

| | Briefing v3 | Echo Today |
|---|---|---|
| Rate limiting | Upstash Redis (100 req/min free, 1000 req/min pro) | SQL `rate_limits` table with atomic SQL function |

Upstash is faster and designed for this use case. The SQL approach works but doesn't scale as cleanly. Both enforce limits - just different backends.

---

### MEDIUM - Next.js Version

| | Briefing v3 | Echo Today |
|---|---|---|
| Next.js | 14 | 16.2.4 |

Echo is ahead of the briefing's spec. No downgrade needed - 16 is backwards-compatible with 14 APIs.

---

## 3. Naming & Branding

### HIGH - No APP_CONFIG Abstraction

| | Briefing v3 | Echo Today |
|---|---|---|
| Brand constant | `lib/config.ts` → `APP_CONFIG.PUBLIC_NAME` | "Echo" hardcoded in various places |
| Public name | "Kindra" (via env var, rebrandable without code change) | "Echo" |
| Domain | `mykindra.ai` | Not abstracted |
| Bundle ID | `com.placeholder.kindra` | Not relevant (no native app) |

The briefing introduces the concept of separating the code-name (`echo`) from the public-facing brand name (`Kindra`). This allows a rebrand without touching any code - just change an env var.

**To adopt:** Add `lib/config.ts` with `APP_CONFIG`, replace any user-visible "Echo" strings. Low risk, high value for rebrandability.

---

## 4. Authentication

### HIGH - SSO Missing (Apple, Google, Microsoft)

| | Briefing v3 | Echo Today |
|---|---|---|
| Login options | Google SSO + Apple SSO + Microsoft SSO + Magic Link | Magic Link only |
| Google scopes at login | Gmail + Calendar requested together with auth | Separate OAuth flow after login |

Apple SSO is required by App Store rules if you offer any other OAuth provider on iOS. Google SSO at login time means Gmail/Calendar tokens arrive during onboarding, not as a separate setup step.

---

### HIGH - OAuth Token Storage Model

| | Briefing v3 | Echo Today |
|---|---|---|
| OAuth tokens | `email_accounts` table (purpose-specific) | `service_connections` table (generic) |
| Gmail/Calendar link | At login (Google SSO scopes) | Post-login via `/api/oauth/google_calendar/start` |

---

## 5. Database Schema

### CRITICAL - Interactions Table: Single vs Array person_id

| | Briefing v3 | Echo Today |
|---|---|---|
| FK type | `person_id uuid references persons(id)` (single) | `person_ids uuid[]` (array) |

Echo's array approach allows group meetings without duplicate rows. The briefing assumes single-person interactions. A migration would need to either split group interactions into multiple rows, or the briefing spec would need to be adjusted.

---

### CRITICAL - Contact Data: Separate Table vs JSONB Columns

| | Briefing v3 | Echo Today |
|---|---|---|
| Phones, emails, socials | `person_contacts` table (separate rows per contact method) | JSONB columns on `people` (phones, emails, addresses, socials) |

Separate table is more queryable (find all people with a Gmail address = simple WHERE). JSONB is faster to write but harder to index and search.

---

### CRITICAL - Missing Tables in Echo

These tables are in the briefing but do not exist in Echo at all:

| Table | Purpose | Impact if missing |
|-------|---------|-------------------|
| `person_contacts` | Phones, emails, social handles | Contact data stuck in JSONB |
| `person_relationships` | Bidirectional people links | Relationships stuck in JSONB |
| `person_geographies` | Structured geo data via Google Places | Geos stuck in JSONB |
| `passions` | Max 5 per person, separate from tags | Mixed into tags array |
| `circles` | Communities and organisations person belongs to | Not available |
| `person_circles` | Junction: person ↔ circle | Not available |
| `tags` | Proper tag table with cluster enum + 4 clusters | Flat `text[]` on people |
| `person_tags` | Junction: person ↔ tag (max 7 enforced at DB level) | No junction, no 7-limit enforcement |
| `suggestions` | AI suggestion lifecycle (pending/accepted/rejected) | In-memory only, not persisted |
| `user_preferences` | Settings (replaces Echo's `profiles`) | Settings in `profiles` table |
| `email_accounts` | OAuth tokens for Gmail/Calendar | In `service_connections` |
| `alarm_sounds` | Sound library for alarm | Hardcoded sounds |
| `merge_history` | Audit trail of dedup merges | No merge history kept |
| **`life_events`** | Photos, documents, voice notes per person | Not built at all |
| **`person_life_events`** | Junction: person ↔ life event | Not built at all |
| **`api_tokens`** | Personal Access Tokens for REST API/MCP | Not built at all |
| **`user_api_keys`** | BYOK provider keys (Supabase Vault encrypted) | Keys stored as plain JSONB in profiles |
| **`quota_usage`** | Weekly quota tracking for Free plan | Not built at all |

---

### HIGH - Tags Are Completely Wrong

| | Briefing v3 | Echo Today |
|---|---|---|
| Storage | `tags` table + `person_tags` junction | `text[]` array on `people` |
| Cluster names | `origin`, `interests`, `potential`, `reminders` | `context`, `topic`, `value`, `trigger` |
| Extra clusters | `passion` (max 5), `circle` (from circles table) | None |
| 7-limit enforcement | DB constraint via junction table | Not enforced anywhere |
| Semantic meaning | Each cluster has specific color + icon in design system | No semantic differentiation |

The cluster names are completely different - not aliases, actual different concepts. The briefing's "reminders" cluster replaces Echo's "trigger", and "origin" replaces "context", etc. But "passion" and "circle" are brand new concepts.

---

### HIGH - `persons` Schema Differences

Fields the briefing has that Echo is missing:

| Field | Briefing v3 | Echo Today |
|---|---|---|
| `how_we_met` | Core field (goldfield for AI extraction) | Missing |
| `depth` | Enum: inner_5, trusted_15, active_50, network_150, periphery_500 | `depth_override` (freetext) |
| `depth_source` | Enum: auto, manual_override | Not tracked |
| `purpose` | Enum: personal, family, business_active, business_latent, aspirational | `scope` (work/personal/both) - different! |
| `preferred_channel` | Enum: call, whatsapp, email, linkedin, sms | Not a field |
| `archived` | Boolean soft-delete | `deleted_at` timestamptz |
| `industry` | Typed enum (10 values) | Freetext |
| `function` | Enum: founder, exec, operator, ic, investor, advisor, student, other | `job_function` (freetext) |
| `last_contact_at` | Briefing uses this name | `last_interaction_at` in Echo |

Fields Echo has that briefing removes:

| Field | Echo | Briefing decision |
|---|---|---|
| `scope` | work/personal/both | Removed - replaced by `purpose` |
| `is_self` | Patrick's own record | Not in briefing schema |
| `notes` | Freetext notes on person | Not in briefing (interactions handle this) |
| `notes_summary` | AI summary of notes | Not in briefing |
| `cta` | Call-to-action text | Phase 2 only (`ctas` table) |
| `cta_expires_at` | CTA expiry | Phase 2 |
| `priority` | A/B/C | Not in briefing |
| `strength_score` | 0-100 relationship score | Phase 2 (`relationship_strength_score`) |
| `stakeholder_types[]` | Multi-type array | Replaced by `purpose` (single enum) |
| `organization_id` | FK to organizations | Echo-specific (orgs not in briefing) |
| `next_best_action` | AI suggestion | Not in briefing |

---

## 6. Voice

### HIGH - STT: Browser Web Speech API vs Server-Side Whisper

| | Briefing v3 | Echo Today |
|---|---|---|
| Speech-to-Text | OpenAI Whisper (server-side, via API) | Browser Web Speech API (client-side, free) |
| Quality | Better accuracy, works offline for Capacitor | Good for desktop browsers, inconsistent mobile |
| Language control | Full control | Browser/OS determines language |
| Latency target | <300ms (Whisper) | Near-instant (browser native) |

---

### HIGH - Voice Provider Abstraction Missing

| | Briefing v3 | Echo Today |
|---|---|---|
| Provider interface | `VoiceProvider` interface in `lib/voice/types.ts` | Direct ElevenLabs calls, no abstraction |
| Swap without refactor | Yes - add new class implementing VoiceProvider | Would require refactoring all call sites |
| TTS default | OpenAI TTS HD | ElevenLabs (Sarah Eve) |
| STT default | OpenAI Whisper | Browser Web Speech API |

The briefing defines a clean `VoiceProvider` interface so any STT/LLM/TTS can be swapped without touching the app code. Echo calls ElevenLabs directly.

---

### HIGH - Non-Streaming AI Calls

| | Briefing v3 | Echo Today |
|---|---|---|
| Voice response | All layers streamed, audio starts while LLM still generating | Non-streaming, waits for full Claude response |
| Latency target | <1.5s total (STT 300ms + LLM first-token 500ms + TTS 200ms) | No defined target |

---

## 7. Gmail / Calendar Sync

### HIGH - Pull vs Push Sync Architecture

| | Briefing v3 | Echo Today |
|---|---|---|
| Gmail sync | Gmail Watch API + Pub/Sub webhooks (push model) | Polling via Vercel Cron every hour (pull model) |
| Calendar sync | Calendar Watch API (push model) | Polling via Vercel Cron every hour |
| Onboarding backfill | 90-day email backfill with progress UI | Not implemented |
| Backfill UI | Progress bar showing emails processed + contacts found | Not implemented |

Push model means near-instant sync when an email arrives. Pull model means up to 1 hour delay.

---

## 8. Deduplication

### MEDIUM - Different Scoring Algorithm

| | Briefing v3 | Echo Today |
|---|---|---|
| Email match | +60 pts | +30 pts |
| Phone match | +50 pts | +20 pts |
| LinkedIn match | +50 pts | Not checked |
| Name similarity | +30 pts (>0.8 sim) | +40 pts (trigram) |
| Company + role | +20 pts | +10 pts |
| Merge suggestion threshold | >70 | High band (>80 roughly) |
| Soft warning threshold | 50-70 | Medium band (60-80) |
| Merge history | `merge_history` table with 30-day hard_delete_after | No history table |
| Post-merge cleanup | Background job deletes loser after 30 days | Soft-delete only, no cleanup job |

---

## 9. New Features in Briefing - Not Built At All

### HIGH - Life Events Section

Completely new feature. Not in Echo at all.

- **What it is:** Per-person gallery of photos, documents, voice notes, milestones with date and location
- **Storage:** Supabase Storage bucket `life-events` with RLS + thumbnail Edge Function
- **Tables needed:** `life_events`, `person_life_events`
- **UI:** 2-column grid on person detail page + global "Lifeline" sidebar tab chronological view
- **Capacitor integration:** Camera, Filesystem, Microphone plugins for native upload

---

### HIGH - REST API v1 (Versioned, OpenAPI, Scalar Docs)

| | Briefing v3 | Echo Today |
|---|---|---|
| API versioning | `/api/v1/` | `/api/` (no versioning) |
| Auth for external use | JWT (web app) + PAT (external/MCP) | JWT only (no PAT) |
| Audit log | Every POST/PATCH/DELETE logged with IP + token | Not implemented |
| OpenAPI spec | Auto-generated from Zod schemas via `zod-to-openapi` | Not generated |
| Scalar docs | Interactive playground at `/docs/api` | Not available |
| Bearer token auth | Via `createRouteHandler` wrapper | Per-route manual auth check |

---

### HIGH - MCP Server

Completely missing. Not started.

- **What it is:** Model Context Protocol server at `/mcp` - lets Claude Desktop, Cursor, etc. talk to Echo directly
- **Auth:** Personal Access Tokens (`api_tokens` table)
- **Tools:** search_persons, get_person, create_person, add_interaction, get_sunday_pulse, generate_draft, find_intro_path
- **Use case:** Patrick can ask Claude Desktop "who in my network knows a Series A investor in construction tech?" and Claude queries Echo's MCP server

---

### HIGH - Free vs Pro Plan + Quota System

| | Briefing v3 | Echo Today |
|---|---|---|
| Plan tiers | Free (quotas) vs Pro (9 EUR/mo, BYOK, no limits) | Single tier, no subscription logic |
| Quotas | Weekly: 30 voice min, 200 AI drafts, 50 PDL enrichments | None |
| Quota tracking | `quota_usage` table with weekly windows | Not implemented |
| Soft degradation | At 95%: switch to cheaper providers automatically | Not implemented |
| Hard cap | At 100%: upgrade modal with 2 options | Not implemented |
| Quota warnings | Toasts at 70%, 85%, 95% (tracked so not repeated) | Not implemented |
| BYOK storage | `user_api_keys` table, keys encrypted via Supabase Vault, last_four shown | `profiles.byo_api_keys` JSONB, no encryption, no vault |
| Key validation | Test API call on save (OpenAI /models, Anthropic test, etc.) | No validation |

---

### MEDIUM - SEO / AI Discovery

| | Briefing v3 | Echo Today |
|---|---|---|
| `/llms.txt` | Standardized AI crawler file | Not implemented |
| JSON-LD on landing page | SoftwareApplication schema | Not implemented |
| `/robots.txt` | Explicit allow for GPTBot, ClaudeBot, PerplexityBot | Not implemented |
| MDX docs at `/docs` | AI-optimized documentation | Not implemented |

---

## 10. Design System

### HIGH - Design Token Source of Truth

| | Briefing v3 | Echo Today |
|---|---|---|
| Source of truth | `lib/design-tokens.ts` (TypeScript file, exports types + helpers) | `app/globals.css` only (CSS variables) |
| TypeScript access | `import { tokens } from '@/lib/design-tokens'` | Not available |
| `getClusterColors()` helper | Yes | No |
| Tailwind config | Imports tokens, generates utility classes | Hand-configured |

The uploaded zip includes the full `design-tokens.ts`, `globals.css`, and `tailwind.config.ts`. These are ready to drop in.

---

### HIGH - Fonts: Geist vs Plus Jakarta Sans + DM Mono

| | Briefing v3 | Echo Today |
|---|---|---|
| UI font | Plus Jakarta Sans (variable weight, Google Fonts) | Geist (Vercel's font) |
| Mono font | DM Mono | Not specified |
| Dark mode | `data-theme="dark"` on `<html>` (via CSS variables) | Not specified |

The briefing's `globals.css` (in the uploaded zip) defines the complete dark mode token override and font loading. Can be adopted as-is.

---

### MEDIUM - Tag Cluster CSS Classes

| | Briefing v3 | Echo Today |
|---|---|---|
| CSS classes | `.cluster-reminders`, `.cluster-interests`, `.cluster-potential`, `.cluster-origin`, `.cluster-passion`, `.cluster-circle` | Not defined as utility classes |
| Base class | `.cluster-tag` | Not defined |

The uploaded `globals.css` has all 6 cluster classes ready to use. Currently Echo has no such semantic CSS for tags.

---

## 11. Alarm Clock

### HIGH - Native vs Browser

| | Briefing v3 | Echo Today |
|---|---|---|
| Trigger mechanism | Capacitor `LocalNotifications` - fires even when app is closed | Browser WebAudio API - requires tab open |
| Volume behavior | Ramp from 10% to 100% over 90 seconds | Triple-beep, fixed volume |
| Sounds | 6 royalty-free named sounds in `/public/sounds/` | Not specified |
| Snooze options | 5/9/15 minutes, stored in user preferences | Exists but no configurable options |
| Days | Configurable per weekday (mon/tue/etc.) | Not configurable |

---

## 12. End-of-Day Review

### MEDIUM - Different UX Approach

| | Briefing v3 | Echo Today |
|---|---|---|
| Trigger | Push notification at 18:00 | No push (tab must be open) |
| UI | Dedicated Review Screen listing today's contacts with quick-note-input | `/debrief` voice-guided multi-phase flow |
| Input style | 1-line text input per contact, 140 char max | Voice-first conversation |
| Storage | As separate `interaction` rows | Saved as `debriefs` row |

Both accomplish end-of-day reflection but very different UX. Briefing's approach is simpler and more structured; Echo's is voice-first and more conversational.

---

## 13. Onboarding

### MEDIUM - Not Built vs 4-Screen Wizard

| | Briefing v3 | Echo Today |
|---|---|---|
| Wizard | 4 screens: Depth layers, AI enrichment demo, Sunday pulse preview, API keys (optional) | No structured onboarding wizard |
| Email backfill | Starts automatically after onboarding with progress UI | No backfill |
| API key setup | Screen 4 of onboarding (optional, can skip) | Manual, in settings after login |

---

## 14. Person Detail Page Section Order

### MEDIUM - Different Structure

| Briefing v3 Order | Echo Today |
|---|---|
| 1. Header + Action-Bar | Header |
| 2. Reminders | CTA |
| 3. Passions | Suggestions (AI) |
| 4. Interests | Context (stakeholder info) |
| 5. Potential (Give/Get/Both) | Relationships |
| 6. Origin | Timeline (interactions) |
| 7. Circles | Notes |
| 8. Geographies | |
| 9. Relationships | |
| 10. Contact Details | |
| 11. Wie kennengelernt | |
| 12. Life Events (NEW) | |
| 13. Interactions History | |

---

## 15. Features Echo Has That Briefing Excludes

These exist in the current Echo codebase but are not in the briefing. Your call whether to keep, hide, or remove them.

| Feature | Echo Status | Briefing stance |
|---------|-------------|-----------------|
| **Organizations** (first-class entity with CRUD, dedup, enrichment) | Fully built | Not in briefing schema at all |
| **Pipelines + Deals** (sales Kanban) | Fully built | Explicitly excluded ("HubSpot's job") |
| **Visual Workflow Editor** (@xyflow/react) | Built but no executor | Not in briefing |
| **Debriefs table** + streak tracking | Fully built | Not in briefing |
| **Gamification** (XP, levels, 16 achievements) | Fully built | Not in briefing |
| **Notes** as separate entity | Fully built | Not in briefing (interactions cover this) |
| **Todos** as separate entity | Fully built | Not in briefing |
| **Multi-model catalog** (14 models, 7 providers) | Built, only Anthropic active | Briefing: BYOK per voice layer, no model catalog page |
| **Scope field** (work/personal/both) | On `people` | Removed in briefing (replaced by `purpose`) |
| **Admin dashboard** | Built | Not in briefing |
| **`connections` table** | Dead table | Not in briefing |

---

## Summary: What the Briefing Zip Actually Gives You

The zip contains 5 files that are immediately usable:

| File | What it is | Can adopt as-is? |
|------|-----------|-----------------|
| `ECHO_FINAL_UI_BRIEFING.md` | Full product spec v3 (authoritative) | Yes - read-only reference |
| `CLAUDE.md` | New Claude Code rules for Kindra | Partially - has stricter rules than current Echo CLAUDE.md |
| `lib/design-tokens.ts` | TypeScript design token file | **Yes - drop in immediately** |
| `app/globals.css` | Full CSS variable system + cluster classes + fonts | **Yes - replace current globals.css** |
| `tailwind.config.ts` | Tailwind config importing tokens | **Yes - replace current tailwind.config.ts** |

The three design files (`design-tokens.ts`, `globals.css`, `tailwind.config.ts`) are the lowest-risk, highest-value things to adopt immediately. They change the font to Plus Jakarta Sans + DM Mono, add the 6 cluster CSS classes, add proper dark mode, and set up the full Kindra design system.

---

## Recommended Adoption Order

**Immediate (low risk, high value):**
1. Drop in `lib/design-tokens.ts` from the zip
2. Replace `app/globals.css` with the zip version (adds fonts + cluster classes + dark mode)
3. Replace `tailwind.config.ts` with the zip version
4. Add `lib/config.ts` with `APP_CONFIG` constant

**Sprint-level (medium effort):**
5. Add `life_events` + `person_life_events` tables (new feature, no migration conflict)
6. Add `api_tokens` table + PAT generation UI
7. Add `user_api_keys` table (Supabase Vault) replacing `profiles.byo_api_keys` JSONB
8. Add `quota_usage` table + Free/Pro plan logic
9. Add versioned API prefix `/api/v1/` via route rewrites
10. Build MCP server at `/mcp`

**Large migrations (plan carefully):**
11. `person_contacts` table split from JSONB (data migration needed)
12. `tags` + `person_tags` junction (data migration from `text[]`)
13. `person` table name + `archived` boolean (data migration)
14. `purpose` enum replacing `scope` (data migration)
15. SSO authentication (Google, Apple, Microsoft)
16. Capacitor integration (only if native app is wanted)

**Defer or skip:**
- Pipelines/deals removal (currently hidden per earlier decision)
- Workflow editor removal (keep for now per earlier decision)
- Upstash Redis (SQL rate limiting works, not urgent)
