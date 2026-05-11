# Personal CRM - Build Briefing

Owner: Patrick Bohrer
Version: 1.0
Datum: 11. Mai 2026
Zweck: Vollständige Spezifikation zur Entwicklung eines Personal CRM für Super-Networker, optimiert auf minimale Klicks und maximale KI-Unterstützung.

---

## 1. Produkt-Vision in einem Satz

Ein Personal CRM, das wie ein erweitertes Gedächtnis funktioniert: Du gibst Rohmaterial rein (Name, ein Satz "wie kennengelernt"), die KI extrahiert, klassifiziert und schlägt vor - du bestätigst mit einem Tap.

## 2. Kern-Designprinzipien

1. 3-Klicks-Regel: Vom Hinzufügen bis zum vollständigen Profil maximal 3 Klicks.
2. KI klassifiziert, Mensch bestätigt: Pflichtfelder sind minimal. Alles andere wird vorgeschlagen.
3. Orthogonale Klassifizierung: Tiefe, Zweck und Modus sind drei unabhängige Achsen. Keine Vermischung.
4. Fluide Kategorien: Tiefe und Modus werden automatisch neu berechnet, niemand muss manuell "umstufen".
5. Schuldgefühl-frei: "Dormant" ist okay. Niemand muss alle 500 Kontakte aktiv pflegen.
6. Sonntags-Puls als Killer-Feature: Das proaktive Reach-Out ist das, was den Wert generiert.

## 3. Datenmodell

### 3.1 Entity: Person


```
id: uuid
created_at: timestamp
updated_at: timestamp

# Identität (KI-anreicherbar)
name: string (Pflichtfeld)
first_name: string
last_name: string
company: string (nullable)
role: string (nullable)
industry: enum (Tech/FinTech/HealthTech/Construction/Consumer/Industrial/Public/Media/Education/Other)
function: enum (Founder/Exec/Operator/IC/Investor/Advisor/Student/Other)
photo_url: string (nullable)
linkedin_url: string (nullable)

# 3-Achsen-Klassifizierung
depth: enum (inner_5 / trusted_15 / active_50 / network_150 / periphery_500)
depth_source: enum (auto / manual_override)
purpose: enum (personal / family / business_active / business_latent / aspirational)
mode: enum (active / nurture / dormant / reconnect / archive)

# Erst-Kontext (Goldfeld)
how_we_met: text (Freitextfeld, dient als KI-Input für Tags und Anreicherung)
met_date: date (nullable)
met_location: string (nullable)

# Kontakt-Cadence
expected_cadence_days: integer (vorgeschlagen von KI basierend auf depth)
last_contact_at: timestamp
next_nudge_at: timestamp (errechnet aus last_contact + expected_cadence)

# Aktuelle Action
current_cta: string (nullable, z.B. "Marvin vorstellen")
cta_due_at: date (nullable)
cta_priority: enum (a / b / c / null)

# Geo
home_location: string (nullable)
current_location: string (nullable, für reisende Kontakte)

# Beziehungen zu anderen Personen
relationships: array of { related_person_id: uuid, type: enum (family/friend/colleague/introduced_by/manager/report/founder_partner/...), label: string }

# Tags (max. 7 pro Person, KI-vorgeschlagen)
tags: array of Tag

# Soft-Delete
archived: boolean
notes: text (lange Notizen, durchsuchbar)
```



### 3.2 Entity: Tag

Tags sind flach, nicht hierarchisch. Jeder Tag hat ein semantisches Cluster:


```
id: uuid
name: string (slug, z.B. "bauma-2025", "construction-tech")
cluster: enum (context / topic / value / trigger)
created_by: enum (user / ai_suggested / ai_extracted)
usage_count: integer
```



Cluster-Definitionen:

- context: Woher kenne ich die Person? (Events, Quellen, Vermittler)
  Beispiele: bauma-2025, linkedin-inbound, mvr-introduced, cold-outreach
- topic: Worüber reden wir, was verbindet uns?
  Beispiele: construction-tech, b2b-saas, longevity, wein, segeln
- value: Wie können wir uns helfen?
  Beispiele: kann-introducen, hat-budget-2026, sucht-investment, mentor-fuer-vertrieb
- trigger: Zeitliche oder aktionsbezogene Marker?
  Beispiele: q3-follow-up, geburtstag-26-march, kind-2025-geboren, neuer-job-jan-26

### 3.3 Entity: Interaction

Jede Notiz, jeder Kontakt, jedes Treffen wird als Interaktion gelogged.


```
id: uuid
person_id: uuid
interaction_type: enum (call / meeting / email / whatsapp / linkedin_dm / coffee / dinner / event / note / other)
direction: enum (inbound / outbound / mutual)
occurred_at: timestamp
duration_minutes: integer (nullable)
summary: text
sentiment: enum (positive / neutral / negative / null)
ai_extracted_facts: jsonb (nullable)
source: enum (manual / voice_note / email_forward / calendar_sync / whatsapp_export / linkedin_dm)
```



### 3.4 Entity: Suggestion

Vorschläge der KI, die der User bestätigen oder verwerfen kann. Niemals automatisch übernommen.


```
id: uuid
person_id: uuid
suggestion_type: enum (tag / cadence / cta / connection / reconnect / depth_change / mode_change / merge_duplicate)
payload: jsonb
reasoning: text
created_at: timestamp
status: enum (pending / accepted / rejected / dismissed)
```



## 4. Die 3-Achsen-Klassifizierung im Detail

### 4.1 TIEFE (Depth) - "Wie nah?"

Basiert auf Dunbar's Layered Model (Oxford, evolutionspsychologisch validiert).

| Wert | Anzahl typisch | Standard-Cadence | Was charakterisiert diese Schicht? |
|------|---------------|------------------|-------------------------------------|
| inner_5 | 1-5 | 14 Tage | Engste Confidants, Familie, Co-Founder, beste Freunde |
| trusted_15 | 6-20 | 30 Tage | Sympathy Group: enger Freundeskreis, Schlüssel-Kollegen, Top-Mentoren |
| active_50 | 20-60 | 90 Tage | Affinity Group: gute Freunde, regelmäßige Geschäftskontakte |
| network_150 | 60-200 | 180 Tage | Full Active Network: alle bewusst gepflegten Kontakte |
| periphery_500 | 200-2000 | 365 Tage | Erweitertes Netzwerk, Bekannte, schwache Bindungen |

Wichtig: Die Cadence ist ein Vorschlag. Der User kann pro Person überschreiben. Die Tiefe wird automatisch von der KI berechnet basierend auf Interaktionsfrequenz, kann aber manuell überschrieben werden (Feld depth_source).

Auto-Berechnung der Tiefe (Algorithmus):


```
Anzahl Interaktionen letzte 12 Monate:
  >= 24  -> inner_5 (alle 2 Wochen)
  >= 12  -> trusted_15 (alle Monat)
  >= 4   -> active_50 (alle 3 Monate)
  >= 2   -> network_150 (alle 6 Monate)
  >= 1   -> periphery_500 (jährlich)
  = 0    -> mode wird auf "dormant" gesetzt, depth bleibt unverändert
```



### 4.2 ZWECK (Purpose) - "Warum verbunden?"

Basiert auf Ferrazzi (Never Eat Alone). Eine Person hat genau einen Zweck. Doppelrollen lösen wir über Tags.

| Wert | Beschreibung |
|------|--------------|
| personal | Freunde, soziale Kontakte, keine Business-Komponente |
| family | Familie und enges familiäres Umfeld |
| business_active | Aktuelle Kunden, Partner, Kollegen, Investoren, Mitarbeiter |
| business_latent | Ehemalige Kollegen/Kunden, Industrie-Kontakte, schwache Bindungen mit Business-Bezug |
| aspirational | Personen, die ich noch nicht gut kenne, aber bewusst aufbauen will |

Hinweis: "Aspirational" ist die mächtigste Kategorie - sie macht das CRM zum Werkzeug für proaktives Netzwerk-Wachstum.

### 4.3 MODUS (Mode) - "Was ist gerade?"

Wird primär automatisch berechnet. Beschreibt den aktuellen Zustand der Beziehung.

| Wert | Bedeutung | Trigger |
|------|-----------|---------|
| active | Regelmäßiger Kontakt im Rahmen der erwarteten Cadence | letzte Interaktion < expected_cadence |
| nurture | Bewusstes Pflegen, Cadence wird gehalten | manuell gesetzt für Aspirational-Kontakte |
| dormant | Längere Zeit kein Kontakt, aber nicht verloren | letzte Interaktion > 2x expected_cadence |
| reconnect | Aktive Empfehlung zur Wiederaufnahme | dormant + KI sieht Anlass |
| archive | Bewusst pausiert oder beendet | manuell |

## 5. Eingabe-Flows

### 5.1 Quick-Add (Standard-Eingabe)

4-Felder-Formular:

1. Name (Pflichtfeld)
2. Wie kennengelernt? (Freitextfeld, 1-3 Sätze - das KI-Goldfeld)
3. Zweck (1 Klick aus 5 Optionen)
4. Tiefe-Initial (1 Klick aus 5 Optionen, oder leer lassen = KI rät später)

Nach dem Speichern läuft im Hintergrund:
- LinkedIn-Suche per Name + ggf. Firma aus Freitext
- KI-Extraktion aus how_we_met: Firma, Rolle, Ort, mögliche Tags, mögliche Beziehungen
- KI-Vorschlag: 3-5 Tags aus den semantischen Clustern
- KI-Vorschlag: Cadence basierend auf Tiefe + Zweck
- KI-Vorschlag: erster CTA, falls aus Freitext ableitbar

User-Feedback-Loop: Alle KI-Vorschläge erscheinen auf der Detail-Seite als anklickbare Cards mit 3 Optionen: Akzeptieren / Ablehnen / Anpassen.

### 5.2 Voice-Note-Add (Premium-Eingabe)

User spricht 20-60 Sekunden ins Mikro. Beispiel:
"Ich hab gerade Alexander Erhardt getroffen, war bei der Bauma am Capmo-Stand, ist Head of Digital bei einem Bauunternehmen in München, sucht Lösung für Foto-Doku auf Baustellen. Gemeinsamer Bekannter ist Marvin."

KI extrahiert: Name, Firma-Hinweis, Rolle, Ort, Tags (bauma-2025, capmo-stand, construction-tech, foto-doku), Beziehung zu Marvin, CTA (Demo-Termin), Zuordnung (business_active, network_150).

### 5.3 Email-Forward-Add

User leitet E-Mail an crm-add@personal-crm.app weiter. KI erkennt Absender, gleicht ab, erstellt neuen Kontakt oder loggt Interaktion, fasst E-Mail zusammen, schlägt CTA und Tags vor.

### 5.4 Visitenkarten-Foto-Add

User fotografiert Visitenkarte. OCR + LinkedIn-Suche + Anreicherung. User ergänzt nur how_we_met per Freitext oder Voice-Note.

## 6. Sonntags-Puls (Killer-Feature)

### 6.1 Konzept

Jeden Sonntag um 19:00 Uhr lokale Zeit erhält der User eine Push-Benachrichtigung mit max. 5 priorisierten Reach-Out-Vorschlägen für die kommende Woche.

### 6.2 Auswahl-Algorithmus

Priorität (sortiert):

1. CTAs mit Deadline diese Woche (immer Priorität 1)
2. Inner 5 + Trusted 15, deren Cadence überfällig ist
3. Reconnect-Kandidaten (dormant + KI-Anlass)
4. Aspirational-Kontakte ohne Aktivität >30 Tage
5. Trigger-Tags der Woche (Geburtstage, Jahrestage, Lebensereignisse)

### 6.3 UI

Pro Vorschlag:
- Foto, Name, letzter Kontakt-Zeitpunkt, Tiefe-Badge
- Kontext-Zeile: "42 Tage kein Kontakt, du wolltest ihm Marvin vorstellen"
- 1-Klick-Aktionen: WhatsApp / E-Mail / LinkedIn (vorab vom AI formulierter Entwurf)
- Snooze (1 Woche / 1 Monat / Custom)
- Erledigt (loggt Interaktion automatisch nach dem Senden)
- Nicht jetzt (verschiebt um Cadence-Intervall)

### 6.4 Wochenrückblick

Am Sonntag-Morgen ein kurzer Rückblick:
- "Diese Woche hattest du Kontakt mit X Personen aus deinem Inner 15"
- "Y Reconnects erfolgreich"
- "Z neue Personen hinzugefügt"

## 7. KI-Komponenten

### 7.1 Enrichment-Pipeline

Asynchroner Background-Job, ausgelöst bei jedem neuen Kontakt:

1. LinkedIn-Suche (People Data Labs API / Apollo.io / Clearbit)
   Input: name + company + email/phone (falls vorhanden)
   Output: linkedin_url, photo_url, role, company, location

2. Company-Anreicherung
   Input: company name
   Output: industry, employee_count, website, business_model

3. Field-Extraction aus how_we_met
   LLM-Call (Claude Sonnet 4.5)
   Output: JSON mit company, role, location, met_event, mentioned_people, possible_tags, possible_cta

### 7.2 Tag-Suggestion-Engine

Bei jeder neuen Person oder Interaktion:
- Vergleiche bestehende Tags der gleichen Industrie/Firma/Region
- Schlage die häufigsten 3-5 Tags vor
- Konsolidierungs-Vorschläge bei ähnlichen Tags

### 7.3 Connection-Discovery

Wöchentlicher Background-Job:
- Implizite Verbindungen (gleiche Firma, gleicher Tag, gleicher Standort)
- Synergetische Verbindungen über Value-Tags

### 7.4 Reconnect-Trigger

Background-Scan auf:
- LinkedIn-Jobwechsel
- Geburtstage und Jahrestage in Trigger-Tags
- Industry-News über die Firma der Person

## 8. UI-Spezifikation

### 8.1 Layout-Prinzip

Drei Hauptansichten:

1. Heute (Default-View)
   - Aktuelle CTAs (überfällig + heute fällig)
   - Sonntags-Puls-Liste (immer sichtbar, max. 5)
   - Pending Suggestions zum Bestätigen

2. People
   - Filterbar nach Tiefe, Zweck, Modus, Tags
   - Suchfeld (volltext)
   - Standard-Sortierung: Tiefe absteigend, dann letzter Kontakt

3. Hinzufügen (Floating Action Button)
   - Quick-Add (4-Felder-Formular)
   - Voice-Note
   - Visitenkarten-Foto
   - E-Mail-Forward-Hinweis

### 8.2 Personen-Detailseite (Blöcke von oben nach unten)

Block 1: Header
- Foto, Name, Rolle, Firma
- 3-Achsen-Badge (Tiefe / Zweck / Modus) - klickbar zum Ändern
- Letzte Interaktion (Datum + Typ)
- Nächste Cadence-Fälligkeit

Block 2: Aktion
- Aktueller CTA (falls vorhanden) mit Due-Date
- Quick-Actions: Log Interaction / Add Note / Voice-Note / Edit CTA

Block 3: KI-Vorschläge (nur sichtbar wenn pending)
- Card-Stack mit ablehnen/akzeptieren/anpassen

Block 4: Kontext
- Wie kennengelernt (editierbar)
- Tags (gruppiert nach Cluster)
- Geographien
- Wichtige Daten (Geburtstag, Jahrestage)

Block 5: Beziehungen
- Verknüpfte Personen mit Beziehungstyp
- Graph-Widget (optional, Phase 2)

Block 6: Interaktions-Timeline
- Chronologisch absteigend
- Filterbar nach Typ
- Inline-Bearbeitung

Block 7: Notizen
- Lange Notizen, durchsuchbar

### 8.3 Mobile-First

- Single-Column-Layout
- Quick-Add ist 1 Tap entfernt (Floating Button)
- Voice-Note als primäre Eingabe unterwegs
- Sonntags-Puls als eigene Mobile-Push-View
- Swipe-Gesten: rechts = "kontaktiert", links = "snooze"

## 9. Tech-Stack-Empfehlung

| Layer | Tool | Begründung |
|-------|------|------------|
| Frontend | Next.js 14 (App Router) + Tailwind + shadcn/ui | Moderne DX, gute Mobile-Performance |
| Backend / DB | Supabase (Postgres + Auth + Storage + Edge Functions) | Schnelle Iteration, gute API, RLS |
| KI-Layer | Claude Sonnet 4.5 (Anthropic API), Claude Haiku für günstige Tag-Vorschläge | Beste Extraction-Qualität |
| Enrichment | People Data Labs ODER Apollo.io | LinkedIn-Daten + Firmen-Daten |
| Voice-Transcription | OpenAI Whisper API oder Deepgram | Hohe Genauigkeit für Deutsch |
| OCR (Visitenkarten) | Google Cloud Vision oder Tesseract | Schnell und günstig |
| Push | OneSignal oder Expo Push | Einfache Integration |
| Hosting | Vercel + Supabase Cloud | Null DevOps |
| Optional Mobile | Expo (React Native) oder Capacitor | Code-Reuse mit Web |

## 10. Phasen-Plan

### Phase 1 - MVP (4 Wochen)

Ziel: 1 User (Patrick) kann das System produktiv nutzen.

- Datenmodell + Supabase-Setup
- Quick-Add-Formular (4 Felder)
- KI-Extraktion aus how_we_met via Claude API
- LinkedIn-Enrichment via People Data Labs
- Personen-Detailseite mit allen Blöcken
- Tag-System mit Cluster-Logik
- Manuelle Interaktions-Erfassung
- People-Liste mit Filtern

### Phase 2 - Automatisierung (2 Wochen)

- Sonntags-Puls inkl. Push-Notifications
- Auto-Modus-Berechnung
- Reconnect-Trigger-Engine
- Verbindungs-Discovery-Job
- WhatsApp/Email-Draft-Generator

### Phase 3 - Eingabe-Vielfalt (2 Wochen)

- Voice-Note-Eingabe mit Transcription
- E-Mail-Forward-Endpoint
- Visitenkarten-OCR
- LinkedIn-Chrome-Extension

### Phase 4 - Polish (laufend)

- Graph-Visualisierung der Beziehungen
- Erweiterte Analytics
- Multi-User (Team, falls relevant)
- Mobile-App (Expo)

## 11. KI-Prompts (Referenz für Implementierung)

### 11.1 Field Extraction from how_we_met


```
SYSTEM: Du bist ein CRM-Assistent. Deine Aufgabe ist es, aus einem deutschen Freitextfeld strukturierte Daten zu einer Person zu extrahieren.

Gib das Ergebnis als JSON zurück:
{
  "company": string | null,
  "role": string | null,
  "industry": "Tech"|"FinTech"|"HealthTech"|"Construction"|"Consumer"|"Industrial"|"Public"|"Media"|"Education"|"Other" | null,
  "function": "Founder"|"Exec"|"Operator"|"IC"|"Investor"|"Advisor"|"Student"|"Other" | null,
  "location": string | null,
  "met_event": string | null,
  "met_date_hint": string | null,
  "mentioned_people": string[],
  "suggested_tags": [{ "name": string, "cluster": "context"|"topic"|"value"|"trigger" }],
  "suggested_cta": string | null,
  "reasoning": string
}

USER: {{how_we_met_text}}
```



### 11.2 Cadence-Empfehlung


```
SYSTEM: Du bist ein Networking-Coach. Schlage eine angemessene Kontakt-Frequenz vor.

Input: Tiefe ({{depth}}), Zweck ({{purpose}}), Industrie ({{industry}}), bisherige Interaktionsfrequenz ({{frequency}}).

Output: { "days": integer, "reasoning": string }
```



### 11.3 Reconnect-Message-Draft


```
SYSTEM: Schreibe eine kurze, authentische Reconnect-Nachricht auf Deutsch im Stil von Patrick Bohrer.

Stil-Regeln:
- Niemals lange Em-Dashes verwenden, kurzes - oder umformulieren
- Niemals Bulletpoints in Messages
- Korrekte deutsche Umlaute (ä, ö, ü, ß)
- Direkt und persönlich, nicht KI-generiert klingend
- Kurz: 2-4 Sätze

Kontext:
- Person: {{name}}, letzter Kontakt vor {{days}} Tagen
- Letztes Gesprächs-Thema: {{last_summary}}
- Anlass für den Reconnect: {{trigger}}

Schreibe 3 Varianten:
1. Casual (WhatsApp)
2. Professionell (E-Mail)
3. Kontext-spezifisch (LinkedIn)
```


## 12. Privacy & Compliance

- DSGVO-konform: alle Daten in EU-Region (Supabase EU)
- Daten-Export: jederzeit als JSON oder CSV
- Daten-Löschung: vollständig, inkl. KI-Logs
- Verschlüsselung: at-rest und in-transit
- Enrichment-Anbieter: nur Public-Profile-Daten, keine sensiblen Daten extern
- Voice-Notes: nach Transcription optional automatisch löschen

## 13. Erfolgs-Metriken (nach 30 Tagen messen)

1. Add-Friction: Median-Zeit von "Person treffen" bis "im CRM gespeichert" - Ziel <60 Sekunden
2. Sonntags-Puls-Action-Rate: % der Vorschläge, bei denen Patrick wirklich reach outet - Ziel >50%
3. Inactive-Recovery: Anzahl Kontakte, die durch das System aus dormant zurück zu active geholt wurden - Ziel >10/Monat
4. Tag-Konsolidierung: KI-Vorschläge zur Tag-Bereinigung - Ziel <5 doppelte Tags nach 30 Tagen
5. CTA-Completion-Rate: % der CTAs, die innerhalb ihrer Due-Date erledigt werden - Ziel >70%

## 14. Was bewusst NICHT gebaut wird

- Klassisches Pipeline-Management (HubSpot's Job)
- Team-Kollaboration (Phase 4, optional)
- Mass-Mail / Broadcast-Funktionen
- Detaillierte Sales-Reports
- Komplexe Custom-Fields (Tags + how_we_met decken alles ab)

## 15. Quellenbasis dieser Spezifikation

- Robin Dunbar (Oxford): 5-15-50-150-Modell, evolutionspsychologisch
- Mark Granovetter (Stanford, 1973): Strength of Weak Ties
- Keith Ferrazzi (Never Eat Alone): Purpose-based Categorization
- Praxis-Analyse: Dex, Clay/Mesh, Folk, Monica, UpHabit, Wave Connect, Reflect

---

Ende des Briefings.
