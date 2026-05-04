# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

ECHO — a personal relationship-intelligence layer / personal CRM for Patrick (Head of Growth & Sales at Valoon, native German speaker). Voice-first capture (Web Speech API → Claude tool-use → Supabase), extended over time into a full CRM with people + organizations + sales pipelines + workflow designer. UI is German throughout.

The original 5-week brief lives at `~/Documents/Personal CRM/echo_kickoff_brief.md`. Implementation has gone substantially beyond that scope — see "Architecture" below for what's actually in the codebase.

## Commands

```bash
npm run dev          # next dev --webpack (NOT Turbopack — see Gotchas)
npm run build        # next build (Turbopack OK here)
npm run lint         # eslint
node --env-file=.env.local scripts/inspect-schema.mjs   # dump live Supabase schema via PostgREST
```

There's no test suite. Verification is `npm run build` (TypeScript + route compile) plus manual smoke testing in the browser.

## Database migrations

SQL files in `supabase/migrations/` are **not auto-applied**. Patrick runs them manually in the Supabase SQL Editor. All migrations are idempotent (`if not exists`, `on conflict do nothing`, `drop policy if exists`). When adding schema changes:

- Number sequentially (`0008_*.sql`).
- Always include matching RLS policies — every user-scoped table has `user_id = auth.uid()` SELECT/INSERT/UPDATE/DELETE.
- Soft-delete via `deleted_at timestamptz` is the project convention; queries filter `is("deleted_at", null)`.
- After writing, paste the SQL into the response so Patrick can copy-execute. Don't assume he'll find the file.

## Architecture

The product is a single Next.js 16 App Router app on Supabase, with five conceptual surfaces:

**1. Voice loop (`/`)** — `components/voice-orb.tsx` runs Web Speech API in `de-DE`, posts the transcript to `/api/extract`, which calls Claude Sonnet 4.6 with a tool-use schema (`lib/tools.ts`). The user sees an `ExtractionConfirmation` card and clicks Bestätigen, which posts to `/api/extract/commit` for the actual DB writes. Tools include `create_person`, `update_person`, `log_interaction`, `create_note`, `create_reminder`, `create_todo`, plus `suggest_replies` for clickable quick-reply chips. The commit endpoint does a two-pass write: `create_person` first to build a name → uuid map, then dependent tools resolve `person_name` references against that map.

**2. Debrief flow (`/debrief`)** — `components/debrief-flow.tsx` is a multi-turn state machine (greeting → ready-decide → prompt → listening → extracting → summary → confirming → next-decide → finalize). 5-minute hard timeout. Reuses the same extract/commit endpoints.

**3. CRM (`/people`, `/organizations`, `/pipelines`)** — extensive multi-value JSONB fields on `people` (phones, emails, addresses, socials, important_dates, relationships) plus a foreign-key linked `organizations` table. `lib/organizations.ts` has `resolveOrCreateOrganization` which the person form calls on save to auto-link or auto-create the matching org row. The self-person is `people.is_self = true` (one per user, partial unique index); shown via `/profile` route which redirects to its detail page. Pipelines store stages and field_definitions as JSONB for runtime configurability without migrations.

**4. Workflow designer (`/integrations/workflows`)** — `components/workflow-editor.tsx` wraps `@xyflow/react`. The catalog (`lib/workflow-catalog.ts`) holds typed node templates with a `live: boolean` flag (green stripe = ECHO-native, red stripe = needs V2 runtime). `/api/workflows/generate` powers the "Vibe-Integrate" text-to-workflow input — Claude is given the full catalog as system prompt context and forced to call a `compose_workflow` tool that returns `{ nodes: [{ subtype, label, config }], edges: [{ from_index, to_index }] }`; the server validates subtypes, generates IDs, and BFS-layouts nodes by depth. **Runtime is not implemented** — workflows save and visualize, the generate endpoint composes graphs, and the editor's Test-mit-Sample runs a mock walk, but no triggers fire and no actions execute. Adding the runtime is the V2 milestone.

**5. AI auxiliaries** — `/api/scan-business-card` (Claude Vision → BusinessCardData), `/api/enrich-organization` (Claude knowledge → industry/website/HQ), `/api/sunday-pulse` (weekly digest), `/api/recap` (monthly/yearly retrospective). All flow through `lib/user-context.getUserContext()` which resolves the per-user BYO API key (Anthropic + ElevenLabs from the profile) — falls back to env defaults when null.

## Key conventions

- **Multi-tenancy contract**: every user-scoped query relies on RLS. Never pass `user_id` from the client. Server actions read `user_id` from `auth.uid()` via the Supabase server client (`lib/supabase/server.ts`). When inserting, set `user_id: user.id` server-side.
- **TTS-safe assistant text**: Claude system prompts forbid markdown (no `**`, no `*`, no bullet lists). `lib/text.stripMarkdown` strips it client-side as defense-in-depth before display + TTS.
- **One question per turn**: the voice-extraction system prompt enforces this. Use the `suggest_replies` tool when posing a closed question — the client renders chips, click = next user input.
- **Live vs V2 nodes**: workflow nodes carry `live: true` only when ECHO-native data + logic is enough (i.e. they'd run as soon as a runtime exists). Anything needing OAuth, webhook receiver, mail provider, Vercel Cron, etc. is `live: false` (red stripe).
- **Design tokens**: light-mode "Ledger × Geist" — `--paper`, `--paper-2`, `--paper-3`, `--ink-1` through `--ink-5`, `--rule`, `--rule-soft`, `--action`, `--action-soft`, `--signal`, `--signal-soft`, `--good`, `--bad`. CSS classes like `.t-label`, `.tag`, `.kv`, `.timeline`, `.section-head`, `.meter-bars` live in `app/globals.css` because they recur dense enough that copying them as utilities was worse.
- **Middleware**: Next 16 renamed to `proxy.ts` (we use that). The matcher excludes static assets; the handler delegates to `lib/supabase/middleware.updateSession` which refreshes the session cookie and redirects unauth'd users away from non-public paths.

## Gotchas

- **Webpack, not Turbopack** in dev. `package.json` has `"dev": "next dev --webpack"` because Turbopack 16.2.4 hits `ENOENT routes-manifest.json` and a `pages/_app/build-manifest.json` lookup against our App-Router-only project. Build (`next build`) is fine on Turbopack. After switching between dev and build, `rm -rf .next` to avoid mixed manifests.
- **German "smart quotes" inside double-quoted JS strings break the parser**. `„Auto-Enrich"` inside `"..."` looks fine but the Unicode quotes confuse Turbopack's Rust parser. Avoid them in string literals — write the descriptive text without inner quotes, or use a template literal.
- **Multiple lockfiles warning**: there's a stray `~/package-lock.json` (87 bytes, not ours). `next.config.ts` pins `outputFileTracingRoot` to `__dirname` to silence Next's "wrong workspace root" inference.
- **Migrations are manual + numbered**: when adding one, paste the full SQL into the response. Don't link to the file path alone — Patrick runs it via copy-paste into the SQL Editor.
- **Secrets never in chat**: API keys, service-role keys, DB passwords. Patrick adds them directly to `.env.local` or Settings → BYO. If you need a value, instruct him to set it and say "done"; read it from the file or via `node --env-file=.env.local …`. Don't ask him to paste secrets in the conversation — the transit through Anthropic's API and the conversation history are unnecessary risk.
- **Patrick's git config has hostname-based email** (`paddy550@MacBook-…fritz.box`). Don't run `git config --global …` to fix it without explicit permission — every commit prints a hint, ignore it.
