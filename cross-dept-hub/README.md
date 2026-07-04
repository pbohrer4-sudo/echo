# Cross-Dept Hub

A standalone web app for **cross-department project management with optional AI**.
Departments raise requests to one another, track them on a board, group work into
projects, and keep a shared knowledge base. AI is fully optional and can be
switched on or off per workspace, per project, and per task.

This is a self-contained application. It has **no dependency on any other
project** — its own app shell, auth, database schema, and configuration.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Supabase (Postgres + Auth + RLS)
- Anthropic Claude (optional — briefing + document filing)

## Features

Work management (Wrike-style):

- **Hierarchy** — workspace → department (space) → folder / project → task →
  subtask. Folders nest one level; subtasks show progress on the parent.
- **Custom item types** — define types like Bug, Kampagne or Asset with their
  own field schemas (text / number / date / select); values are edited on the
  task detail page.
- **Multiple views** — the same tasks as Board (Kanban), Liste (grouped by
  folder, inline status), Gantt (day-grid timeline with overdue colouring) and
  Kalender (month view by due date).
- **Cross-tagging** — one task visible in several departments simultaneously;
  a status change is instantly visible everywhere. No duplication.
- **Automations** — rule-based status triggers (assign, system comment,
  notify department) that run server-side on every status change.
- **Blueprints** — save any task (incl. subtasks) as a reusable template and
  instantiate it from the task-create form.
- **Dynamic request forms** — structured intake with custom fields; a
  submission routes a pre-filled task to the target department, computes the
  deadline and can apply a blueprint.
- **Resource management** — Auslastung tab with color-coded workload per
  person vs. sprint capacity, plus per-task timesheets (logged vs. estimated).
- **Approvals** — request sign-off from a named person; decisions carry a
  timestamped audit trail; a pending-approvals inbox lives on the dashboard.
- **Dashboard & reports** — workspace-wide status widgets, overdue list,
  workload summary, project risk flags (deterministic pacing heuristic,
  labeled as such) and CSV export.

Collaboration & AI:

- **Departments** with a charter, colour, and AI context.
- **Cross-department requests** — one department asks another; lands in the
  receiving department's inbox.
- **AI briefing** (optional) — drafts a summary + suggested reply for an
  incoming request; never auto-applied, always confirmed by a human.
- **Knowledge base** + **AI filing** (optional) — suggests a SharePoint folder
  and a clean file name for new documents.
- **Notifications** — in-app, browser, and (optional) email.
- **Selectable AI** — a three-state switch (inherit / on / off) at workspace,
  project, and task level. Effective state resolves item → project → workspace,
  so a single task or whole project can stay fully manual.
- **Feedback** tab for collecting improvement notes during a trial.

## Setup

### 1. Supabase

Create a Supabase project (EU region recommended for GDPR). Then apply the
migrations in `supabase/migrations/` in order:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

`0001_init.sql` sets up the platform prerequisites; `0002`–`0007` create the hub
schema.

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in the three Supabase values and (optionally) `ANTHROPIC_API_KEY`. See
`.env.example` for the full list and what's optional.

### 3. Run

```bash
npm install
npm run dev
```

Open http://localhost:3000, register an account, and you're in. Email/password
login works out of the box; Microsoft SSO is optional (configure the Azure
provider in Supabase Auth to enable it).

## Deploy (Vercel)

1. Push this directory to its own GitHub repo.
2. Import it in Vercel.
3. Set the environment variables from `.env.example`.
4. Set `NEXT_PUBLIC_APP_URL` to the deployment URL and add
   `<url>/callback` to Supabase Auth → URL Configuration → Redirect URLs.

## AI is optional

Without `ANTHROPIC_API_KEY` the app runs fully — only the AI briefing and filing
suggestions are unavailable. With AI configured, the workspace/project/task
switches decide where it actually runs.

## Branding

User-facing name comes from `NEXT_PUBLIC_APP_NAME` (default `Cross-Dept`).
