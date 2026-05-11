# ECHO_GAP_ANALYSIS.md

Mapping `PERSONAL_CRM_BUILD_BRIEFING.md` → `ECHO_INVENTORY.md`.

Pro Briefing-Aspekt eine Einordnung:
- **KEEP** — existiert, passt direkt zum Ziel
- **REFACTOR** — existiert, muss geändert werden
- **REPLACE** — existiert, widerspricht der Richtung, muss weg
- **BUILD** — existiert nicht, muss neu gebaut werden

Plus Risiko-Einschätzung pro Position.

---

## 1. Stack & Infrastruktur

| Briefing-Aspekt | Echo-IST | Status | Risiko | Begründung |
|---|---|---|---|---|
| Next.js 14 App Router | Next.js **16.2.4** App Router | KEEP | Niedrig | Versions-Differenz nicht kritisch — Next 16 ist Superset. Briefing-Wording kann auf 16 aktualisiert werden. |
| TypeScript + Tailwind | Vorhanden | KEEP | — | |
| shadcn/ui | Installiert, kaum genutzt | REFACTOR | Mittel | Briefing fordert "stick with shadcn for consistency". Heute viel rohes Tailwind. Schrittweise Migration zu shadcn-Primitives bei neuen Komponenten, alte bleiben funktional. |
| Supabase (Postgres + Auth + Storage + Edge Functions) | Supabase Postgres + Auth (kein Storage/Edge Functions live) | REFACTOR | Niedrig | Storage + Edge Functions müssen aktiviert werden (für Voice-Note-Audio, Enrichment-Jobs). |
| EU-Region für DSGVO | Nicht verifiziert | OPEN | Hoch | Muss in Supabase-Console geprüft + Region dokumentiert werden. Falls US-Region → Re-Provisioning + Daten-Migration nötig. |
| Vercel Hosting | Vercel mit Region fra1 | KEEP | — | DSGVO-konform. |
| Anthropic Claude Sonnet 4.5 für Extraction | claude-sonnet-4-6 (neuer als Briefing 4.5) | KEEP | — | Wir nutzen sogar neueres Modell. |
| Claude Haiku für Tag-Vorschläge | Haiku 4.5 im Catalog, nicht aktiv genutzt | BUILD | Niedrig | Haiku-Wiring in Tag-Suggest-Pipeline nachziehen. |
| ElevenLabs / Whisper für Voice | ElevenLabs TTS live, **kein** Server-STT (Browser Web Speech API) | BUILD (STT) | Mittel | Whisper/Deepgram-Integration für 20-60s Voice-Notes. Web Speech API bleibt für Live-Voice-Console. |
| People Data Labs für LinkedIn-Enrichment | **Nicht vorhanden** | BUILD | Mittel | Komplett neue Edge Function + API-Key + Cache-Layer. Briefing 7.1 detailliert. |

---

## 2. Architektur-Prinzipien

| Briefing-Prinzip | Echo-IST | Status | Risiko |
|---|---|---|---|
| Server Components default | Großteils befolgt | KEEP | — |
| Server Actions für Mutations | Hauptsächlich API-Routen, wenige Server Actions | REFACTOR | Mittel | Migrations-Risiko niedrig wenn schrittweise, sonst Concurrency-Bugs möglich. Brief sagt: API-Routen nur für Webhooks. |
| Supabase Types + Zod Validation | Manuelle types.ts, Zod-Coverage nicht durchgängig | REFACTOR | Niedrig | `supabase gen types` einrichten, Zod-Schemas für alle Inputs. |
| Async AI via Edge Functions | Synchron im Request-Pfad | REFACTOR | Hoch | Voice-Console-UX leidet bei langen Antworten. Edge Functions + Queue für Background-Enrichment. |
| Optimistic UI für Suggestions | Vorhanden für viele Stellen (Suggestion-Cards, Inbox-Strip) | KEEP | — | |

---

## 3. Domain-Regeln

### 3.1 3-Achsen-Klassifizierung

| Achse | Echo-IST | Status | Migration-Risiko |
|---|---|---|---|
| `depth` (inner_5 / trusted_15 / active_50 / network_150 / periphery_500) | **Existiert nicht.** Echo hat `depth_override` (Freitext), `strength_score` (int 0-100), `expected_cadence_days` (int) — keine Enum-Achse. | BUILD | Hoch — neue Spalte, Auto-Calc-Algorithmus, Migration bestehender Daten in 5 Buckets. |
| `depth_source` (auto / manual_override) | **Existiert nicht.** | BUILD | Niedrig |
| `purpose` (personal / family / business_active / business_latent / aspirational) | Teil-Mapping über `scope` (work/personal/both) + `stakeholder_types[]` (Partner/Investor/Kunde/Mitarbeiter/Service-Provider/Mentor/Multiplikator/Media/Regulator/Privat) | REFACTOR | Hoch — Mapping nicht 1:1. `business_active` ∋ Kunde + Partner + Mitarbeiter + aktive Mentoren, `business_latent` ∋ Ehemalige, `aspirational` hat kein Pendant. Migration-Mapping muss manuell durchdacht werden. |
| `mode` (active / nurture / dormant / reconnect / archive) | **Existiert nicht.** Heute Cadence-Buckets in lib/cadence.ts (on-rhythm/due-soon/drifting/no-contact/no-cadence) — computed, nicht persistiert. | BUILD | Hoch — neue Spalte + Auto-Transition-Logik + Reconnect-Trigger-Engine. |
| Mode auto-transitions (active → dormant @ 2x cadence) | Nicht implementiert | BUILD | Mittel — neue Edge Function + tägliche Cron. |
| Reconnect-Trigger (Job-Wechsel, Geburtstag, News) | Nicht implementiert | BUILD | Hoch — braucht PDL-Polling + AI-Signal-Detection. |

**Spannung**: das aktuelle Modell (stakeholder_types + scope + priority + depth_override) hat höhere Granularität als das 3-Achsen-Modell. Briefing-Regel: "If existing code has a different classification logic ... this must be migrated to the 3-axis model, not preserved." → REPLACE für die Achsen, aber bestehende Werte werden als Migrationsbasis genutzt.

### 3.2 Tags

| Briefing-Aspekt | Echo-IST | Status | Risiko |
|---|---|---|---|
| Max 7 pro Person | Nicht enforced (DB + UI) | REFACTOR | Niedrig — Constraint hinzufügen + UI-Counter. Existierende Person-Records mit >7 Tags brauchen Bereinigung (User-Choice oder Auto-Trim Top-7-Most-Used). |
| Flach, nicht hierarchisch | Heute flach in text[] | KEEP | — |
| 4 Cluster (context/topic/value/trigger) | **Existiert nicht.** Tags sind einfache Strings. | BUILD | Hoch — eigene `tags`-Tabelle + `person_tags` Junction + Cluster-Enum + Migration aller bestehender Tags in einen Default-Cluster (`topic`) + AI-Re-Klassifizierung. |
| Auto-Dedup-Suggestions (Levenshtein/Plural) | Nicht implementiert | BUILD | Mittel — Edge Function + Suggestions-Lifecycle. |

### 3.3 Cadence-Defaults

| Briefing | Echo-IST | Status |
|---|---|---|
| inner_5 → 14 Tage | Heute frei pro Person (`expected_cadence_days`) | BUILD (depth-basierte Defaults) |
| trusted_15 → 30 Tage | dito | BUILD |
| active_50 → 90 Tage | dito | BUILD |
| network_150 → 180 Tage | dito | BUILD |
| periphery_500 → 365 Tage | dito | BUILD |

`expected_cadence_days` bleibt, wird aber von depth abgeleitet (mit User-Override-Pfad). REFACTOR-Risiko niedrig.

---

## 4. Datenmodell (Entity-für-Entity)

### Person

| Briefing-Feld | Echo-IST | Status | Notiz |
|---|---|---|---|
| id, user_id, created_at, updated_at | ✓ | KEEP | |
| name (Pflicht) | ✓ | KEEP | |
| first_name, last_name | **fehlt** | BUILD | Aus `name` ableiten lassen (Split bei letztem Space) — oder Briefing-Wunsch: separat halten. |
| company, role | ✓ | KEEP | |
| industry (Enum mit 10 Werten) | `industry` als text (freitext) | REFACTOR | Constraint auf Enum-Werte + Migration bestehender Strings. |
| function (Enum: Founder/Exec/Operator/IC/Investor/Advisor/Student/Other) | `job_function` als text (freitext) | REFACTOR | Wie industry. |
| photo_url | `avatar_url` | REFACTOR | Spalten-Rename (oder beide behalten, eines deprecated). |
| linkedin_url | **fehlt** | BUILD | Wird per PDL gefüllt. |
| depth, depth_source, purpose, mode | siehe 3.1 | BUILD | Kern-Migration. |
| how_we_met (Goldfeld) | **fehlt** | BUILD | Kritisch — KI-Goldfeld. |
| met_date, met_location | **fehlt** | BUILD | |
| expected_cadence_days | ✓ | KEEP | |
| last_contact_at | `last_interaction_at` | REFACTOR | Spalten-Rename oder Alias. |
| next_nudge_at | **fehlt** (heute on-the-fly berechnet) | BUILD | Persistieren für effizientes Sonntags-Puls. |
| current_cta, cta_due_at | `cta` (text), `cta_expires_at` | REFACTOR | Spalten-Rename. |
| cta_priority (a/b/c) | `priority` (A/B/C, person-level, nicht CTA-spezifisch) | REFACTOR | Aktuelles `priority` ist person-level (statisch), Briefing-`cta_priority` ist pro CTA. Migration-Mapping: aktuelles `priority` → mappt auf person-level Erweiterung oder nimmt erste CTA mit. |
| home_location, current_location | **fehlt** (Geographien-JSONB ist breiter) | REFACTOR | Aus geographies extrahieren. |
| relationships array | JSONB `relationships` + tote `connections`-Tabelle | KEEP (JSONB) + REPLACE (Tabelle) | JSONB-Form passt, tote Tabelle löschen. |
| tags array | text[]-Array | REPLACE | Siehe 3.2 — neue Tabelle + Junction. |
| archived boolean | `deleted_at timestamptz` | REFACTOR (semantisch ok) | Briefing fordert `archived bool`, Echo hat `deleted_at`. Semantisch ähnlich (filter !null vs filter false). Migration-Entscheidung: Echo's Pattern beibehalten oder Briefing folgen? Niedriges Risiko entweder Weg. |
| notes (text, durchsuchbar) | `notes` + `notes_summary` | KEEP | Wir haben sogar ein Plus. |
| **Echo extras** (scope, is_self, organization_id, strength_score, stakeholder_types, stakeholder_sub_types, geographies, interests, depth_override) | | DECIDE | |

**Echo-Extras-Entscheidungen:**
- `scope` (work/personal/both) → wird durch `purpose` ersetzt. **REPLACE**
- `is_self` (Self-Person-Pattern) → Echo-spezifisch, im Briefing nicht vorhanden. **KEEP** (nützlich, kein Konflikt)
- `organization_id` (FK auf orgs) → Briefing hat `company` als string. **KEEP** (Orgs-Modell ist nicht im Briefing, wir haben es; entscheidet sich später bei Orgs)
- `strength_score` (int 0-100) → wird durch `depth`-Achse abgelöst. **REPLACE**
- `stakeholder_types[] + stakeholder_sub_types{}` → in `purpose` + Tags zerlegen. **REPLACE**
- `geographies` JSONB → spezifischer als Briefings `home_location/current_location`. **REFACTOR** — Briefing-Felder als Top-Level + restliche Geographies als Tags? Diskutieren.
- `interests` text[] → durch Tag-Cluster `topic` abgedeckt. **REPLACE**
- `depth_override` (Freitext: Fremd/Bekannt/Vertraut/Persönlich) → wird durch `depth_source = 'manual_override'` + `depth`-Enum ersetzt. **REPLACE**

### Tag

Aktuell: text[]-Spalte auf people/orgs/notes. Briefing fordert eigene Tabelle.

| Briefing-Feld | Echo-IST | Status |
|---|---|---|
| `tags` Tabelle mit id/name/cluster/created_by/usage_count | nicht vorhanden | BUILD |
| `person_tags` Junction | nicht vorhanden | BUILD |
| Migration der bestehenden text[]-Tags | — | BUILD |

### Interaction

| Briefing-Feld | Echo-IST | Status | Notiz |
|---|---|---|---|
| id, user_id, person_id | id + user_id ✓, **person_ids uuid[]** (Array, multi-Person) | REFACTOR | Vereinfachung auf single FK oder Briefing erweitern um Multi-Person-Form? **Entscheidung Patrick**: Briefing-Single hat Vorteil der Einfachheit, Echo-Array unterstützt Gruppen-Meetings ohne Duplikat-Rows. |
| interaction_type (call/meeting/email/whatsapp/linkedin_dm/coffee/dinner/event/note/other) | `type` (meeting/call/email/note/voice) — weniger Enum-Werte | REFACTOR | Briefing erweitert Enum — Migration trivial (alte Werte bleiben gültig). |
| direction (inbound/outbound/mutual) | **fehlt** | BUILD | |
| occurred_at | ✓ | KEEP | |
| duration_minutes | **fehlt** | BUILD | |
| summary | ✓ | KEEP | |
| sentiment | ✓ (positive/neutral/tense) | KEEP | Brief: positive/neutral/negative. Mapping tense → negative. |
| ai_extracted_facts (jsonb) | **fehlt** | BUILD | Echo extrahiert via Tool-Use direkt, persistiert nicht zusätzlich. |
| source (manual/voice_note/email_forward/calendar_sync/whatsapp_export/linkedin_dm) | `source` (debrief/manual/calendar) | REFACTOR | Enum-Erweiterung. |

### Suggestion

**Komplett neu** — keine Suggestions-Tabelle existiert.

| Briefing-Feld | Status |
|---|---|
| id, user_id, person_id, suggestion_type, payload jsonb, reasoning, status, created_at, resolved_at | BUILD |
| Lifecycle pending → accepted/rejected/dismissed | BUILD |

**Risiko Hoch** — neue zentrale Tabelle, viele bestehende AI-Flows müssen umgeschrieben werden (Smart-Reminders, Org-Enrich, Workflows-Generate, Inline-Duplicate-Warnung), damit sie statt direktem User-Klick erstmal in `suggestions` schreiben.

### Organization

Echo hat eine vollwertige `organizations`-Tabelle, das Briefing erwähnt sie nicht.

| | Status |
|---|---|
| Echo-Organizations-Modell | KEEP (mit Notiz) |

**Notiz**: Briefing erlaubt `company: string` auf Person. Echo hat First-Class-Orgs mit FK `organization_id`. Reicher als Briefing → behalten als Pluspunkt. Migration der `company`-Strings auf Orgs-FK passiert bereits (resolveOrCreateOrganization).

### Connection (parallel Graph-Tabelle)

Echo hat tote `connections`-Tabelle für Person-zu-Person. Wird nicht aktiv geschrieben.

| | Status |
|---|---|
| `connections`-Tabelle | REPLACE (entfernen oder bewusst deprecaten) |
| `people.relationships` JSONB | KEEP — bleibt Source-of-Truth |
| Briefing `person_relationships` Junction-Table | DISCUSS |

**Vorschlag**: tote `connections`-Tabelle löschen, JSONB `people.relationships` als Source-of-Truth behalten. Falls Briefing-Junction-Form gewünscht: später als Migration nachziehen.

---

## 5. Eingabe-Flows

| Briefing-Flow | Echo-IST | Status | Risiko |
|---|---|---|---|
| 5.1 Quick-Add (4 Felder: name/how_we_met/purpose/depth) | New-Form hat 30+ Felder | REFACTOR | Hoch — sehr aktiv genutztes Formular. Migration auf 4-Felder-Briefing-Form mit "Mehr Felder"-Toggle für Power-User? Patrick-Entscheidung. |
| KI-Extraktion aus how_we_met | **how_we_met fehlt komplett** | BUILD | Hoch — Goldfeld muss erstmal in DB, dann in Form, dann Extraction-Pipeline. |
| Tag/Cadence/CTA-Vorschläge als Suggestions | Heute via Tool-Use direkt | REFACTOR | Mittel — durch Suggestions-Tabelle laufen lassen. |
| 5.2 Voice-Note-Add (20-60s Audio → Transcript → Extract) | Heute nur Live-Voice-Console (Web Speech API) | BUILD | Mittel — Audio-Upload zu Supabase Storage + Whisper/Deepgram + bestehende Extract-Pipeline. |
| 5.3 Email-Forward-Add (`crm-add@…`) | **Nicht vorhanden** | BUILD | Mittel — neuer SMTP-Receiver + Auth-Token-Mapping. |
| 5.4 Visitenkarten-Foto-Add | Vorhanden (Claude Vision) | KEEP | — |

---

## 6. Sonntags-Puls

| Aspekt | Echo-IST | Status |
|---|---|---|
| Cron Sonntag 19:00 lokale Zeit | Vercel Cron Sonntag 18:00 UTC | REFACTOR | Niedrig | Zeitzonen-Logik: User-Profil-Timezone berücksichtigen, dynamischer Cron oder Loop über User. |
| Push-Notification | **Nicht vorhanden** (nur In-App) | BUILD | Hoch — PWA Service Worker + Push API (OneSignal oder Web Push) + iOS-Spezifika. |
| Max 5 priorisierte Vorschläge | Pulse-Page existiert mit AI-Erzählung | REFACTOR | Mittel — Algorithmus aus Briefing 6.2 anpassen: CTA-Deadline > inner_5/trusted_15-overdue > Reconnect-Kandidaten > Aspirational > Trigger-Tags. |
| 1-Klick-Aktionen (WA/Email/LinkedIn pre-drafted) | **Nicht vorhanden** | BUILD | Hoch — pro Vorschlag Reconnect-Draft (Briefing 11.3) + Channel-Tasten. |
| Snooze / Erledigt / Nicht jetzt | **Nicht vorhanden** | BUILD | Mittel |
| Wochenrückblick-Snippet | Recap-Page leistet das schon | KEEP | — |

---

## 7. KI-Komponenten

| Komponente | Echo-IST | Status | Risiko |
|---|---|---|---|
| Enrichment-Pipeline (LinkedIn via PDL, Company-Anreicherung, Field-Extract aus how_we_met) | Nur Org-Enrich vorhanden | BUILD | Hoch — neue Edge Function, PDL-Key, Cache-Tabelle (30 Tage), async Queue. |
| Tag-Suggestion-Engine (häufige Tags gleiche Industrie/Firma/Region + Konsolidierung) | Nicht vorhanden | BUILD | Mittel |
| Connection-Discovery (gleiche Firma/Tag/Standort, Value-Tag-Synergien) | Nicht vorhanden | BUILD | Mittel |
| Reconnect-Trigger (LinkedIn-Jobwechsel, Geburtstage, News) | Geburtstage via Cron in Smart-Reminders teils da, Rest nicht | BUILD | Hoch (PDL-Polling-Cost). |

---

## 8. UI-Spezifikation

### Drei Hauptansichten (8.1)

| Briefing-View | Echo-IST | Status |
|---|---|---|
| Heute (Default) — CTAs überfällig + Pulse-Liste + Pending Suggestions | `/` ist Voice-Console, nicht Heute-Dashboard | REFACTOR | Hoch — `/` umbauen ODER neue Route `/today` + Voice-Console auf `/voice`. Patrick-Entscheidung. |
| People (Filter Tiefe/Zweck/Modus/Tags + Volltext-Suche) | `/people` mit Filter Scope/Stakeholder/Priority | REFACTOR | Mittel — Filter-Set auf neue Achsen umstellen. |
| Hinzufügen (FAB mit 4 Optionen) | Aktuell `+ Person` Button mit linker Sidebar | REFACTOR | Mittel — Floating Action Button + 4-Optionen-Sheet. |

### Person-Detail (8.2 — 7 Blöcke)

| Block | Echo-IST | Status |
|---|---|---|
| 1: Header mit Foto/Name/3-Achsen-Badge | Heute Header mit Name + Scope + Tags + Strength + Relationship-Badges | REFACTOR | Hoch — 3-Achsen-Badge-Komponente neu, klickbar als Sheet zum Ändern. Aktuelles Stakeholder-View muss weichen oder umgemappt werden. |
| 2: Aktion (CTA + Quick-Actions) | CTA + Edit + Log-Interaction vorhanden | KEEP | — |
| 3: KI-Vorschläge (Card-Stack) | Smart-Reminders-Panel auf /rhythmus, nicht auf Person-Detail | REFACTOR | Mittel — Card-Stack auf Person-Detail bringen, Suggestions-Tabelle als Datenquelle. |
| 4: Kontext (how_we_met / Tags / Geographien / Wichtige Daten) | how_we_met fehlt, Tags + Geos + Wichtige Daten vorhanden | BUILD (how_we_met) + REFACTOR (Tags-Cluster) | Mittel |
| 5: Beziehungen | RelationshipList vorhanden | KEEP | — |
| 6: Interaktions-Timeline | PersonTimeline vorhanden | KEEP | — |
| 7: Notizen | Vorhanden + AI-Summary | KEEP | — |

### Mobile-First (8.3)

| Aspekt | Echo-IST | Status |
|---|---|---|
| Single-Column-Layout | Großteils ja, aber einige Grids | REFACTOR | Niedrig |
| Quick-Add 1-Tap (FAB) | Heute Button im Header | REFACTOR | Niedrig |
| Voice-Note als primäre mobile Eingabe | Voice-Console auf `/`, kein dedicated Voice-Note-Flow | BUILD | Mittel |
| Sonntags-Puls als Mobile-Push-View | Nicht vorhanden | BUILD | Hoch |
| Swipe-Gesten (rechts=kontaktiert, links=snooze) | Nicht vorhanden | BUILD | Mittel |
| PWA-Install-Prompt | Nicht vorhanden | BUILD | Mittel |

---

## 9. Tech-Stack-Tabelle (Briefing 9)

| Briefing | Echo | Status |
|---|---|---|
| Next.js 14 + Tailwind + shadcn/ui | Next 16 + Tailwind 4, shadcn kaum genutzt | REFACTOR (shadcn-Integration) |
| Supabase | ✓ | KEEP |
| Claude Sonnet 4.5 + Haiku | Sonnet 4.6 (Haiku im Catalog) | KEEP |
| People Data Labs **oder** Apollo.io | Keine | BUILD |
| OpenAI Whisper **oder** Deepgram | Keine (Browser-STT) | BUILD |
| Google Cloud Vision **oder** Tesseract OCR | Claude Vision (statt dedicated OCR) | KEEP (Echo's Lösung passt) |
| OneSignal / Expo Push | Keine | BUILD |
| Vercel + Supabase Cloud | ✓ | KEEP |
| Expo / Capacitor (optional Mobile) | Keine | DEFER (Phase 4) |

---

## 10. Phasen-Plan (Briefing 10)

Echo ist ungefähr zwischen Phase 1 (MVP) und Phase 2 (Automatisierung):

| Phase | Briefing-Scope | Echo-Erfüllung |
|---|---|---|
| 1 - MVP | Datenmodell + Quick-Add + KI-Extract + PDL + Detail + Tags + Manual Interactions + Liste | ~50% (vieles vorhanden, aber Achsen-Modell + Tags-Cluster + PDL fehlen) |
| 2 - Automatisierung | Sonntags-Puls + Auto-Mode + Reconnect-Trigger + Connection-Discovery + WA/Email-Drafts | ~30% (Cron + Pulse-UI da, aber kein Mode/Trigger/Discovery/Draft) |
| 3 - Eingabe-Vielfalt | Voice-Note-Transcript + Email-Forward + Visitenkarten-OCR + Chrome-Extension | ~20% (nur Visitenkarten teilweise) |
| 4 - Polish | Graph + Analytics + Multi-User + Mobile-App | 0-10% |

---

## 11. Was bewusst NICHT gebaut wird (Briefing 14) — DIREKTE KONFLIKTE

| Briefing-Ausschluss | Echo-IST | Aktion | Risiko/Auswirkung |
|---|---|---|---|
| **Klassisches Pipeline-Management (HubSpot's Job)** | Voll implementiert: pipelines + deals Tabellen, Kanban, Forms, Server-Actions, Routes | **REPLACE / REMOVE** | **Hoch** — Patrick muss entscheiden: a) Komplett entfernen (Daten-Verlust falls genutzt), b) Stillhalten + entlinken aus Sidebar (Code bleibt latent), c) Briefing-Ausschluss aufheben (Pipelines bleiben aktiv). Empfehlung: vor Migration mit Patrick klären. |
| **Team-Kollaboration** | Single-User-RLS, kein Team-Modell | OK | — |
| **Mass-Mail / Broadcast** | Nicht vorhanden | OK | — |
| **Detaillierte Sales-Reports** | Admin-Stats sind Engagement-Reports, nicht Sales | OK | — |
| **Komplexe Custom-Fields** | Nicht vorhanden (außer JSONB `field_values` auf deals) | OK (sobald deals weg sind) | — |

Plus weitere Features, die im Briefing **nicht erwähnt** sind, in Echo aber existieren:

| Echo-Feature | Aktion | Begründung |
|---|---|---|
| Workflow-Editor (Voice Vibe Integrations) | **REMOVE oder DEFER** | Nicht im Briefing, kein Runtime, kein Use-Case-Beleg. Komplexer Code (xyflow Editor, Workflow-Generator). |
| Multi-Model-Catalog `/models` mit 14 Modellen, 7 Provider | **TRIM auf Anthropic + ElevenLabs** | Briefing fixiert Stack. Per-Task/Per-Node-Overrides werden überflüssig wenn nur Anthropic. |
| Gamification (Streaks/XP/Level/Achievements) | **DEFER (Phase 4 Polish)** | Patrick hat zugestimmt, Briefing erwähnt nicht. Niedriger Konflikt — kann optional bleiben oder hidden werden. |
| Admin-Dashboard | **KEEP** | Internes Tool, nicht user-facing, kein Briefing-Konflikt. |
| Models-Page | **REMOVE** | Wenn nur Anthropic bleibt: irrelevant. |
| Search (Cmd+K) | **KEEP** | Nicht im Briefing, aber wertvoll. Kein Konflikt. |
| Duplicate Detection + Merge | **KEEP** | Nicht im Briefing aber pragmatisch wertvoll, kein Konflikt. |
| WhatsApp-Integration | **KEEP** | Briefing erwähnt WhatsApp als Kommunikationskanal (5.4, 6.3), Echo's Cloud-API-Pipeline passt. |

---

## 12. Risiko-Matrix (Top-10)

| # | Migration-Aspekt | Risiko | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Pipelines + Deals entfernen | Hoch | Datenverlust falls Patrick aktiv nutzt | Vor Removal: prüfen ob aktive Daten, Patrick entscheiden lassen, JSON-Export als Backup |
| 2 | Klassifizierung auf 3-Achsen migrieren | Hoch | Bestehende stakeholder_types/priority/depth_override müssen sinnvoll gemappt werden | Mapping-Tabelle erstellen + Migration als Suggestions (User bestätigt) statt direkter Schreiben |
| 3 | Tags-Modell auf eigene Tabelle + Cluster | Hoch | Tag-Arrays auf people/orgs/notes betrifft viele Code-Pfade | Schrittweise Doppelschreiben (alt + neu), dann alt entfernen |
| 4 | how_we_met-Feld als Goldfeld einführen | Mittel | Bestehende notes-Inhalte könnten teils umgehängt werden | Migration: für jede Person die ersten notes-Sätze als how_we_met-Vorschlag mit User-Bestätigung |
| 5 | mode-Achse + Auto-Transitions | Mittel | Edge Function-Cron-Verlässlichkeit | Anfangs nur Mark-as-dormant ohne reconnect-Trigger; Trigger später wenn PDL läuft |
| 6 | PDL-Integration | Mittel | API-Kosten + Falsche Matches | Cache 30 Tage + Soft-Match (Suggestion statt direkt schreiben) |
| 7 | Suggestions-Tabelle als zentrale AI-Schreib-Pipeline | Mittel | Viele bestehende AI-Flows umschreiben | Pro Flow einzeln umstellen, alte parallel laufen lassen |
| 8 | Server-Actions statt API-Routes | Mittel | Concurrency-Bugs, viele Refactor-Punkte | Schrittweise, neue Mutations zuerst, alte beibehalten |
| 9 | how_we_met / first_name / linkedin_url / photo_url als Person-Felder | Niedrig | Schema-Migration auf produktiver Tabelle | Nullable Spalten, keine NOT NULL |
| 10 | Workflow-Editor entfernen | Niedrig | Patrick hat es ausgiebig gebaut | Vorab Backup, sauberes Removal, evtl. read-only-Archiv-Modus |

---

## 13. Empfehlung Refactor vs. Parallel-Neubau

Per ECHO_SETUP.md-Heuristik:
- "<40% ersetzen → Refactor"
- ">70% ersetzen → Parallel-Neubau"

**Quantifizierter Delta** (aus Inventur Sektion 9):
- KEEP: ~45-55% (Voice-Console, vCard-Import, Search, Org-Modell, Calendar/Gmail/WA-Sync, Duplicate-Merge, Reminders/Todos/Notes-Basis, Tool-Use-Pipeline)
- REFACTOR: ~25% (Klassifizierung-Achsen, Tag-System, Person-Felder, Quick-Add-Form, Heute-Dashboard, API→Server-Actions)
- REPLACE/REMOVE: ~20% (Pipelines+Deals, Workflows, Multi-Model-Catalog, tote connections-Tabelle, depth_override/strength_score/stakeholder_subtypes)
- BUILD: ~10% (Suggestions-Tabelle, PDL, Voice-Note-STT, Push, Mode-Transitions, how_we_met-Field, Cluster-Tags-Engine)

**Empfehlung: REFACTOR in Phasen.** Delta liegt bei ~30% REPLACE+BUILD-Anteil, klar unter der 70%-Schwelle. Parallel-Neubau wäre teurer und würde existierende Voice-Console + sync-Infrastruktur weggeben.

Aber: das Achsen-Modell ist ein **harter Bruch** im DB-Schema und in vielen UI-Stellen. Migration muss sorgfältig in 3 Slices laufen (purpose → depth → mode), wie ECHO_SETUP.md vorschlägt.

---

## 14. Decisions (resolved 11. Mai 2026)

Alle 10 Fragen sind beantwortet. Decision-Log:

1. **Pipelines + Deals**: HIDDEN behalten. Sidebar entlinken, `/pipelines/*` Route auf `notFound()` für neue User. Code+Tabellen bleiben (kein Datenverlust).
2. **Workflows / Voice Vibe Integrations**: KEEP for now. Kein Removal, kein Hidden. Bleibt funktional.
3. **Multi-Model-Catalog `/models`**: BEHALTEN. Alle 14 Catalog-Einträge bleiben, `/models` bleibt, BYO-Keys für alle Provider möglich. Kein TRIM.
4. **Gamification (Streaks/XP/Level)**: KEEP für jetzt. Streaks-Tab bleibt sichtbar.
5. **Quick-Add-Form**: 4-Felder primary + Advanced-Toggle mit 7 ausgewählten Feldern (company, role, phone, email, tags-mit-Cluster-Hint, met_date, met_location).
6. **`/` Route**: Voice-Console bleibt auf `/`. Heute-Dashboard kommt auf neue Route `/heute` (oder `/today`).
7. **`scope`-Spalte**: LÖSCHEN. Wird durch `purpose` (5 Werte) abgelöst. Drop in Phase F nach Verifikation.
8. **stakeholder_types → purpose Mapping**: Suggestion-Flow (kein Auto-Write). Migration-Skript schreibt eine `suggestions`-Row pro bestehender Person, User bestätigt auf der Person-Detail-Page.
9. **Supabase EU-Region**: ✓ ist EU. Keine Action.
10. **`deleted_at` vs `archived`**: `deleted_at timestamptz` behalten (Echo-Konvention). CLAUDE.md-Korrektur in Phase 0: Database-Conventions-Sektion klarstellen.

---

## Nächste Schritte

1. **MIGRATION_PLAN.md** im Repo-Root enthält den finalen Plan basierend auf diesen Decisions (7 Phasen, 15-17 d gesamt).
2. **Approval-Trigger:** „Migration Plan freigegeben - start Phase 0"
3. Bis Approval: keine Code-Änderungen.

---

Ende Gap-Analyse. Status: **ALL OPEN QUESTIONS RESOLVED** — bereit für Migration-Plan-Approval.
