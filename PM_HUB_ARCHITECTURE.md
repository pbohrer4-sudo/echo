# Abteilungs-Hub - Cross-Department Project Management

A multi-department work hub layered onto the existing Echo stack (Next.js 16
App Router + Supabase + Anthropic Claude). It gives each department a
centralised hub for tasks, knowledge and call transcripts, plus a
cross-department **inbox** where one team can hand work to another. An AI
agent drafts a briefing and a first response for every incoming request, and
a second AI agent files new documents into the company's SharePoint
structure with a suggested folder and name.

This document describes what is implemented, how it is secured, and how the
Microsoft SSO + DSGVO requirements are met (and what remains to wire up
against a live tenant).

---

## 1. Scope

**Implemented in this branch**

- Workspace (the company) with members; per-user auto-bootstrap.
- Departments ("departmental hubs") with a charter, colour, sprint
  capacity and an AI-context field.
- Department board: internal tasks across `backlog → done`, inline status
  changes, effort estimates, priorities.
- Cross-department requests (the **inbox**): one department asks another for
  work, with an effort estimate, priority and due date.
- Incoming view (work others asked us to do) and Outgoing view (work others
  owe us, with status/effort/dependency tracking).
- Task detail: dependencies, smart reminders, comments/activity log,
  editable estimate/sprint/priority/due.
- **AI briefing agent** - reads the department's knowledge and drafts a
  structured briefing + a ready-to-send reply for each inbox request.
- **AI filing agent** - reads a new document and suggests the right
  SharePoint folder and a clean file name; the user confirms before filing.
- One-click demo seed (Marketing / Sales / Produkt + a sample request).
- **Notifications** across three channels (in-app centre + bell badge,
  foreground browser notifications, best-effort email) for new requests,
  AI briefings, acceptances, status changes and comments.

**Deliberately on the roadmap (documented, not built)**

- Live Microsoft Entra SSO wiring (Supabase Azure provider) - see §5.
- Live Microsoft Graph sync/upload - the code paths exist and run when a
  token + drive id are configured; without them the app uses the cached
  folder tree and skips the physical upload.
- Drag-and-drop board, automatic mode/cadence transitions, autonomous task
  completion with human approval (the suggestion infrastructure is in place).

---

## 2. Module layout

```
supabase/migrations/
  0047_project_management.sql        # core tables, RLS, helper fn
  0047_project_management_down.sql   # rollback
  0048_sharepoint_filing.sql         # filing columns + folder cache
  0048_sharepoint_filing_down.sql    # rollback

lib/pm/
  types.ts          # shared TS types + UI label maps
  workspace.ts      # get-or-create workspace + members
  departments.ts    # department CRUD reads + slugify
  tasks.ts          # board / incoming / outgoing / detail reads
  documents.ts      # knowledge reads + AI-knowledge builder
  briefing.ts       # AI briefing agent + orchestrator
  filing.ts         # AI SharePoint-filing agent + orchestrator
  sharepoint.ts     # Microsoft Graph integration + folder cache
  notifications.ts  # fan-out dispatcher + recipient resolution + reads
  email.ts          # best-effort email (Resend / Graph / log)

app/(pm)/                              # isolated route group, auth-only
  layout.tsx
  teams/page.tsx                       # department overview + create + seed
  teams/actions.ts                     # all server actions
  teams/_components/status-select.tsx  # inline status changer (client)
  teams/new-request/page.tsx           # cross-department request form
  teams/[slug]/page.tsx                # department hub (tabs)
  teams/[slug]/tasks/[taskId]/page.tsx # task detail

app/api/pm/briefing/route.ts           # POST: run briefing (for automation)
app/api/pm/notifications/unread/route.ts # GET: unread feed for browser poller
app/(pm)/teams/notifications/page.tsx    # notification centre
app/(pm)/teams/_components/notification-poller.tsx # browser-notification poller
```

The module is **additive and isolated**: it touches no Personal-CRM table
and lives behind its own route group with an auth-only gate (it is not
behind the CRM onboarding gate). The only change to existing code is one
navigation link in `app/(app)/layout.tsx` and one new rate-limit bucket.

---

## 3. Data model

All tables are prefixed `pm_`. UUID PKs, `timestamptz`, snake_case,
`created_at`/`updated_at` via the existing `update_updated_at_column()`
trigger, soft-delete via `deleted_at` where relevant - matching the project
DB conventions.

| Table | Purpose |
|---|---|
| `pm_workspaces` | The company / tenant. |
| `pm_workspace_members` | Who belongs to a workspace (+ role). |
| `pm_departments` | Departmental hub; charter, colour, AI context, SharePoint binding. |
| `pm_department_members` | Department membership (for assignment/leads). |
| `pm_tasks` | Internal tasks **and** cross-department requests (`source`). |
| `pm_task_dependencies` | Blocker edges between tasks. |
| `pm_task_briefings` | AI briefing suggestions (pending/accepted/rejected). |
| `pm_documents` | Knowledge base entries + filing state. |
| `pm_sharepoint_folders` | Cached SharePoint folder tree (AI files against this). |
| `pm_task_comments` | Activity log + human/AI comments. |
| `pm_task_reminders` | Smart reminders per task. |

The **inbox** is modelled on `pm_tasks`: a row with `source = 'cross_dept'`
has an `owner_department_id` (who does the work) and a
`requester_department_id` (who asked). A DB `CHECK` enforces that a
cross-department request always names a different requesting department.

- A department's **incoming** inbox = tasks it owns with `source = cross_dept`.
- A department's **outgoing** list = tasks where it is the requester.

---

## 4. Security model (fail-safe by default)

- **Row-Level Security on every table.** Access is gated at the workspace
  level: a user only sees rows in workspaces they belong to. Membership is
  resolved through the `SECURITY DEFINER` helper `pm_is_workspace_member()`,
  which avoids RLS recursion on the membership table.
- **No service-role in the request path.** Every read and write in the
  module goes through the user's Supabase session, so RLS is always in
  force. The service-role key is reserved for webhooks (none added here).
- **Input validation** in server actions before any write; AI output is
  never trusted as a folder path - the model must pick from the existing
  cached folder list, and the user confirms.
- **Rate limiting** on AI calls via the existing per-user token bucket
  (`ai_pm_briefing`, 10/min); the briefing/filing agents degrade gracefully
  (the request/document is saved even if the AI step fails).
- **Human-in-the-loop for all AI output.** Briefings and filing proposals
  are stored as *suggestions* (`pending` / `suggested`) and only take effect
  when a human accepts - matching the project's "never auto-apply AI" rule.
- **AI is selectable.** Workspace settings (`/teams/settings`, columns on
  `pm_workspaces`) gate the automatic behaviour:
  - `ai_enabled` — master switch. Off → no AI runs anywhere and every AI
    affordance (briefing section, suggestion UI, generate buttons) is hidden;
    the hub is fully manual.
  - `ai_auto_briefing` — auto-generate a briefing when a request lands. Off →
    the request stays exactly as written; a briefing can still be triggered
    by hand.
  - `ai_auto_filing` — auto-suggest a SharePoint folder + name on document
    add. Off → the document is saved as entered.
  The automatic paths check these flags server-side (not just in the UI), so
  disabling a feature actually stops the AI call.

---

## 5. Microsoft SSO (Entra ID) — implemented

Login through Microsoft is wired end to end on top of Supabase Auth's
**Azure (Entra ID) provider** (no parallel auth stack):

- **Button.** `/login` has a "Mit Microsoft anmelden" button posting to the
  `signInWithMicrosoft` server action, which calls
  `supabase.auth.signInWithOAuth({ provider: 'azure', … })` and redirects the
  browser to the Microsoft authorize URL. Scopes requested: `openid email
  profile offline_access` plus Graph `Files.ReadWrite.All`,
  `Sites.ReadWrite.All`, `Mail.Send`.
- **Callback.** The existing `/callback` route exchanges the code; on success
  `persistMicrosoftToken()` saves the returned `provider_token` /
  `provider_refresh_token` into `service_connections` (provider `microsoft`)
  — best-effort, so login never fails on the storage step.
- **Graph token.** `lib/pm/sharepoint.ts → getGraphToken()` reads that stored
  token for the current user (RLS-scoped, expiry-checked) and falls back to
  `MS_GRAPH_TOKEN`. So once a user signs in with Microsoft, SharePoint
  folder sync and document upload work without any extra config.

**One-time setup required** (infrastructure, not code):

1. Register an app in Microsoft Entra ID (single- or multi-tenant), add the
   Supabase callback `https://<project>.supabase.co/auth/v1/callback` as a
   redirect URI, create a client secret, and grant the Graph delegated
   permissions above (admin consent for the `.All` scopes).
2. In Supabase → Authentication → Providers → Azure, set the client id,
   secret and (for org-only login) the tenant id; restrict sign-ups to the
   company tenant/domain.

Until that provider config exists, the button returns a graceful
"Microsoft-Login nicht verfügbar" error rather than breaking the page.

---

## 6. SharePoint filing flow

The department knowledge base mirrors the company's SharePoint structure.

1. A user adds a document (title, type, source, content) to a department.
2. On save, `suggestFilingForDocument()` loads the department's cached folder
   tree (`pm_sharepoint_folders`) and asks Claude (tool-use, structured
   output) for the best **existing** folder plus a clean, context-derived
   **file name** and a short reasoning.
3. The suggestion is stored on the document (`filing_status = 'suggested'`)
   and shown in the Knowledge tab with an editable folder dropdown + name.
4. The user confirms (or edits). `confirmDocumentFiling()` marks the document
   filed and, when a live Graph token + drive id are configured, uploads it
   via `PUT /drives/{id}/root:/{folder}/{name}:/content`, storing the
   resulting item id + web URL. Without a live connection the confirmed
   destination is recorded for a later reconcile.

The folder tree is populated either by `syncFolders()` (live Graph,
breadth-first to a capped depth) or by `seedDemoFolders()` (used on
department creation and by the demo seed) so the UX works before the tenant
is connected.

---

## 6a. Notifications & status updates

The hub is a browser-based web app (Next.js App Router); every surface is a
normal authenticated web page. On top of that, notable events fan out to
three channels via `lib/pm/notifications.ts → notify()`:

| Event | In-app | Browser | Email |
|---|---|---|---|
| New cross-department request | ✓ | ✓ | ✓ |
| Status change on a request | ✓ | ✓ | ✓ |
| Request accepted (with reply) | ✓ | ✓ | ✓ |
| AI briefing ready | ✓ | ✓ | — |
| New comment | ✓ | ✓ | — |

- **In-app:** one `pm_notifications` row per recipient; the layout shows an
  unread bell badge and `/teams/notifications` is the notification centre
  (mark one / mark all read). RLS restricts each row to its recipient.
- **Browser:** `HubNotificationPoller` (a client component, mirroring the
  CRM's manager) polls `/api/pm/notifications/unread` every 30s and fires
  the Web Notifications API for new items; clicking a notification deep-links
  to the task. Works while a tab is open. Production **Web Push** (service
  worker + VAPID + the `web-push` package) is the documented next step for
  delivery when no tab is open — email already covers that gap today.
- **Email:** `lib/pm/email.ts` sends best-effort via Resend
  (`RESEND_API_KEY`) or Microsoft Graph `sendMail` (`MS_GRAPH_TOKEN`),
  falling back to a logged "skipped" when neither is configured. Recipient
  addresses are denormalised onto `pm_workspace_members.email`. The per-row
  `email_status` (`sent`/`skipped`/`failed`) is shown in the centre.

Recipients resolve to a department's explicit members, or — when none are
assigned (MVP default) — all workspace members, so a signal always reaches a
human. Delivery is best-effort: a failed email never blocks the action.

## 7. DSGVO / compliance

- **Data residency.** Deploy Supabase in an EU region (project requirement)
  - Postgres, Auth and Storage stay in the EU. Vercel functions should use an
  EU region (e.g. `fra1`; see `vercel.json`).
- **Access control & minimisation.** RLS scopes every record to the
  workspace; no cross-tenant access is possible. Tables store only what the
  feature needs; no contact PII is duplicated here.
- **Right to erasure / portability.** Soft-delete via `deleted_at` plus
  `ON DELETE CASCADE` foreign keys mean a workspace or department deletion
  removes all dependent rows. Export is a per-workspace query.
- **Audit trail.** System comments (`pm_task_comments.is_system`) record AI
  actions ("KI-Briefing erstellt", filing confirmations) for traceability.
- **AI transparency.** Every AI output carries a `reasoning`/`filing_reasoning`
  field and the `model` used, and is surfaced to the user before it takes
  effect - supporting the DSGVO Art. 22 "human in the loop" expectation.
- **Sub-processors.** Anthropic (AI) and Microsoft (SSO + SharePoint) are the
  processors; both need to be listed in the records of processing and covered
  by a DPA. No document content is logged in plaintext.
- **Secrets** live in environment variables only (`ANTHROPIC_API_KEY`,
  `MS_GRAPH_TOKEN`, Supabase keys); none are hard-coded.

---

## 8. Running the migrations

```bash
# local
supabase db reset            # applies 0047 + 0048 with the rest

# or apply forward only
supabase migration up
```

Rollback (manual, forward-only history):

```bash
psql "$DATABASE_URL" -f supabase/migrations/0048_sharepoint_filing_down.sql
psql "$DATABASE_URL" -f supabase/migrations/0047_project_management_down.sql
```

---

## 9. Try it

1. Sign in, open **Abteilungs-Hub** in the sidebar (or go to `/teams`).
2. Click **Beispieldaten laden** to seed Marketing / Sales / Produkt and a
   sample cross-department request (Sales → Marketing video) with an
   auto-generated AI briefing.
3. Open Marketing → **Posteingang** → the request → review/accept the AI
   briefing and reply.
4. Open Marketing → **Wissen**, add a document, and confirm the AI's
   SharePoint folder + file-name suggestion.
