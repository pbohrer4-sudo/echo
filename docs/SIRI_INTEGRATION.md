# Siri / Voice Capture Integration

Let Siri push voice input straight into Echo — "Hey Siri, Notiz an Echo,
Max Mustermann von Acme, kennengelernt auf der Konferenz, ruf ihn nächste
Woche an."

This document covers the backend (already in this repo) and the iOS app
that calls it. There are two client paths; pick one:

- **App Intents (native)** — deepest "Hey Siri" integration, requires a
  small iOS app built in Xcode. Source scaffolding is in `ios/EchoSiri/`.
- **Apple Shortcut (no app)** — buildable on your iPhone in minutes, no
  Apple Developer account. Great for testing the backend today.

Both hit the same endpoint, so the backend work is shared.

---

## Architecture

```
Siri (speech-to-text on device)
        │  transcript text
        ▼
POST /api/siri/capture        Authorization: Bearer echo_…
        │
        ├─ resolveUserIdFromToken()      lib/api-token.ts   (hash lookup, no cookie)
        ├─ runExtraction()               lib/extract-run.ts (Claude + EXTRACTION_TOOLS)
        └─ commitToolCalls()             lib/extract-commit.ts (writes people/notes/…)
```

The endpoint reuses the exact same extraction + commit core as the in-app
voice orb (`/api/extract` and `/api/extract/commit`). The only difference
is authentication: the browser uses a Supabase session cookie; Siri uses a
personal API token.

### Why a token (and not the login cookie)

Every other Echo route authenticates via the Supabase session cookie. A
Siri Shortcut / App Intent can't carry that cookie, so we added a
per-user API token table (`api_tokens`, migration `0046`). Tokens are
stored only as a SHA-256 hash; the raw value is shown once at creation.

---

## Step 1 — Run the migration

Apply `supabase/migrations/0046_api_tokens.sql` (Supabase SQL editor, or
your normal migration flow). It creates the `api_tokens` table with RLS
and a rollback block at the bottom.

## Step 2 — Mint a token

```bash
node --env-file=.env.local scripts/create-api-token.mjs pbohrer4@gmail.com "Siri Shortcut"
```

This prints the raw token **once** (format `echo_…`). Copy it now — it
can never be shown again. To revoke later:

```sql
update api_tokens set revoked_at = now() where token_prefix = 'echo_ab…';
```

## Step 3 — Smoke-test the endpoint (curl)

Phase 1 (preview — writes nothing, returns the read-back + tool calls):

```bash
curl -s -X POST https://YOUR-ECHO/api/siri/capture \
  -H "Authorization: Bearer echo_…" \
  -H "Content-Type: application/json" \
  -d '{"transcript":"Max Mustermann von Acme, kennengelernt auf der Konferenz"}' | jq
```

You get back:

```json
{
  "phase": "preview",
  "spoken": "Ich lege Max Mustermann (Acme) an. Soll ich das speichern?",
  "has_writes": true,
  "toolCalls": [ … ],
  "text": "Ich lege Max Mustermann (Acme) an."
}
```

Phase 2 (commit — echo the `toolCalls` from phase 1 back):

```bash
curl -s -X POST https://YOUR-ECHO/api/siri/capture \
  -H "Authorization: Bearer echo_…" \
  -H "Content-Type: application/json" \
  -d '{"confirm":true,"transcript":"…","toolCalls": <PASTE toolCalls FROM PHASE 1> }' | jq
```

```json
{ "phase": "committed", "ok": true, "spoken": "Gespeichert: 1 Kontakt(e).", "commits": { … } }
```

---

## Path A — App Intents (native iOS app)

Files in `ios/EchoSiri/` are ready to drop into an iOS app target:

| File | Purpose |
|------|---------|
| `EchoConfig.swift` | Base URL + token source (Info.plist or Keychain) |
| `EchoAPI.swift` | Two-phase networking against `/api/siri/capture` |
| `AddToEchoIntent.swift` | The App Intent: dictate → read-back → confirm → save |
| `EchoSiriShortcuts.swift` | Registers "Hey Siri" trigger phrases |

Setup in Xcode (on a Mac, requires an Apple Developer account to run on a
device):

1. Create a new iOS App project named **Echo** (the display name is what
   you say after "Hey Siri", e.g. *"Notiz an Echo"*).
2. Add the four Swift files to the app target.
3. In the target's Info, add a String key `ECHO_API_TOKEN` with your raw
   token, and set `baseURL` in `EchoConfig.swift` to your deployment.
   (For a shared build, move the token to the Keychain instead.)
4. Build & run on your iPhone once so the App Shortcut registers.
5. Say *"Hey Siri, Notiz an Echo"* and dictate.

The intent calls phase 1, speaks the read-back, uses
`requestConfirmation` (so nothing is saved without your "Ja" — honouring
the "never auto-apply AI output" rule), then calls phase 2.

## Path B — Apple Shortcut (no app, test today)

On your iPhone, Shortcuts app → new Shortcut:

1. **Dictate Text** → language Deutsch.
2. **Get Contents of URL**
   - URL: `https://YOUR-ECHO/api/siri/capture`
   - Method: `POST`
   - Headers: `Authorization` = `Bearer echo_…`, `Content-Type` = `application/json`
   - Request Body: JSON → `transcript` = (Dictated Text)
3. **Get Dictionary Value** `spoken` from the response → **Speak Text**.
4. **Get Dictionary Value** `has_writes`. **If** it is `1`:
   - Build a second **Get Contents of URL** to the same endpoint with body
     JSON `{ confirm: true, transcript: …, toolCalls: <Dictionary Value
     "toolCalls" from step 2> }`.
   - Optionally gate it behind an **Ask for Confirmation** / "Ja?" so you
     keep the human-in-the-loop step.
   - **Speak** the `spoken` from the commit response.
5. Name the Shortcut **"Notiz an Echo"** — that becomes the Siri phrase.

For a faster (single-tap) version you can skip the confirmation and post
with `confirm: true` immediately, but then you lose the read-back safety
step — not recommended.

---

## Endpoint reference — `POST /api/siri/capture`

Auth: `Authorization: Bearer echo_…` (a non-revoked `api_tokens` row).

| Phase | Request body | Behaviour |
|-------|--------------|-----------|
| preview | `{ "transcript": "…" }` | Extracts, writes nothing. Returns `spoken`, `has_writes`, `toolCalls`, `text`. |
| commit | `{ "confirm": true, "transcript": "…", "toolCalls": [...] }` | Persists the tool calls. Returns `spoken`, `commits`, `created_person_ids`. |

Errors return `{ error, spoken }` with a spoken-friendly German message and
an appropriate status (401 unauthorized, 429 rate-limited, 400 bad input,
500 server). Rate limit: 30 captures/minute per user.

Notes:
- Read-only questions ("Wie viele Kontakte in München?") come back in
  phase 1 with `has_writes: false` and the answer already in `spoken` —
  no commit needed.
- Speech-to-text happens on the Apple device; Echo never receives audio,
  only text.
