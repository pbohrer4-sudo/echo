# Briefing v3 - Gap Analysis

Stand: 13. Mai 2026 · Vergleich `ECHO_FINAL_UI_BRIEFING.md` (v3, neu erhalten) gegen aktuellen `refactor/3-axis-model` Branch.

---

## TL;DR

Briefing v3 ist eine wesentlich umfangreichere Vision als unsere bisherige Migration. Drei Lager:

- **A — In v3 anders gewollt als in unserer aktuellen Umsetzung** (4 direkte Konflikte): erst klären, dann Migration fortsetzen.
- **B — Komplett neue Features in v3** (16 Punkte): pro Punkt entscheiden ob jetzt, später, oder nie.
- **C — Bereits in Echo abgedeckt** (8 Punkte): kein Action nötig.

---

## A. DIREKTE KONFLIKTE zu Phase A3-A8 (4 Punkte)

Diese Punkte stehen in **direktem Widerspruch** zu dem was wir bereits in 0023 gebaut haben.

### A.1 `mode`-Spalte: v3 sagt RAUS, wir haben sie GERADE ERST hinzugefügt

**Briefing v3 Section 24 #2**: „Mode-Feld raus - Active/Dormant live berechnet"

**Echo aktuell**: `mode` Spalte mit 5 Enum-Werten (active/nurture/dormant/reconnect/archive) + `next_nudge_at` + 2 partial-Indizes + ModeBadge-Component (C1). Das ganze 3-Achsen-Modell, das wir gerade gebaut haben.

**Konflikt-Tiefe**: Maximum. Phase A3 + C1 sind quasi obsolet falls wir Briefing v3 folgen.

**Meine Empfehlung**: **Mode behalten**.
- Live-Berechnung kollabiert mode + cadence + last_contact_at zu einer Logik. Klingt elegant, ist aber starr — kein manueller Override für „diese Person ist im Sabbatical, also dormant" möglich.
- Mode als Spalte ist 30 Sekunden DB, ein paar Server-Cron-Lines. Live-Berechnung ist überall Code wo wir den Status brauchen.
- Briefing v3 widerspricht sich selbst: Section 5 enthält `depth_source` und `purpose` als Spalten — warum ist mode anders?

**Was tun**: Mode bleibt. v3-Logik („active/dormant live berechnet") nehmen wir als Cron-Job auf, der den Mode auf der Spalte AKTUALISIERT, nicht ersetzt.

### A.2 `first_name`/`last_name`: v3 sagt RAUS, wir haben sie GERADE ERST hinzugefügt

**Briefing v3 Section 24 #3**: „first_name, last_name raus"

**Echo aktuell**: In 0023 hinzugefügt, daneben behalten das alte `name`-Feld.

**Meine Empfehlung**: **first_name/last_name droppen**.
- Briefing-konsistent („Name als ein Feld") spart UI-Komplexität (kein Split-Form, keine „first or full name?"-Frage)
- Wir haben in 0023 first_name + last_name DAZUGEFÜGT, nicht ersetzt. Das alte `name` lebt weiter. Daten-Schaden = null.
- Drop in Phase F mit dem Rest der Legacy-Reinigung.

**Was tun**: Drop in Phase F (nicht jetzt), entferne aus dem types.ts-Wrapper.

### A.3 `met_date`/`met_location` auf people: v3 sagt RAUS

**Briefing v3 Section 24 #4**: „met_date, met_location, notes raus"

**Echo aktuell**: Beide Felder in 0023 hinzugefügt + im Quick-Add-Form sichtbar.

**Aber**: Briefing v3 Section 5 SQL für `persons` Tabelle hat `how_we_met` drin (behalten). Die met_date/met_location-Drops referenzieren wohl die alte Version mit eigenen Spalten.

**Meine Empfehlung**: **met_date + met_location behalten, met_event aber droppen**.
- Briefing nennt diese Felder nirgendwo positiv. Section 24 ist gegen sie.
- ABER: Praktischer Nutzen ist da. „Kennengelernt am 14.06.2024 auf der Bauma" ist konkreter als das im how_we_met-Freitext zu verstecken.
- Kompromiss: zwei Felder behalten, das dritte (met_event) ist redundant zum how_we_met-Text.

**Was tun**: met_event droppen. met_date + met_location bleiben. Patrick entscheidet bei nächstem Sync.

### A.4 `archived` boolean vs `deleted_at` timestamptz

**Briefing v3 Section 5 Konventionen**: „Soft-Delete via `archived` Boolean"

**Echo aktuell**: `deleted_at timestamptz` durchgängig.

**Discovery-Decision Q10**: deleted_at behalten (Echo-Konvention).

**Konflikt-Tiefe**: Niedrig. Beide Patterns funktionieren. Unterschied: deleted_at gibt Timestamp, archived nicht.

**Meine Empfehlung**: **`deleted_at` behalten**. Wie bei Discovery entschieden. Briefing-Text als CLAUDE.md-Korrektur dokumentieren (haben wir).

---

## B. NEUE FEATURES in v3 (16 Punkte)

Pro Punkt: was Briefing fordert, was Echo aktuell hat, Empfehlung.

### B.1 APP_CONFIG + Kindra-Branding

**v3**: `lib/config.ts` mit `APP_CONFIG.PUBLIC_NAME` aus ENV. Code-Name bleibt "echo", Public-Name = "Kindra" via Env-Variable, Domain = "mykindra.ai".

**Echo aktuell**: Keine APP_CONFIG. Strings hardcoded ("ECHO" im Sidebar, "ECHO" im Voice-Orb, "Echo" in Mails).

**Empfehlung**: **ADOPT** — sehr niedrige Migration-Kosten (1 File anlegen + ~30 String-Substitutionen), riesiger Hebel falls Patrick rebrand will. Auch wenn der finale Name unklar ist, ist die ENV-Abstraktion future-proofing.

**Aufwand**: 2-3h. **Priorität**: hoch (bevor mehr UI-Code geschrieben wird).

### B.2 Design Tokens + Plus Jakarta Sans + DM Mono

**v3**: `lib/design-tokens.ts` als Single Source of Truth, Plus Jakarta Sans (Sans) + DM Mono (Mono), 6 Tag-Cluster-Farbpärchen, kein hardcoded Hex.

**Echo aktuell**: Tailwind v4 `@theme`-Tokens (paper/ink-1-5/action/signal) in globals.css. Eigene Fonts via system-stack. Keine zentrale Design-Token-TS-Datei. Hardcoded oklch-Werte in einigen Components (Suggestion-Card, Tag-Colors in types.ts).

**Empfehlung**: **PARTIAL ADOPT** — Design-Tokens-TS als Mirror der bereits existierenden CSS-Tokens anlegen (eine Stunde). Fonts wechseln (Plus Jakarta Sans + DM Mono) ist nice-to-have, nicht kritisch — Echo's aktuelle Typographie sieht gut aus.

**Aufwand**: 3-4h falls Fonts mit. **Priorität**: mittel.

### B.3 Tag-Cluster-Schema komplett anders

**v3**: **4 Tag-Cluster** (reminders, interests, potential, origin) + **2 separate Tabellen** (passions, circles) = 6 visuelle Cluster.

**Echo aktuell**: 4 Tag-Cluster (context, topic, value, trigger). Keine passions, keine circles.

**Konflikt-Tiefe**: Hoch. Das ist eine andere mentale Karte.

**Empfehlung**: **DEEP REVIEW** — die v3-Cluster (reminders/interests/potential/origin) machen mehr semantischen Sinn als unsere (context/topic/value/trigger). Aber: wir haben gerade die Tags migriert mit topic-Default. Wechsel würde alle 13 Tags neu einsortieren.

**Optionen**:
- a) Cluster-Namen umtaufen: context→origin, topic→interests, value→potential, trigger→reminders. Daten-Migration via UPDATE-Statement. Aber: passion+circle als separate Tabellen einführen.
- b) v3 1:1 übernehmen: tags-Schema komplett umbauen, passions+circles als neue Tabellen, max-5-für-passions enforcen.
- c) Wir behalten unser Schema und ignorieren das v3-Tag-Modell.

**Aufwand**: 6-8h. **Priorität**: hoch, wenn wir v3 ernst nehmen. Mittel, wenn nicht.

### B.4 UI-Labels in eigener `lib/labels.ts`

**v3 Section 5**: `DEPTH_LABELS` mit englischen Labels (Inner Circle, Core, Regulars, Network, Acquaintances), Pflicht über `lib/labels.ts`. P0-Verstoß: DB-Werte im UI rendern.

**Echo aktuell**: `DEPTH_LABELS` in `lib/types.ts` mit deutschen Labels (Innerer Kreis, Vertrauter Kreis, etc.).

**Empfehlung**: **PARTIAL ADOPT** — eigenes `lib/labels.ts` extrahieren (10 min), aber **bei deutschen Labels bleiben** (Echo ist deutsche App). v3-Labels sind englisch, Patrick UI ist deutsch. Briefing-Section sagt „Deutsch und Englisch identisch" — möglich, aber bisher unsere Direction.

**Aufwand**: 30 min. **Priorität**: niedrig.

### B.5 person_contacts als separate Tabelle

**v3**: `person_contacts` für alle Kommunikationswege (phone/email/whatsapp/linkedin/sms). „Hardcoded contact-Felder raus".

**Echo aktuell**: phones/emails/addresses/socials als JSONB-Arrays auf people.

**Empfehlung**: **DEFER** — JSONB-Pattern funktioniert für Echo's Single-User-Setup. Eigene Tabelle hat Vorteile (Indizes, Constraints, Search), aber Migration-Kosten sind hoch (UI muss umgebaut werden, lib/people.ts queries, vCard-Import-Code, Voice-Extract-Tool-Schemas).

**Aufwand**: 1-2 Tage. **Priorität**: niedrig — JSONB tut's für jetzt.

### B.6 person_relationships als separate Tabelle (bidirektional)

**v3**: Beziehungen in eigener Tabelle mit Auto-Detection aus how_we_met, Fuzzy-Match >80%.

**Echo aktuell**: relationships JSONB-Array auf people. Bidirektionale Logik bei Insert (mirrored entries).

**Empfehlung**: **DEFER** — gleiche Logik wie B.5. JSONB ist OK für Echo's Scale.

**Aufwand**: 1-1.5 Tage. **Priorität**: niedrig.

### B.7 person_geographies + Google Places

**v3**: Strukturierte Geo-Daten via Google Places (street, city, region, country, lat/lng, place_id).

**Echo aktuell**: addresses JSONB + AddressAutocomplete via Nominatim/OpenStreetMap.

**Empfehlung**: **DEFER** — Echo's OpenStreetMap-Setup funktioniert, kostet null, ist DSGVO-freundlich. Google Places bringt bessere Daten + place_id für Place-Deduplication, aber kostet pro Lookup ($-Aufwand) und erfordert Google Cloud Account.

**Aufwand**: 4-6h für Migration zu Google Places. **Priorität**: niedrig.

### B.8 Life Events Section

**v3 Section 11**: Komplett neue Tabelle `life_events` (photo/document/voice_note/milestone/note) + Junction `person_life_events`, Supabase Storage Bucket, Galerie-UI, Globale Lifeline-Ansicht.

**Echo aktuell**: **Nichts dergleichen**.

**Empfehlung**: **CONSIDER FOR PHASE 2** — schönes Feature, aber massive Bauarbeit (Storage-Setup, Upload-Flow, Thumbnail-Generation Edge Function, 2 Tabellen, Galerie-UI, Lifeline-View). Bei Echo's Solo-User-Stand kein Killer-Feature.

**Aufwand**: 3-4 Tage. **Priorität**: niedrig (Phase 2).

### B.9 REST API mit OpenAPI + Scalar Docs

**v3 Section 13**: Alle Endpoints unter `/api/v1/`, `createRouteHandler`-Wrapper, OpenAPI 3.1 auto-generated via `zod-to-openapi`, Scalar Docs auf `/docs/api`.

**Echo aktuell**: `/api/*` ohne Versionierung, ohne OpenAPI, ohne Scalar.

**Empfehlung**: **DEFER** — sinnvoll wenn Echo public-API wird. Für Patrick als Solo-User ist es Overhead.

**Aufwand**: 2-3 Tage. **Priorität**: niedrig (außer Patrick will MCP-Server, dann hängt's zusammen).

### B.10 MCP Server

**v3 Section 14**: `/app/mcp/route.ts`, Streamable HTTP Transport, 7 Tools (search_persons, get_person, create_person, add_interaction, get_sunday_pulse, generate_draft, find_intro_path), PAT-Auth.

**Echo aktuell**: **Nichts**.

**Empfehlung**: **CONSIDER** — sehr cool: Patrick könnte aus Claude Desktop direkt sein CRM abfragen, Drafts generieren lassen, Personen anlegen. Aber: braucht Auth-Layer (api_tokens-Tabelle), braucht REST-API-Backend, braucht PAT-Tokens. 1-Wochen-Projekt.

**Aufwand**: 5-7 Tage. **Priorität**: mittel (cool factor hoch, immediate value mittel).

### B.11 Voice-Provider-Abstraktion (für Phase-2 TML)

**v3 Section 12**: `VoiceProvider` Interface mit transcribe/converse/synthesize. OpenAI / Anthropic / ElevenLabs als Provider. Phase-2: TML-Interaction-Small.

**Echo aktuell**: WebSpeech API (Browser-built-in) + ElevenLabs TTS. Kein Provider-Layer.

**Empfehlung**: **ADOPT** (sobald wir an Voice rangehen) — Refactor von Voice-Code mit Provider-Interface kostet wenig und macht Phase 2 (TML) trivial.

**Aufwand**: 1-1.5 Tage. **Priorität**: mittel (vor next Voice-Feature).

### B.12 Push-to-Talk + ⌘Space Shortcut

**v3 Section 12**: Floating Mic-Button mobile, ⌘Space auf Desktop als Push-to-Talk.

**Echo aktuell**: Voice-Orb auf `/`. Klick. Kein Floating-Button, kein Shortcut.

**Empfehlung**: **ADOPT** — Floating Mic-Button + ⌘Space sind klein und wertvoll für Voice-First.

**Aufwand**: 4-6h. **Priorität**: mittel.

### B.13 BYOK + Quota-Pattern

**v3 Section 16-17**: `user_api_keys` (encrypted via Supabase Vault) + `quota_usage` Tracking + 4-stage UI (Comfort → Warn → Soft-Degradation → Hard-Cap Modal). Free-Plan: 30 Voice-Min/Woche, 200 AI-Drafts, 50 PDL.

**Echo aktuell**: `byo_keys` JSONB auf profiles (Anthropic + ElevenLabs). Stripe-Subscriptions seit Patrick's parallel-Commit. Keine Quotas, keine 4-Stage-UI.

**Empfehlung**: **DEFER** — sehr aufwändig (encryption, 4-Stage-UI, Quota-Tracking-Cron). Erst nötig wenn Echo public ist. Patrick als Solo-User: Stripe-Subscription reicht.

**Aufwand**: 4-5 Tage. **Priorität**: niedrig.

### B.14 Capacitor + iOS/Android

**v3 Section 3**: Capacitor 6+ von Anfang an, iOS und Android Targets, 7 Plugins (Contacts, Push, Local-Notifications, Calendar, Camera, Haptics, Filesystem).

**Echo aktuell**: Web-only, PWA-Setup teilweise vorhanden (Phase E Plan).

**Empfehlung**: **DEFER** — riesiger Aufwand (Bundle-IDs entscheiden, Apple/Google Developer Accounts, Native-Setup, Capacitor-Plugins). Für Patrick allein nicht nötig — Web auf iOS Safari + PWA-Install funktioniert.

**Aufwand**: 1-2 Wochen. **Priorität**: niedrig (Phase 3).

### B.15 Onboarding-Wizard (4 Screens)

**v3 Section 21**: 4 Onboarding-Screens (Schichten, KI-Anreicherung, Sonntags-Puls, API-Keys).

**Echo aktuell**: Keiner.

**Empfehlung**: **DEFER** — Patrick ist alleiniger User, kein Onboarding nötig. Wird relevant bei public Launch.

**Aufwand**: 1 Tag. **Priorität**: sehr niedrig.

### B.16 SEO + AI-Discovery (/llms.txt + JSON-LD + MDX-Docs)

**v3 Section 15**: `/llms.txt`, `/robots.txt` mit Bot-Allowlist, JSON-LD Schema, MDX-basierte Docs auf `/docs`.

**Echo aktuell**: Standard Next.js `/robots.txt`, kein `/llms.txt`, keine MDX-Docs.

**Empfehlung**: **DEFER** — relevant für Public-Launch. Solo-User braucht keine SEO.

**Aufwand**: 4-6h. **Priorität**: sehr niedrig.

---

## C. BEREITS ABGEDECKT (8 Punkte)

Dinge die v3 verlangt, die Echo schon hat (manchmal anders, aber funktional):

| Punkt | v3 sagt | Echo hat |
|---|---|---|
| C.1 Depth-Achse mit 5 Werten | inner_5...periphery_500 | ✓ identisch |
| C.2 Purpose-Achse mit 5 Werten | personal...aspirational | ✓ identisch |
| C.3 Suggestions-Tabelle | suggestions + Type-Enum | ✓ + Apply-Layer (B1) |
| C.4 how_we_met als Goldfeld | text, 1-3 Sätze | ✓ in 0023 + Quick-Add |
| C.5 interactions.external_id | für Gmail/Calendar-Sync | (X) — Echo hat `external_events`-Tabelle, kein external_id auf interactions. Lösung: Spalte adden, vorhandene Calendar-Sync-Logik umstellen. **Sollten wir adden — 30 min Arbeit.** |
| C.6 interactions.direction | inbound/outbound/mutual | ✓ in 0023 |
| C.7 Stripe Subscriptions | Pro 9 EUR/Monat | ✓ Patrick hat das schon eingebaut |
| C.8 deleted_at vs archived | deleted_at | ✓ (per Discovery Q10) |

---

## STRATEGISCHE EMPFEHLUNG

**Phase-1 — sofort (1-2 Tage):**

1. **A.1 mode behalten** — keine Action, Briefing v3-Konflikt ignorieren
2. **A.2 first_name/last_name in Phase F droppen** — Phase F Tasklist erweitern
3. **A.3 met_event droppen, met_date + met_location behalten** — Phase F Tasklist
4. **A.4 deleted_at behalten** — keine Action
5. **B.1 APP_CONFIG anlegen** — Branding ENV-driven (2-3h)
6. **C.5 external_id auf interactions** — Calendar-Sync-Konsistenz (30 min)

**Phase-2 — wenn Phase C fertig (Tage-bis-Wochen):**

7. **B.3 Tag-Cluster-Schema entscheiden** — v3-Modell (reminders/interests/potential/origin + passions/circles) oder bei aktuellem bleiben?
8. **B.11 Voice-Provider-Abstraktion** — vor nächsten Voice-Features
9. **B.12 ⌘Space + Floating Mic** — Voice-First-Polish

**Phase-3 — Public-Launch-Vorbereitung (Wochen, optional):**

10. **B.10 MCP Server** — coolest neues Feature
11. **B.9 REST API + OpenAPI**
12. **B.8 Life Events Section**
13. **B.15 Onboarding-Wizard**
14. **B.13 BYOK + Quota-Pattern**

**Nie / Phase-4 — wenn Echo wirklich public geht:**

15. **B.14 Capacitor + Mobile Apps**
16. **B.16 SEO + /llms.txt**

---

## OFFENE FRAGEN AN PATRICK

1. **Tag-Cluster (B.3)**: Bei aktuellen 4 Clustern (context/topic/value/trigger) bleiben, oder auf v3-Set umstellen (reminders/interests/potential/origin) + separate `passions` und `circles` Tabellen?

2. **Branding (B.1)**: Public-Name künftig „Kindra"? Falls ja: APP_CONFIG jetzt einführen + Sidebar-Logo + Mail-Templates updaten. Falls nicht entschieden: APP_CONFIG anlegen mit „Echo" als Default.

3. **Mode-Konflikt (A.1)**: OK dass wir bei Mode-als-Spalte bleiben gegen v3-Empfehlung?

4. **Met-Felder (A.3)**: met_event droppen OK, met_date + met_location behalten OK?

5. **Was zuerst nach Phase A**: 
   - (a) C4-C6 wie geplant durchziehen (Heute-Dashboard, People-Liste-Filter, Tag-UI)
   - (b) Quick-Wins aus v3 jetzt (APP_CONFIG + external_id + Phase-F-Drops vorziehen)
   - (c) Tag-Cluster-Migration v3-Style (B.3) — wenn ja, dann sehr früh weil noch wenig Tag-Daten

Sag mir Antworten auf 1-5, dann passe ich die Migration-Plan-Reihenfolge an und gehe weiter.
