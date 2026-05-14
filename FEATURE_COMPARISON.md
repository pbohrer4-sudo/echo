# Echo vs Briefing v3 - Feature Comparison

> Field-by-field, tab-by-tab, section-by-section comparison.
> Left column = what Echo has today. Right column = what Briefing v3 specifies.
> Symbol key: ✅ matches | ⚠️ partial/wrong | ❌ missing | ➕ Echo-only (not in briefing)

---

## 1. Sidebar Navigation

| # | Echo Today | Briefing v3 |
|---|---|---|
| 1 | Voice (`/`) | Voice console ✅ |
| 2 | Wecker (`/debrief`) | Alarm Clock ⚠️ different UX (see Section 9) |
| 3 | Personen (`/people`) | Personen ✅ |
| 4 | Organisationen (`/organizations`) ➕ | Not in briefing |
| 5 | Pipelines (`/pipelines`) ➕ | Explicitly excluded |
| 6 | Reminders (`/inbox`) with badge | No standalone Inbox tab ⚠️ |
| 7 | Rhythmus (`/rhythmus`) | Replaced by Sunday Pulse + Depth cadence ⚠️ |
| 8 | Sonntags-Puls (`/pulse`) | Sonntags-Puls ✅ |
| 9 | Rückblick (`/recap`) | Recap ✅ |
| 10 | Voice Vibe Integrations (`/integrations`) ➕ | Not in briefing |
| 11 | Verbindungen (`/connections`) | OAuth (at login, not separate hub) ⚠️ |
| 12 | Workflows (`/integrations/workflows`) ➕ | Not in briefing |
| 13 | Modelle (`/models`) | Settings-level, not a page ⚠️ |
| — | ❌ Missing | **Lifeline** (global Life Events timeline tab) |
| — | ❌ Missing | **Docs** (`/docs`) |

---

## 2. New Person Form - Field by Field

### Echo has 16 sections with 30+ fields shown upfront. Briefing has 4 required fields + Advanced toggle.

| Field / Section | Echo Today | Briefing v3 |
|---|---|---|
| **Business card scan** | ✅ Visitenkarte scannen (Claude Vision OCR) | ✅ Briefing includes |
| **Name** | ✅ Required | ✅ Required |
| **Firma** | ✅ With org autocomplete | ✅ |
| **Rolle** | ✅ | ✅ |
| **`how_we_met`** | ❌ Not a field | ✅ Required field #2 ("Wie kennengelernt?") — the AI gold field |
| **Purpose** | ❌ No `purpose` field | ✅ Required field #3 — enum: `personal / family / business_active / business_latent / aspirational` |
| **Depth** | ⚠️ "Beziehungstiefe Override" with Tier 1–5 labels | ✅ Optional field #4 — enum: `inner_5 / trusted_15 / active_50 / network_150 / periphery_500` |
| **Scope** (work/personal/both) | ✅ Toggle in form | ❌ Removed — replaced by `purpose` |
| **Beziehungsstärke** (1–5 slider) | ✅ | ❌ Phase 2 only (`relationship_strength_score`) |
| **Tags** | ⚠️ Flat text[] multi-add | ❌ In briefing tags come from 4 cluster sections after AI enrichment, not manual entry at add-time |
| **Profilbild URL** | ✅ Manual entry | ⚠️ Auto-filled by PDL, not a manual field |
| **Telefon** (repeatable) | ✅ label + value | ✅ In `person_contacts` table |
| **Email** (repeatable) | ✅ label + value | ✅ In `person_contacts` table |
| **Adresse** (repeatable) | ✅ Street/city/postal/country with OSM autocomplete | ⚠️ Moved to `person_geographies` table with Google Places |
| **Social** (repeatable: platform + handle) | ✅ LinkedIn, Twitter, GitHub, etc. | ✅ In `person_contacts` table |
| **Wichtige Daten** (dates + remind lead) | ✅ Geburtstag, Hochzeitstag, etc. with remind lead | ⚠️ Handled via `reminders` tag cluster, not a separate date repeater |
| **Beziehungen** (repeatable: label + person) | ✅ | ✅ `person_relationships` table (bidirectional) |
| **Stakeholder E1 types** (Investor, Founder, etc.) | ✅ 12 types as toggleable tags | ❌ Removed — replaced by `purpose` enum |
| **Stakeholder E2 sub-types** | ✅ Dynamic per E1 | ❌ Removed entirely |
| **Industrie** (freetext) | ✅ | ⚠️ Briefing wants enum: `tech / fintech / healthtech / construction / consumer / industrial / public / media / education / other` |
| **Funktion** (freetext) | ✅ | ⚠️ Briefing wants enum: `founder / exec / operator / ic / investor / advisor / student / other` |
| **Geographien** (repeatable: kind + place + von/bis) | ✅ Wohnort/Aufenthalt/Herkunft/Hub | ✅ `person_geographies` table — same concept, different underlying storage |
| **CTA** (dropdown with expiry date) | ✅ 10+ options + expiry | ❌ Phase 2 only (`ctas` table) |
| **Priorität** (A/B/C) | ✅ | ❌ Not in briefing |
| **Zeit-Bucket** (Diese Woche / Nächste Woche / Später) | ✅ | ❌ Not in briefing |
| **Interessen & Synergien** (freetext tags) | ✅ | ⚠️ Replaced by `interests` tag cluster + `passions` table |
| **Notizen** (freetext textarea) | ✅ | ❌ Not a field in briefing (notes are interactions of type `note`) |
| **Rhythmus** (cadence days) | ✅ Number input | ⚠️ In briefing: auto-derived from `depth` level (14/30/90/180/365 days) |
| **`preferred_channel`** | ❌ Not a field | ✅ Dropdown: call / whatsapp / email / linkedin / sms |
| **Passions** (max 5) | ❌ Not a field | ✅ `passions` table, shown as section |
| **Circles** (communities) | ❌ Not a field | ✅ `circles` + `person_circles` tables |

**Form Philosophy Gap:**
- **Echo:** Shows 16 sections upfront — user fills everything they know
- **Briefing:** 4 fields → Add → AI enriches → Skeleton + Suggestions appear → user confirms

---

## 3. Person Detail Page - Section by Section

### Briefing section order vs Echo

| Order | Briefing v3 | Echo Today |
|---|---|---|
| 1 | **Header + Action-Bar** (Anrufen + WhatsApp + Mehr, dynamically ordered by `preferred_channel`) | ⚠️ Header with name/role/company + Edit + Delete buttons. No Action-Bar |
| 2 | **Reminders** (pink tag cluster: Geburtstag, Follow-ups, Lebensereignisse) | ❌ Reminders are a separate page (`/inbox`), not shown here |
| 3 | **Passions** (max 5, red cluster) | ❌ Does not exist in Echo |
| 4 | **Interests** (teal tag cluster: Themen, Skills, Berufliches) | ⚠️ "Interessen & Synergien" section exists but is a flat tag list |
| 5 | **Potential** (amber cluster: Give/Get/Both) | ❌ Does not exist in Echo |
| 6 | **Origin** (purple cluster: where relationship came from) | ❌ Does not exist in Echo |
| 7 | **Circles** (blue cluster: communities) | ❌ Does not exist in Echo |
| 8 | **Geographies** | ✅ "Klassifizierung & Orte" section (different visual treatment) |
| 9 | **Relationships** (bidirectional, from `person_relationships`) | ✅ "Beziehungen" section |
| 10 | **Contact Details** (from `person_contacts`) | ✅ Telefon + Email + Social + Adressen sections |
| 11 | **Wie kennengelernt** (the `how_we_met` field) | ❌ Field does not exist in Echo |
| 12 | **Life Events** (photo/document/voice gallery) | ❌ Does not exist in Echo |
| 13 | **Interactions History** (Timeline) | ✅ "Timeline" section |
| — | — | ➕ **Stakeholder** section (E1/E2 types) — not in briefing |
| — | — | ➕ **Notizen** section (freetext + AI summary) — not in briefing |
| — | — | ➕ **Aufgaben** (todos) — not in briefing |
| — | — | ➕ **Ähnliche Personen** — not in briefing |
| — | — | ➕ **Priority / CTA badges** — not in briefing |
| — | — | ➕ **Profile depth progress bar** ("Profil X/Y") — not in briefing |

### Action-Bar (top of person detail)

| | Briefing v3 | Echo Today |
|---|---|---|
| Primary button 1 | **Anrufen** (dark navy, `call` token, 1fr) | ❌ Not shown on detail page |
| Primary button 2 | **WhatsApp** (#25D366, `wa` token, 1fr) | ⚠️ WhatsApp send box exists but is in the Telefon section, not an action bar |
| Primary button 3 | **Mehr** (0.5fr, overflow menu) | ❌ Not present |
| Button order | Dynamic based on `preferred_channel` | ❌ `preferred_channel` field doesn't exist |
| WhatsApp button | Opens `wa.me/{number}?text={url_encoded_draft}`, logs interaction, updates `last_contact_at` | ❌ Opens WhatsApp but no draft, no auto-log |

---

## 4. Tag Clusters - Names and Semantics

### These are completely different between Echo and Briefing

| Briefing v3 Cluster | Color | Briefing Meaning | Echo Equivalent |
|---|---|---|---|
| **reminders** | Pink `#FBEAF0 / #72243E` | Geburtstage, Follow-ups, Lebensereignisse | ❌ Echo has "trigger" cluster (different name, different color) |
| **interests** | Teal `#E1F5EE / #085041` | Themen, Skills, Berufliches | ❌ Echo has "topic" cluster |
| **potential** | Amber `#FAEEDA / #633806` | Was möglich ist — Give/Get/Both | ❌ Echo has "value" cluster |
| **origin** | Purple `#EEEDFE / #3C3489` | Woher die Beziehung kommt | ❌ Echo has "context" cluster |
| **passion** | Red `#F7C1C1 / #501313` | Identitätsstiftende Interessen (max 5) | ❌ Not in Echo at all |
| **circle** | Blue `#E0EEFB / #103D6B` | Communities, Gruppen | ❌ Not in Echo at all |

Echo's cluster names: `context`, `topic`, `value`, `trigger` → None match briefing names.

### CSS Classes

| | Briefing v3 | Echo Today |
|---|---|---|
| Base class | `.cluster-tag` + `.cluster-{name}` (in globals.css from zip) | ❌ No semantic cluster CSS classes |
| Usage | `<span class="cluster-tag cluster-reminders">Geburtstag</span>` | Tags rendered as flat unstyled badges |

---

## 5. Depth Classification

| | Briefing v3 | Echo Today |
|---|---|---|
| Field name | `depth` (enum column on `persons`) | `depth_override` (freetext column on `people`) |
| Values | `inner_5 / trusted_15 / active_50 / network_150 / periphery_500` | Tier 1 / Tier 2 / Tier 3 / Tier 4 / Tier 5 (display labels, no semantic names) |
| Auto-calculation | Yes — based on interaction frequency algorithm (≥24 interactions/12mo → inner_5) | ⚠️ Cadence buckets approximate this but don't set the depth field |
| Manual override | Yes — `depth_source = 'manual_override'` | ✅ Toggle exists but just stores freetext |
| Cadence defaults | Auto-derived: inner_5→14d, trusted_15→30d, active_50→90d, network_150→180d, periphery_500→365d | ⚠️ Single `expected_cadence_days` number field, not derived from depth level |
| Tooltip text | "Die Personen, die du nachts um 3 anrufen würdest" etc. | ❌ No depth tooltips |

---

## 6. Purpose Classification

| | Briefing v3 | Echo Today |
|---|---|---|
| Field name | `purpose` (enum) | ❌ No `purpose` field |
| Values | `personal / family / business_active / business_latent / aspirational` | — |
| Current approximation | — | `scope`: work / personal / both (3 values, different semantics) |
| In Quick-Add | ✅ Field #3 in the form | — |
| Filter in people list | Would be a primary filter | `scope` filter exists (Beruflich/Privat/Beides) |

---

## 7. People List Page

### Filters

| Filter | Echo Today | Briefing v3 |
|---|---|---|
| Search | ✅ Name, Firma, Stakeholder, Industrie, Interessen, Orte | ✅ |
| Scope | ✅ Alle / Beruflich / Privat / Beides | ❌ Replaced by `purpose` filter |
| Stakeholder type | ✅ Dynamic per data | ❌ Removed (stakeholder types removed from model) |
| Priority | ✅ A / B / C / Keine | ❌ Not in briefing |
| Depth | ❌ No depth filter | ✅ Would be: inner_5 / trusted_15 / active_50 / network_150 / periphery_500 |
| Purpose | ❌ No purpose filter | ✅ personal / family / business_active / business_latent / aspirational |
| Tag | ✅ Click tag in list, filter by it | ✅ |

### Columns

| Column | Echo Today | Briefing v3 |
|---|---|---|
| Name | ✅ | ✅ |
| Company | ✅ | ✅ |
| Role | ✅ (off by default) | ✅ |
| Scope | ✅ | ❌ Replaced by Purpose |
| Tags | ✅ | ✅ |
| Stakeholder | ✅ (off by default) | ❌ Removed |
| Priority | ✅ (off by default) | ❌ Not in briefing |
| Strength | ✅ | ❌ Phase 2 |
| Industry | ✅ (off by default) | ✅ (enum in briefing) |
| CTA | ✅ (off by default) | ❌ Phase 2 |
| Cadence | ✅ (off by default) | ✅ |
| Last Interaction | ✅ | ✅ (`last_contact_at`) |
| Depth | ❌ | ✅ Would be a column |
| Purpose | ❌ | ✅ Would be a column |
| Preferred Channel | ❌ | ✅ Would be a column |

---

## 8. Alarm Clock / Debrief Page

| Feature | Briefing v3 | Echo Today |
|---|---|---|
| **Trigger mechanism** | Capacitor `LocalNotifications` — fires when app is closed | Browser WebAudio — requires tab open |
| **Wake-up screen style** | Full-screen dark gradient (night theme) | Simple page with clock widget |
| **Context block** | "Heute auf deinem Radar" — shows birthdays + upcoming reach-outs for today | ❌ Not shown |
| **Snooze options** | 5 / 9 / 15 minutes (configurable in settings) | ✅ Snooze exists but options not configurable |
| **Volume behavior** | Ramps 10% → 100% over 90 seconds | Triple beep, fixed volume |
| **Sound library** | 6 named sounds (Morgenwald, Meeresrauschen, Sanftes Erwachen, Bergmorgen, Bach Cello, Glockenstimmung) | ❌ WebAudio beep only |
| **Sound selection** | Configurable in `user_preferences.morning_alarm_sound_id` | ❌ Not configurable |
| **Days active** | Configurable per weekday (mon/tue/wed/thu/fri default) | ❌ Not configurable |
| **Alarm time** | `user_preferences.morning_alarm_time` (default 07:00) | ✅ Time picker exists |
| **"Aufstehen" button** | Dismisses alarm, shows day summary | ✅ Similar "stop" action |
| **Debrief trigger** | Moved to End-of-Day Review (18:00 push) | ✅ Debrief voice flow exists on same page |
| **`alarm_sounds` table** | ✅ Seeded in DB | ❌ Not in Echo |

---

## 9. End-of-Day Review

### This is a new feature in the briefing that Echo doesn't have as a separate flow

| Feature | Briefing v3 | Echo Today |
|---|---|---|
| **Trigger** | Push notification at 18:00 — "5 Minuten für dein Netzwerk?" | ❌ No push notification (tab must be open) |
| **Screen** | Dedicated Daily Review Screen | ⚠️ Debrief page exists but is voice-guided multi-phase flow |
| **Content** | List of people contacted today (from Gmail-Sync, Calendar-Sync, manual) | ❌ No auto-populated contact list |
| **Input per person** | Quick-Note-Input (1 line, 140 char max) | Voice conversation |
| **Skip** | Skip button per person | ❌ No per-person skip |
| **Storage** | As new `interaction` rows (type: note, source: eod_review) | Saved as `debriefs` row |
| **EoD time** | `user_preferences.eod_review_time` (default 18:00) | ❌ Not configurable separately |

---

## 10. Sunday Pulse Page

| Feature | Briefing v3 | Echo Today |
|---|---|---|
| **Generation** | Edge Function cron (briefing) | ✅ Vercel Cron + API route |
| **Output format** | Max 5 actionable suggestion cards per person | ⚠️ Single AI-generated narrative text |
| **Per suggestion** | Person name + reason + WhatsApp draft button | ⚠️ Narrative mentions people but no action buttons |
| **WhatsApp draft** | 6 use-case templates (Reengage, Business, Geburtstag, Danke Intro, Follow-Up, Lebenszeichen) | ❌ No draft generation from pulse |
| **Draft variants** | Toggle between variants | ❌ Not implemented |
| **Sending** | Opens `wa.me/...` + logs interaction + updates `last_contact_at` | ❌ Not wired |

---

## 11. Inbox / Reminders

| Feature | Briefing v3 | Echo Today |
|---|---|---|
| **Concept** | Reminders are a tag cluster on the person, surfaced in Sunday Pulse | ✅ Standalone `/inbox` page with reminders list |
| **Todos** | ❌ Not in briefing | ✅ Todos section in inbox |
| **WhatsApp strip** | ❌ Not in briefing (briefing uses URL scheme, not Cloud API inbox) | ✅ WhatsApp inbox strip |
| **Reminders on person detail** | ✅ Shown as `reminders` tag cluster section on person page | ❌ Reminders only in `/inbox`, not on person detail |
| **Smart Reminders** | ✅ AI-suggested, via suggestions table with lifecycle | ⚠️ Exists but in-memory only, not persisted to suggestions table |

---

## 12. Rhythmus Page

| Feature | Briefing v3 | Echo Today |
|---|---|---|
| **Standalone page** | ❌ Not a dedicated page — cadence surfaced via depth + Sunday Pulse | ✅ `/rhythmus` with 5 buckets |
| **Buckets** | Not specified | ✅ Drifting / Due Soon / On Rhythm / No Contact / No Cadence |
| **Smart Reminders panel** | Via suggestions table | ⚠️ Panel exists but in-memory |
| **Depth-based cadence** | Cadence auto-derived from depth level | ❌ Cadence is a manually set number, independent of depth |

---

## 13. Voice Console

| Feature | Briefing v3 | Echo Today |
|---|---|---|
| **STT** | OpenAI Whisper (server-side, via API) | Browser Web Speech API (client-side, free) |
| **LLM** | Claude Sonnet 4.6 | ✅ Claude Sonnet 4.6 |
| **TTS** | OpenAI TTS HD (default) | ElevenLabs (Sarah Eve) |
| **Streaming** | All layers streamed — audio starts before LLM finishes | ❌ Non-streaming, waits for full Claude response |
| **Latency target** | <1.5s total (STT 300ms + LLM first-token 500ms + TTS 200ms) | No defined target |
| **Provider abstraction** | `VoiceProvider` interface — swap providers without refactoring | ❌ Direct ElevenLabs calls, no interface |
| **Activation** | Push-to-Talk floating button in tab bar + `⌘Space` on desktop | ✅ Leertaste shortcut + mic button |
| **Voice screen UI** | Dark gradient, animated orb (pulse during recording, wave during playback) | ✅ Chat-style console |
| **Live transcription** | Feed showing "Du / Echo" alternating during conversation | ❌ Shows after completed |
| **Quick actions** | 3 buttons: Vorlesen / Anzeigen / Direkt-Senden | ❌ Not present |
| **Tool use** | ✅ Same 7 tools | ✅ |
| **Confirm before commit** | ✅ Confirm card | ✅ Confirm card |
| **Hotword** | ❌ No "Hey Echo" in MVP | ❌ No hotword |

---

## 14. Settings / User Preferences

### Echo has settings as a tab in the self-person profile. Briefing stores in `user_preferences` table.

| Setting | Briefing v3 | Echo Today |
|---|---|---|
| **Display name** | ❌ Not in briefing | ✅ display_name in settings tab |
| **Language** | ✅ `language` (default 'de') | ✅ |
| **Timezone** | ✅ `timezone` (default 'Europe/Berlin') | ❌ Not stored |
| **Preferred channel** | ✅ `preferred_channel` (affects Action-Bar order) | ❌ Not a setting |
| **Swipe gestures** | ✅ `enable_swipe_gestures` (default off) | ❌ Not a setting |
| **Sunday Pulse time** | ✅ `sunday_pulse_time` (default 19:00) | ❌ Not configurable |
| **Sunday Pulse on/off** | ✅ `sunday_pulse_enabled` | ❌ Not configurable |
| **Morning alarm time** | ✅ `morning_alarm_time` (default 07:00) | ✅ Time picker in debrief page |
| **Morning alarm on/off** | ✅ `morning_alarm_enabled` | ✅ Toggle exists |
| **Alarm sound** | ✅ `morning_alarm_sound_id` (6 sounds) | ❌ No sound selection |
| **Alarm volume** | ✅ `morning_alarm_volume` (0–100) | ❌ Not configurable |
| **Snooze duration** | ✅ `morning_alarm_snooze_minutes` (5/9/15) | ❌ Not configurable |
| **Alarm days** | ✅ `morning_alarm_days` (text[] mon–fri default) | ❌ Not configurable |
| **EoD Review on/off** | ✅ `eod_review_enabled` | ❌ No EoD Review |
| **EoD Review time** | ✅ `eod_review_time` (default 18:00) | ❌ Not configurable |
| **STT provider** | ✅ `voice_provider_stt` (openai / deepgram) | ❌ No provider choice |
| **LLM provider** | ✅ `voice_provider_llm` (anthropic / others) | ❌ No per-layer choice |
| **TTS provider** | ✅ `voice_provider_tts` (openai / elevenlabs) | ❌ No provider choice |
| **Voice hotword** | ✅ `voice_hotword_enabled` (default off) | ❌ Not a setting |
| **Voice ID** | ❌ Not in briefing | ✅ voice_id in Echo settings |
| **BYO Anthropic key** | ✅ `user_api_keys` table (encrypted via Vault) | ⚠️ Plain JSONB in `profiles.byo_api_keys` |
| **BYO ElevenLabs key** | ✅ | ⚠️ Plain JSONB |
| **BYO OpenAI key** | ✅ `user_api_keys` table | ❌ Not an option in Echo |
| **BYO Deepgram key** | ✅ | ❌ Not an option |
| **BYO Google Places key** | ✅ | ❌ Not an option |
| **BYO PDL key** | ✅ | ❌ Not an option |
| **Key validation on save** | ✅ Test API call per provider | ❌ No validation |
| **Subscription plan** | ✅ Free / Pro in `user_preferences` | ⚠️ `profiles.subscription_*` columns but no logic |
| **Debrief time** | ❌ Not in briefing | ✅ debrief_time in Echo settings |

---

## 15. Self-Person Profile Tabs

| Tab | Echo Today | Briefing v3 |
|---|---|---|
| **Profil** | ✅ Person detail view | ✅ (standard person detail) |
| **Streaks** | ✅ XP + current/longest streak + 16 achievements | ❌ Not in briefing |
| **Payments** | ✅ Placeholder (Stripe, not wired) | ❌ Not in briefing as a tab |
| **Settings** | ✅ display_name, language, voice_id, debrief_time, BYO keys | ⚠️ Settings would move to `/settings` page, not a person tab |

---

## 16. Connections / OAuth Page

| Feature | Briefing v3 | Echo Today |
|---|---|---|
| **Dedicated connections page** | ❌ OAuth done at login (Google scopes during SSO) | ✅ `/connections` hub page |
| **Google Calendar** | ✅ Scope at login | ⚠️ Post-login setup via `/connections` |
| **Gmail** | ✅ Scope at login | ⚠️ Post-login setup via `/connections` |
| **WhatsApp** | Via URL scheme (no Cloud API in MVP) | ✅ Full Cloud API webhook implementation |
| **Providers shown** | Not a catalog — just Google (in auth) | ✅ Catalog with CRM/Kommunikation/Produktivität/Social/Webhook categories |
| **Connection categories** | ❌ Not in briefing | ➕ CRM, Kommunikation, Produktivität, Social, Webhook |

---

## 17. Models Page

| Feature | Briefing v3 | Echo Today |
|---|---|---|
| **Dedicated `/models` page** | ❌ Provider choice in settings, not a catalog page | ✅ Full page with 14-model catalog |
| **Model catalog table** | ❌ Not in briefing | ✅ Provider, context window, pricing, capabilities |
| **Per-task model assignment** | ❌ | ✅ TaskPreferenceRow per task type |
| **Provider choice per voice layer** | ✅ STT / LLM / TTS independently | ⚠️ Global model choice, not per-layer |
| **BYO keys per provider** | ✅ Per-layer in settings | ⚠️ Global keys in profiles.byo_api_keys |
| **14-model catalog** | ❌ Briefing: only active providers (Anthropic + OpenAI + ElevenLabs + Deepgram + PDL) | ✅ 14 models catalogued |

---

## 18. Missing Pages / Sections (Briefing has, Echo doesn't)

| Feature | Briefing Section | Status in Echo |
|---|---|---|
| **Life Events gallery** on person detail | §11 | ❌ Not started |
| **Global Lifeline view** (sidebar tab, all events chronological) | §11 | ❌ Not started |
| **End-of-Day Review Screen** (push at 18:00, list + quick-note) | §10 | ❌ Not started |
| **Onboarding Wizard** (4 screens: Depth, AI, Pulse, API keys) | §21 | ❌ Not started |
| **Backfill Progress UI** (during onboarding, 90-day email scan) | §7 | ❌ Not started |
| **Quota bars in Settings** (progress per resource, 4 states) | §17 | ❌ Not started |
| **Upgrade Modal** (hard-cap reached, 2 options) | §17 | ❌ Not started |
| **REST API v1** (`/api/v1/` versioned) | §13 | ❌ Not versioned |
| **Scalar API Docs** (`/docs/api`) | §13 | ❌ Not started |
| **Personal Access Token management** (generate/revoke PATs) | §14 | ❌ Not started |
| **MCP Server** (`/mcp`) | §14 | ❌ Not started |
| **`/llms.txt`** | §15 | ❌ Not started |
| **`/docs` MDX documentation** | §15 | ❌ Not started |
| **WhatsApp Draft generation** from Pulse | §18 | ❌ Not wired |
| **`APP_CONFIG` constant** (`lib/config.ts`) | §2 | ❌ Not started |
| **`lib/design-tokens.ts`** TypeScript file | §19 | ❌ Not started (zip has it ready) |

---

## 19. Extra Features Echo Has (Briefing Excludes)

| Echo Feature | What it does | Briefing stance |
|---|---|---|
| **Organisationen** (`/organizations`) | Full CRUD for companies with dedup + AI enrichment | Not in briefing schema |
| **Pipelines + Deals** (`/pipelines`) | Sales Kanban board | Explicitly excluded ("HubSpot's job") |
| **Voice Vibe Integrations** (`/integrations`) | Visual workflow editor with @xyflow/react | Not in briefing |
| **Workflows** (`/integrations/workflows`) | Node-based flow designer (no runtime) | Not in briefing |
| **Debriefs table** | Daily voice log with streaks | Not in briefing |
| **Gamification** (XP/levels/16 achievements) | Streaks tab on self-profile | Not in briefing |
| **Notes** (as separate entity) | `/notes` table, shown in Timeline | Briefing uses interactions of type `note` |
| **Todos** (as separate entity) | `/inbox` todos section | Not in briefing |
| **Multi-model catalog** page | 14 models, 7 providers, per-task preferences | Not a page in briefing |
| **Scope field** (work/personal/both) | Filter + badge on people | Replaced by `purpose` |
| **CTA + expiry** on persons | Call-to-action with deadline | Phase 2 only |
| **Priority A/B/C** on persons | Ranking field | Not in briefing |
| **Zeit-Bucket** (Diese Woche etc.) | Decay-based priority bucket | Not in briefing |
| **Stakeholder E1/E2 taxonomy** | 12 types with sub-types | Replaced by `purpose` enum |
| **Admin dashboard** (`/admin`) | Stats + user list | Not in briefing |
| **Rückblick / Recap** | Monthly/yearly AI narrative | Not in briefing (could keep) |
| **`connections` table** | Dead graph edge table | Not in briefing (dead anyway) |

---

## 20. Design System

| Token | Briefing v3 (`design-tokens.ts` in zip) | Echo Today |
|---|---|---|
| **Source of truth file** | `lib/design-tokens.ts` (TypeScript, exports types + helpers) | `app/globals.css` CSS variables only |
| **Primary font** | Plus Jakarta Sans (variable, Google Fonts) | Geist (Vercel's font) |
| **Mono font** | DM Mono | Not specified |
| **Brand color** | Kindra Lila `oklch(42% 0.14 290)` (CSS variable `--kindra`) | Action color `oklch(56% 0.2 256)` (different hue) |
| **Background** | Paper `#fbfaf7` (warm beige) | Likely similar warm paper color |
| **Radius scale** | r1(4px) / r2(6px) / r3(10px) / r4(14px) / pill(999px) | Not formalized |
| **Shadow scale** | shadow-1 / shadow-2 / shadow-night | Not formalized |
| **Dark mode** | `data-theme="dark"` on `<html>` (full token override) | Not implemented |
| **Tag cluster CSS** | 6 `.cluster-{name}` classes in globals.css | ❌ No cluster CSS classes |
| **Tabular nums** | `.num`, `time`, `.num-block` classes enforce `font-variant-numeric: tabular-nums` | ❌ Not enforced |
| **TypeScript access** | `import { tokens, getClusterColors } from '@/lib/design-tokens'` | ❌ Not available |

> **Note:** The zip contains all 3 design files (`design-tokens.ts`, `globals.css`, `tailwind.config.ts`) ready to drop in. They replace the current font and color system.

---

## Quick Summary Table

| Area | Match Level | Notes |
|---|---|---|
| Voice Console | ⚠️ 60% | STT wrong, no streaming, no provider abstraction |
| Person Detail sections | ⚠️ 45% | Action-Bar missing, 6 new sections needed, several Echo-only sections |
| Quick-Add Form | ❌ 20% | Philosophy opposite (30 fields vs 4), `how_we_met` missing, wrong classification fields |
| Tag Clusters | ❌ 0% | Completely different names and semantics |
| Depth Classification | ⚠️ 40% | Field exists but wrong type and no auto-calculation |
| Purpose Classification | ❌ 0% | `purpose` field doesn't exist, `scope` is a different concept |
| Settings | ⚠️ 30% | Missing 12+ settings fields, BYOK not encrypted |
| Alarm Clock | ⚠️ 25% | Same concept, completely different implementation |
| Sunday Pulse | ⚠️ 50% | Generates text but no actionable cards or WhatsApp drafts |
| Gmail/Calendar Sync | ⚠️ 60% | Works but pull-based vs push-based |
| Design System | ⚠️ 30% | Wrong font, no TS token file, no cluster CSS |
| Life Events | ❌ 0% | Not started |
| MCP Server | ❌ 0% | Not started |
| REST API v1 | ❌ 10% | Routes exist but unversioned, no audit log, no OpenAPI |
| Onboarding | ❌ 0% | Not started |
| Free/Pro Quotas | ❌ 0% | Not started |
| EoD Review | ❌ 0% | Not started |
| WhatsApp Drafts | ❌ 10% | Draft system not connected to Pulse or person actions |
