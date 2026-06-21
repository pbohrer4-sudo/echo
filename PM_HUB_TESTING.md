# Abteilungs-Hub - Test-Umgebung (Trial)

A short guide to stand up the department hub as a mock environment you can use
yourself for a few days and collect feedback on what to improve.

## 1. What you get

- A self-contained workspace seeded with a realistic mini-company
  (Marketing, Sales, Produkt), two projects inside Marketing (one with AI on,
  one with **AI switched off**), several tasks across the board, two
  cross-department requests, and a small knowledge base.
- All three AI behaviours are optional and switchable per workspace, project
  and task, so you can compare "AI on" vs "leave it as I wrote it".
- A built-in **Feedback** tab to jot notes while you test.

## 2. Stand it up (~15 min)

The hub runs inside the existing Echo app. It needs a Supabase project and the
app running (locally or as a Vercel preview). I can't host it for you, but
this is the whole setup:

1. **Supabase** - create a project (EU region for DSGVO). Copy the project URL
   and the anon + service-role keys.
2. **Migrations** - apply everything in `supabase/migrations/` (includes the
   hub tables `0047`-`0052`):
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
3. **Env** - copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY` (only needed if you want to try the AI parts)
   - everything else is optional for the trial (SharePoint/email degrade
     gracefully, see below).
4. **Run**:
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000, register/login (email + password is enough -
   Microsoft SSO is optional), then go to **Abteilungs-Hub** in the sidebar
   (or `/teams`).
5. **Load the mock data** - on the `/teams` page click
   **"Beispieldaten laden"**. Done.

> Prefer a hosted trial? Deploy the repo to Vercel, point it at the same
> Supabase project, set the env vars, and share the preview URL with yourself
> on mobile/desktop. The app is fully browser-based.

## 3. What works without extra config

| Feature | Without config | With config |
|---|---|---|
| Tasks, projects, inbox, board | ✅ full | ✅ |
| AI briefing / filing suggestions | needs `ANTHROPIC_API_KEY` | ✅ |
| In-app + browser notifications | ✅ (allow browser notifications when asked) | ✅ |
| Email notifications | logged as "skipped" | set `RESEND_API_KEY` or Microsoft SSO |
| SharePoint filing (real upload) | suggests folder/name from a seeded tree | Microsoft SSO grants the Graph token |
| Microsoft SSO login | optional - email/password works | configure Azure provider (see PM_HUB_ARCHITECTURE.md §5) |

## 4. A suggested test script

Spread over a few days, in your own department:

1. **Browse the seed.** Open Marketing → walk the tabs: Board, Projekte,
   Posteingang, Ausgehend, Wissen.
2. **Cross-department request.** From "Neue Anfrage", send a real request you'd
   normally send to another team. If AI is on, check the auto-briefing and the
   suggested reply in the receiving department's Posteingang; accept or reject.
3. **Try AI on vs off.** Open the "Website Relaunch (KI aus)" project - notice
   tasks there get no AI. Flip a task's KI-Modus to "An"/"Aus" on the task
   detail page and see the difference. Toggle the whole workspace in
   **Einstellungen**.
4. **Knowledge + filing.** Add a real document/transcript in Wissen. If AI is
   on, confirm or correct the suggested SharePoint folder + file name.
5. **Notifications.** Allow browser notifications when prompted; create a
   request and watch the bell badge + notification centre update.
6. **Leave feedback as you go** (next section).

## 5. Giving feedback

Use the **Feedback** tab in the hub (top nav) any time. Pick an area and a
type (Gefällt mir / Verbesserung / Fehler / Idee) and write a note. Everything
is stored per workspace and listed on the same page, so we can triage it
together afterwards. No screenshots needed - a one-line note per observation
is perfect.

## 6. Resetting

To start from a clean slate, delete the seeded rows (or the workspace) in
Supabase and click "Beispieldaten laden" again. The seed is skipped if the
workspace already has departments, so remove them first.
