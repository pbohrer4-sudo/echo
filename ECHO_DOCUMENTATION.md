# ECHO — Vollständige Systemdokumentation

> **Für wen ist dieses Dokument?**  
> Diese Dokumentation erklärt das gesamte ECHO-System in einfacher Sprache — für jeden, der verstehen möchte wie die App funktioniert, ohne Code lesen zu müssen. Jedes Feature, jede Regel, jede Verbindung wird hier erklärt.

---

## Inhaltsverzeichnis

1. [Was ist ECHO?](#1-was-ist-echo)
2. [Die Kernidee: Drei Achsen jeder Beziehung](#2-die-kernidee-drei-achsen-jeder-beziehung)
3. [Datenbankstruktur — Was ECHO speichert](#3-datenbankstruktur--was-echo-speichert)
4. [Seiten & Navigation](#4-seiten--navigation)
5. [Person-Detailseite — Das Herzstück](#5-person-detailseite--das-herzstück)
6. [Person anlegen & bearbeiten](#6-person-anlegen--bearbeiten)
7. [Spracherfassung & Debrief-Flow](#7-spracherfassung--debrief-flow)
8. [KI-Extraktion — Wie Echo Sprache versteht](#8-ki-extraktion--wie-echo-sprache-versteht)
9. [WhatsApp AI-Entwurf](#9-whatsapp-ai-entwurf)
10. [Erinnerungen & Aufgaben](#10-erinnerungen--aufgaben)
11. [Cadence & Rhythmus-System](#11-cadence--rhythmus-system)
12. [Timeline & Interaktionen](#12-timeline--interaktionen)
13. [Stakeholder-Klassifizierung](#13-stakeholder-klassifizierung)
14. [Visitenkarten-Scan](#14-visitenkarten-scan)
15. [Organisationen](#15-organisationen)
16. [Pipelines & Deals](#16-pipelines--deals)
17. [Workflows & Automatisierung](#17-workflows--automatisierung)
18. [Duplikat-Erkennung & -Zusammenführung](#18-duplikat-erkennung---zusammenführung)
19. [Mein Profil — Self-Person](#19-mein-profil--self-person)
20. [Gamification — Streaks & XP](#20-gamification--streaks--xp)
21. [Einstellungen](#21-einstellungen)
22. [Externe Integrationen](#22-externe-integrationen)
23. [Sicherheit & Datenschutz](#23-sicherheit--datenschutz)
24. [Alle festen Werte & Regeln im Überblick](#24-alle-festen-werte--regeln-im-überblick)

---

## 1. Was ist ECHO?

ECHO ist ein **persönliches CRM (Customer Relationship Management)** für deinen privaten und beruflichen Alltag. Anders als Firmen-CRMs (HubSpot, Salesforce) dreht sich ECHO nicht um Deals oder Sales-Pipelines — es dreht sich um **Beziehungen**.

Die App hilft dir:
- Den Überblick über alle wichtigen Menschen zu behalten
- Zu wissen, mit wem du lange nicht mehr gesprochen hast
- Interaktionen (Gespräche, Meetings, Anrufe) festzuhalten — per Sprache
- Erinnerungen für Geburtstage, Versprechen, Follow-Ups zu setzen
- Zu verstehen, wer in welcher Tiefe zu deinem Netzwerk gehört

**Technisch gesehen:** ECHO ist eine Web-App, gebaut auf Next.js (React), gespeichert in einer Supabase-Datenbank, mit Claude KI für die Sprachverarbeitung und ElevenLabs für Text-to-Speech.

---

## 2. Die Kernidee: Drei Achsen jeder Beziehung

Jede Person in ECHO wird entlang von **drei unabhängigen Achsen** eingeordnet. Diese Achsen mischen sich nie.

```
╔══════════════════════════════════════════════════════════════════╗
║                    DIE 3 ACHSEN                                  ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  🌡️  WÄRME         Wie lang ist der letzte Kontakt her?          ║
║      (automatisch)  → Aktiv / Warm / Kühl / Kalt                ║
║                                                                  ║
║  🎯  TIEFE          Wie nah ist diese Person?                    ║
║      (automatisch   → Inner Circle / Enger Kreis / Aktiv /      ║
║       + Override)     Netzwerk / Peripherie                     ║
║                                                                  ║
║  🏷️  ZWECK          Warum kennt man sich?                        ║
║      (manuell)      → Stakeholder-Typ (Kunde, Partner, etc.)    ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### Wärme — automatisch berechnet

| Letzter Kontakt | Status | Farbe |
|----------------|--------|-------|
| 0–30 Tage | **Aktiv** | Grün |
| 31–90 Tage | **Warm** | Gold |
| 91–180 Tage | **Kühl** | Blau |
| 181+ Tage / nie | **Kalt** | Grau |

### Tiefe — automatisch + manuelle Override

Tiefe berechnet sich aus **Anzahl der Interaktionen + Zeitspanne seit erstem Kontakt**:

```
                    Interaktionen  Zeitspanne    → Ergebnis
                    ─────────────────────────────────────────
                    0              beliebig      → Peripherie
                    1–3            beliebig      → Netzwerk
                    4–10           beliebig      → Aktiv
                    11–20 ODER     > 6 Monate    → Enger Kreis
                    > 20 UND       > 12 Monate   → Inner Circle
```

Entspricht Dunbars Kreismodell:
- **Inner Circle** (`inner_5`) — ~5 engste Menschen
- **Enger Kreis** (`trusted_15`) — ~15 Vertraute
- **Aktiv** (`active_50`) — ~50 regelmäßige Kontakte
- **Netzwerk** (`network_150`) — ~150 Bekannte
- **Peripherie** (`periphery_500`) — ~500 loser Kontakte

> Der Nutzer kann die automatische Berechnung jederzeit **manuell überschreiben** — dann erscheint ein kleines "manual"-Label am Chip.

---

## 3. Datenbankstruktur — Was ECHO speichert

### Die wichtigste Tabelle: `people`

Jede Person, die du in ECHO einträgst, hat folgende Felder:

#### Identität
| Feld | Was es ist |
|------|-----------|
| `name` | Vollständiger Name (Pflichtfeld) |
| `is_self` | Ist das dein eigenes Profil? (ja/nein) |
| `avatar_url` | Link zum Profilfoto |
| `scope` | Kontext: `work` = beruflich, `personal` = privat, `both` = beides |
| `company` | Firma / Organisation |
| `role` | Position / Berufsbezeichnung |

#### Kontaktdaten (strukturiert, mehrere pro Person)
Jede Person kann mehrere Telefonnummern, E-Mails etc. haben — jede mit einem Label:

| Typ | Mögliche Labels |
|-----|----------------|
| **Telefon** | mobile, iPhone, privat, arbeit, haupt, fax, andere |
| **E-Mail** | persönlich, arbeit, schule, andere |
| **Adresse** | zuhause, arbeit, andere |
| **Social** | LinkedIn, Instagram, Twitter, GitHub, Mastodon, Bluesky, Threads, TikTok, Website, andere |

#### Wichtige Daten
| Feld | Beschreibung |
|------|-------------|
| `important_dates` | Geburtstag, Hochzeitstag, Jahrestag, andere — jedes mit optionaler Erinnerung |
| `birthday` | Spiegelung des Geburtstags (für schnelle Abfragen) |
| Erinnerungs-Vorlaufzeit | Am Tag / 1 Tag / 3 Tage / 1 Woche / 2 Wochen / 1 Monat vorher |

#### Beziehungen zu anderen Personen
| Label | Automatisch gespiegelt? |
|-------|------------------------|
| Partner:in | ✅ Ja |
| Ehepartner:in | ✅ Ja |
| Freund:in | ✅ Ja |
| Kolleg:in | ✅ Ja |
| Mutter, Vater, Sohn, Tochter, Bruder, Schwester, Mentor:in, andere | ❌ Manuell |

> "Automatisch gespiegelt" bedeutet: wenn du Max als deinen "Partner:in" einträgst, wird bei Max automatisch auch du als "Partner:in" eingetragen.

#### Beziehungs-Metriken
| Feld | Was es ist |
|------|-----------|
| `strength_score` | Manuelle Stärke 1–5 |
| `expected_cadence_days` | Wie oft sollte man sich melden? (Tage) |
| `last_interaction_at` | Wann war der letzte Kontakt? |
| `depth` | Tiefe-Override (inner_5 bis periphery_500) |
| `notes_summary` | KI-generierte Zusammenfassung aller Notizen |

#### Priorität & Call-to-Action
| Feld | Optionen |
|------|---------|
| `priority` | A, B, C |
| `priority_bucket` | Diese Woche / Nächste Woche / Später |
| `cta` | Newsletter, Proposal, Pitchdeck, Meeting, Intro, Nichts |
| `cta_expires_at` | Wann läuft der CTA ab? |

**Prioritäts-Verfall (Decay):**
```
Gesetzt auf "Diese Woche"
    → nach 7 Tagen → "Nächste Woche"
    → nach 14 Tagen → "Später"

Dieser Verfall passiert nur beim Lesen (wird nicht automatisch gespeichert).
Er wird erst beim nächsten Speichern der Person in der DB verewigt.
```

#### Stakeholder & Klassifizierung
| Feld | Beschreibung |
|------|-------------|
| `stakeholder_types` | Haupttypen (Kunde, Partner, Investor, etc.) |
| `stakeholder_sub_types` | Untertypen pro Haupttyp |
| `industry` | Branche |
| `job_function` | Aufgabenbereich |
| `geographies` | Orte mit Art (Wohnort, Herkunft, Hub, Aufenthalt) + Zeitraum |
| `interests` | Interessen & Synergien |
| `tags` | Freie Schlagwörter (max. 7) |

---

### Weitere Tabellen

#### `interactions` — Interaktions-Log
Jede Interaktion (Gespräch, Meeting, E-Mail, Notiz) wird hier gespeichert:

| Feld | Beschreibung |
|------|-------------|
| `person_ids` | Alle beteiligten Personen (kann mehrere sein) |
| `type` | meeting / call / email / note / voice |
| `source` | debrief / manual / calendar |
| `summary` | Zusammenfassung |
| `sentiment` | positive / neutral / tense |
| `topics` | Gesprächsthemen als Liste |
| `occurred_at` | Wann fand es statt? |

#### `reminders` — Erinnerungen
| Feld | Beschreibung |
|------|-------------|
| `text` | Der Erinnerungstext |
| `remind_at` | Fälligkeitsdatum/-zeit |
| `recurrence` | once / weekly / monthly / yearly |
| `type` | check-in / birthday / promise / custom |
| `status` | pending / done / snoozed |
| `source` | manual / voice / ai-generated |

#### `todos` — Aufgaben
| Feld | Beschreibung |
|------|-------------|
| `text` | Was soll getan werden? |
| `due_date` | Fälligkeitsdatum |
| `priority` | low / medium / high |
| `status` | open / done / cancelled |

#### `notes` — Notizen
Freie Notizen zu einer Person, mit Tags und Quelle (voice oder manual).

#### `debriefs` — Abend-Reflektionen
Jedes abendliche Debrief-Gespräch wird als ein Debrief-Datensatz gespeichert mit Datum, Zusammenfassung, Dauer und allen zugehörigen Interaktions-IDs.

#### `suggestions` — KI-Vorschläge
KI-generierte Vorschläge, die noch nicht vom Nutzer bestätigt wurden:

| Status | Bedeutung |
|--------|-----------|
| `pending` | Wartet auf Nutzer-Aktion |
| `accepted` | Vom Nutzer angenommen |
| `rejected` | Abgelehnt |
| `dismissed` | Weggeklickt ohne Entscheidung |

| Art | Bedeutung |
|-----|-----------|
| `tag` | Tag-Vorschlag |
| `depth` | Tiefen-Vorschlag |
| `reminder` | Erinnerungs-Vorschlag |
| `enrichment` | Datenanreicherungs-Vorschlag |
| `reply` | Antwort-Vorschlag |
| `next_action` | Nächste Aktion |

#### `quota_usage` — Nutzungslimit
Wöchentliche Zähler pro Nutzer:

| Feld | Beschreibung |
|------|-------------|
| `week_start` | Montag der ISO-Woche |
| `ai_calls` | Anzahl KI-Aufrufe diese Woche |
| `voice_secs` | Sekunden Sprachverarbeitung |
| `enrichments` | Datenanreicherungen |

**Free-Tier-Limit: 100 KI-Aufrufe pro Woche.**

#### Neue Tabellen (noch im Aufbau)
- **`circles`** — Benannte Kreise (z.B. "Mastermind", "Surfer-Gruppe")
- **`person_circles`** — Welche Personen sind in welchem Kreis?
- **`passions`** — Bis zu 5 tiefe Leidenschaften pro Person
- **`life_events`** — Lebens-Ereignis-Typen
- **`person_life_events`** — Ereignisse die einer Person zugeordnet sind
- **`user_api_keys`** — BYOK: eigene API-Keys sicher gespeichert
- **`user_preferences`** — Benutzer-Einstellungen als Key-Value
- **`person_contacts`** — Strukturierte Kontakte als Zeilen
- **`person_relationships`** — Bidirektionale Beziehungsgraph-Kanten
- **`person_geographies`** — Standort-Historie als Zeilen

---

## 4. Seiten & Navigation

```
╔═══════════════════════════════════════════════════════════════╗
║                    ECHO SEITENSTRUKTUR                        ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  /              → Startseite (VoiceOrb — Haupteingabe)        ║
║  /people        → Personen-Liste mit Tag-Filter               ║
║  /people/new    → Neue Person anlegen                         ║
║  /people/[id]   → Person-Detail (Herzstück der App)           ║
║  /people/[id]/edit → Person bearbeiten                        ║
║  /people/import → Kontakte importieren (vCard)                ║
║  /people/duplicates → Duplikat-Verwaltung                     ║
║                                                               ║
║  /organizations → Organisations-Übersicht                     ║
║  /organizations/new → Neue Organisation                       ║
║  /organizations/[id] → Organisations-Detail                   ║
║  /rhythmus      → Cadence-Übersicht (wer ist überfällig?)     ║
║  /inbox         → Interaktions-Log                            ║
║  /debrief       → Abend-Debrief starten                       ║
║  /pulse         → Wöchentlicher Puls                          ║
║  /recap         → Wöchentlicher Recap                         ║
║  /pipelines     → Sales Pipelines & Deals                     ║
║  /integrations  → Integrationen & Workflows                   ║
║  /settings      → Einstellungen (→ Redirect zu Profil)        ║
║                                                               ║
║  Mein Profil = /people/[self.id]                              ║
║  (Tabs: Profil / Streaks / Payments / Einstellungen)          ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## 5. Person-Detailseite — Das Herzstück

Die wichtigste Seite in ECHO ist `/people/[id]`. Sie zeigt alles über eine Person:

### Layout von oben nach unten

```
┌────────────────────────────────────────────────────┐
│  ← Personen                                        │
├────────────────────────────────────────────────────┤
│  [Avatar]  Name                  [Bearbeiten] [✕]  │
│            Rolle · Firma         [Profil X/12 ▓░░] │
│            ████ Stärke-Meter                        │
│            [Wärme] [Tiefe] [Priorität] [CTA]        │
│            [Beruflich] [Tag1] [Tag2]                │
├────────────────────────────────────────────────────┤
│  [📞 Anrufen]  [💬 WhatsApp]  [⋮]                  │
├────────────────────────────────────────────────────┤
│  KI-ENTWURF FÜR WHATSAPP ────────────  [Locker|Pro]│
│  [👋 Wieder melden] [☕ Treffen] [🎉 Geburtstag]    │
│  [🙏 Danke Intro]   [🔄 Nachfassen] [💬 Lbz.]      │
│  ┌─────────────────────────────────────────┐        │
│  │ Hey Felix! Schon ewig nichts...         │        │
│  └─────────────────────────────────────────┘        │
│  [Kopieren]              [In WhatsApp öffnen →]     │
├────────────────────────────────────────────────────┤
│  INTERESSEN & SYNERGIEN ──────────────────────────  │
│  [Segeln] [KI] [Sales]                              │
├────────────────────────────────────────────────────┤
│  TELEFON ──────────────  |  EMAIL ─────────────────│
│  📱 +49 172 ...          |  ✉ felix@...             │
│                           |                         │
├────────────────────────────────────────────────────┤
│  ADRESSEN ────────────  |  SOCIAL ─────────────────│
│  Zuhause: München        |  LinkedIn: felix-s       │
├────────────────────────────────────────────────────┤
│  WICHTIGE DATEN ──────────  |  BEZIEHUNGEN ────────│
│  🎂 Geburtstag 14.09.       |  Kolleg:in → Max M.  │
├────────────────────────────────────────────────────┤
│  STAKEHOLDER ─────────────────────────────────────  │
│  Entscheider > Budget, Umsetzung                   │
├────────────────────────────────────────────────────┤
│  NOTIZEN ─────────────────────────────────────────  │
│  Freier Text + KI-Zusammenfassung                  │
├────────────────────────────────────────────────────┤
│  ERINNERUNGEN ──────────  |  AUFGABEN ─────────────│
│  Check-in in 3 Tagen       |  Angebot schicken      │
├────────────────────────────────────────────────────┤
│  TIMELINE ────────────────────────────────────────  │
│  [Alle Interaktionen + Notizen zeitlich sortiert]  │
├────────────────────────────────────────────────────┤
│  ÄHNLICHE PERSONEN ───────────────────────────────  │
│  [Persons mit gleichen Tags]                       │
└────────────────────────────────────────────────────┘
```

### Die Beziehungs-Chips (oben im Header)

**Wärme-Chip:**
- Zeigt Aktiv / Warm / Kühl / Kalt
- Farbe passt zur Wärme (grün, gold, blau, grau)
- Berechnet aus `last_interaction_at`

**Tiefen-Chip:**
- Zeigt "Inner Circle", "Enger Kreis", "Aktiv", "Netzwerk", "Peripherie"
- Bei manuellem Override erscheint ein kleines "manual"-Label
- Hover-Tooltip: "Auto wäre X" wenn manuell gesetzt

**Prioritäts-Chip:**
- Zeigt "Priorität A/B/C" in Action-Farbe
- Zeigt Bucket "Diese Woche / Nächste Woche / Später"
- Bei Verfall erscheint "decayed"-Label
- Hover-Tooltip erklärt den Auto-Verfall

**CTA-Chip:**
- Nur sichtbar wenn CTA gesetzt und nicht abgelaufen
- Farbe: Gold/Amber
- Zeigt z.B. "CTA: Newsletter"

**Profil-Fortschrittsbalken** (rechts oben):
- Zeigt wie vollständig das Profil ist (z.B. "7/12")
- 12 gemessene Felder: Firma, Rolle, Tags, Telefon, E-Mail, Adresse, Social, Wichtige Daten, Beziehungen, Notizen, Cadence, Avatar

### Action-Bar (Schnellaktionen)

Wird nur angezeigt wenn:
- Person ist **nicht** das eigene Profil
- Mindestens eine Telefonnummer ist vorhanden

| Button | Aktion |
|--------|--------|
| 📞 Anrufen | Öffnet `tel:` Link → direkter Anruf |
| 💬 WhatsApp | Öffnet `https://wa.me/[nummer]` |
| ⋮ Mehr | Optionen-Menü |

---

## 6. Person anlegen & bearbeiten

### Formular-Bereiche

Das Formular zum Anlegen/Bearbeiten einer Person hat folgende Sektionen:

#### 1. Basis
- Name (Pflichtfeld), Firma, Rolle
- Scope: Beruflich / Privat / Beides
- Avatar-URL (oder Bild hochladen)

#### 2. Visitenkarten-Scan
- Kamera oder Datei auswählen
- KI erkennt: Name, Firma, Rolle, Telefon, E-Mail, Adresse, Social
- Felder werden vorausgefüllt, User kann korrigieren

#### 3. Kontaktdaten
Jeder Typ (Telefon, E-Mail, Adresse, Social) kann mehrfach eingetragen werden, jeweils mit einem Label:
- **+** Button fügt neue Zeile hinzu
- **✕** entfernt eine Zeile
- Label-Dropdown mit Vorschlägen

#### 4. Wichtige Daten
- Beliebig viele Daten (Geburtstag, Jahrestag, etc.)
- Für jedes Datum: Erinnerung aktivieren (ja/nein)
- Erinnerungs-Vorlauf: Am Tag / 1 Tag / 3 Tage / 1 Woche / 2 Wochen / 1 Monat vorher

#### 5. Beziehungen
- Dropdown: Beziehungsart auswählen
- Personen-Dropdown: Andere Person aus dem CRM auswählen
- Symmetrische Labels werden automatisch gespiegelt

#### 6. Tags & Interessen
- Tags: kommagetrennt oder mit Enter bestätigen
- Vorschläge aus vorhandenen Tags via Datalist
- Interessen: ähnlich wie Tags, für Synergien

#### 7. Stakeholder
- Toggle-Buttons für Haupttypen (Partner, Investor, Kunde, etc.)
- Pro ausgewähltem Haupttyp erscheinen Untertyp-Checkboxen
- Eigene Einträge möglich

#### 8. Klassifizierung
- Branche (Industry)
- Aufgabenbereich (Job Function)
- Geographien: Ort + Art (Wohnort, Aufenthalt, Herkunft, Hub) + Zeitraum

#### 9. Beziehungstiefe (Override)
- Standard: "Auto" (berechnet sich automatisch)
- Manual: Inner Circle / Enger Kreis / Aktiv / Netzwerk / Peripherie

#### 10. Notizen
- Freitext-Notizen

#### 11. Rhythmus / Cadence
- Erwartete Cadence in Tagen

#### 12. Priorität
- Buchstabe: A / B / C
- Bucket: Diese Woche / Nächste Woche / Später
- CTA + Ablaufdatum

#### 13. Stärke
- 1–5 Sterne (manuell)

### Duplikat-Check beim Anlegen
Wenn du eine neue Person anlegst, prüft ECHO automatisch ob es bereits jemanden gibt mit:
- Gleichem oder ähnlichem Namen
- Gleicher E-Mail-Adresse
- Gleicher Telefonnummer

Ein Banner warnt dich, bevor du doppelt einträgst.

### Symmetrische Beziehungen — Wie die Spiegelung funktioniert

```
Du trägst ein: Felix → Partner:in → Sarah
ECHO macht automatisch: Sarah → Partner:in → Felix

Das gilt für: Partner:in, Ehepartner:in, Freund:in, Kolleg:in

Mutter → Sohn etc. müssen MANUELL auf BEIDEN Seiten eingetragen werden.
```

---

## 7. Spracherfassung & Debrief-Flow

Das Herzstück von ECHO ist die **Spracherfassung**. Du redest — ECHO versteht und speichert.

### Die VoiceOrb (Startseite)
Große runde Schaltfläche auf der Startseite. Tippen → Mikrofon aktiviert sich.

### Der Debrief-Flow (`/debrief`)
Abendliche geführte Reflexion. Geh durch deinen Tag und diktiere was passiert ist.

#### Die Phasen des Debriefs

```
    ┌─────────────────────────────────────────────────────────┐
    │                   DEBRIEF-ABLAUF                        │
    └─────────────────────────────────────────────────────────┘
    
    [idle]
       │
       ▼ User startet
    [greeting] → ElevenLabs spricht: "Guten Abend Patrick, bereit?"
       │
       ▼ User sagt "Ja"
    [prompt] → "Erzähl mir von heute..."
       │
       ▼ User beginnt zu sprechen
    [listening] ──── Web Speech API hört zu
       │              3 Sekunden Stille = Auto-Stop
       │              5 Minuten = Hard-Stopp
       │
       ▼ Stille erkannt
    [extracting] → Transcript → Claude KI → strukturierte Daten
       │
       ▼
    [summary] → ElevenLabs liest Zusammenfassung vor
       │
       ▼
    [confirming] → Nutzer sieht alle extrahierten Daten zum Bestätigen
       │
       ▼ Bestätigt
    [next] → "Noch etwas zu erzählen?"
       │
       ├── "Ja" → zurück zu [listening]
       │
       └── "Nein" → [finalizing] → Debrief gespeichert → [outro] → "Gute Nacht"
```

#### Technisches Verhalten
- **Sprache:** Deutsch (de-DE)
- **Stille-Timeout:** 3 Sekunden
- **Maximale Aufnahmedauer:** 5 Minuten
- **Zwischenergebnis:** Wird live angezeigt während du sprichst
- **Sprachausgabe:** ElevenLabs (konfigurierbare Voice-ID)

#### Suggested Replies
Claude kann Schaltflächen vorschlagen (z.B. "Ja", "Nein", "Später") — dann musst du nicht sprechen, sondern kannst tippen.

---

## 8. KI-Extraktion — Wie Echo Sprache versteht

Wenn du sprichst oder Texte eingibst, schickt ECHO den Inhalt an Claude (Anthropic) und nutzt **Tool-Use** um strukturierte Daten zu extrahieren.

### Die 7 Extraktions-Werkzeuge

```
┌─────────────────────────────────────────────────────────────┐
│              CLAUDE'S WERKZEUGE                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  create_person     → Neue Person anlegen                   │
│  update_person     → Bestehende Person aktualisieren       │
│  log_interaction   → Kontakt/Gespräch festhalten           │
│  create_reminder   → Erinnerung setzen                     │
│  create_todo       → Aufgabe anlegen                       │
│  create_note       → Notiz speichern                       │
│  suggest_replies   → Schaltflächen für User vorschlagen    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Beispiel-Satz und was passiert

**Du sagst:** *"Heute hatte ich ein Meeting mit Felix Schmidt von Valoon. War sehr positiv. Ich soll ihm bis Freitag ein Angebot schicken."*

**Claude extrahiert:**
```
1. log_interaction:
   - person: "Felix Schmidt"
   - type: "meeting"
   - sentiment: "positive"
   - summary: "Meeting über Angebot"
   
2. create_todo:
   - person: "Felix Schmidt"
   - text: "Angebot schicken"
   - due_date: [nächster Freitag]
   - priority: "high"
```

### Bestätigungsschritt
ECHO zeigt alle extrahierten Daten vor dem Speichern. Du kannst:
- Bestätigen (speichern)
- Bearbeiten (vor dem Speichern korrigieren)
- Überspringen (diese Aktion nicht ausführen)

### System-Kontext den Claude bekommt
- Aktuelles Datum und Wochentag (für relative Datumsauflösung wie "Freitag")
- Liste aller vorhandenen Personen (max. 500) mit ID und Name (für Namens-Abgleich)

### update_person — Wie Arrays aktualisiert werden
Bei bestehenden Personen:
- **Tags:** `add_tags` fügt hinzu (ersetzt nicht)
- **Telefone, E-Mails, Adressen, Socials:** `add_*` fügt hinzu
- **Skalare Felder** (Firma, Rolle, Notizen): ersetzen den alten Wert

---

## 9. WhatsApp AI-Entwurf

Der KI-Entwurf ist eine **template-basierte** Funktion — kein Live-API-Call nötig. Die Texte sind vorgefertigt und werden sofort angezeigt.

### Position auf der Seite
Erscheint **über den Interessen & Synergien** — gut sichtbar ohne Scrollen, direkt nach der Action-Bar.

### 6 Use-Cases

| Chip | Emoji | Für wann? |
|------|-------|-----------|
| Wieder melden | 👋 | Schon lange nichts gehört |
| Treffen vorschlagen | ☕ | Coffee/Meeting anfragen |
| Geburtstag | 🎉 | Geburtstagsnachricht |
| Danke für Intro | 🙏 | Nach einer Vermittlung |
| Nachfassen | 🔄 | Follow-Up nach Gespräch |
| Lebenszeichen | 💬 | Einfach Hallo sagen |

### Zwei Stile

#### Locker
Für Freunde, Bekannte, informelle Kontakte.
```
Beispiel (Wieder melden):
"Hey Felix! Schon ewig nichts voneinander gehört – wie läuft's
bei dir? 🙂"
```

#### Professionell  
Für Geschäftskontakte, formellere Beziehungen.
```
Beispiel (Wieder melden):
"Hallo Felix, ich hoffe es geht dir gut. Es ist schon eine Weile
her – ich würde mich gerne wieder austauschen. Wann passt dir
ein kurzer Austausch?"
```

### Wie es funktioniert

```
1. User wählt Use-Case-Chip
      ↓
2. Template wird sofort geladen (kein API-Call)
   Vorname wird eingesetzt (Felix Schmidt → "Felix")
      ↓
3. Textarea ist editierbar — User kann anpassen
      ↓
4. Stil-Toggle ändert den Text on-the-fly
      ↓
5a. "Kopieren" → Text in Zwischenablage
5b. "In WhatsApp öffnen" → wa.me/?text=[Nachricht]
    (öffnet WhatsApp mit vorgefülltem Text)
```

### Stil-Einstellung in den Einstellungen
Der Standardstil wird aus dem Nutzerprofil gelesen (`message_style`). Kann in den Einstellungen dauerhaft gesetzt werden. Auf der Person-Detailseite kann er per Klick temporär überschrieben werden.

---

## 10. Erinnerungen & Aufgaben

### Erinnerungen

Erinnerungen sind zeitbasiert und können sich wiederholen.

| Feld | Optionen |
|------|---------|
| **Art** | check-in, birthday, promise, custom |
| **Wiederholung** | Einmalig, Wöchentlich, Monatlich, Jährlich |
| **Status** | Ausstehend, Erledigt, Verschoben (Snooze) |
| **Quelle** | Manuell, Voice (per Sprache), KI-generiert |

#### Wie Geburtstags-Erinnerungen funktionieren
Wenn du bei einer Person ein Datum mit Label "Geburtstag" einträgst:
- Option aktivieren: "Erinnerung setzen"
- Vorlaufzeit wählen: Am Tag / 1 Tag / 3 Tage / 1 Woche / 2 Wochen / 1 Monat
- ECHO erstellt automatisch eine **jährlich wiederkehrende** Erinnerung

### Aufgaben (Todos)

Einfachere, aufgabenorientierte Einträge:
- Text, Fälligkeitsdatum, Priorität (niedrig/mittel/hoch)
- Status: offen / erledigt / abgebrochen
- Optional mit Person verknüpft

### Inbox
Unter `/inbox` findest du alle offenen Erinnerungen und Aufgaben, chronologisch sortiert. Dort kannst du sie als erledigt markieren oder snoozen.

---

## 11. Cadence & Rhythmus-System

Cadence ist einer der wichtigsten Mechanismen in ECHO. Er verhindert, dass wichtige Beziehungen einschlafen.

### Was ist Cadence?
Die Anzahl Tage, nach denen du dich typischerweise bei einer Person melden solltest. Beispiel: 30 = alle 30 Tage Kontakt.

### Cadence-Status (5 Kategorien)

```
Tage seit letztem Kontakt  vs.  erwartete Cadence (C)
─────────────────────────────────────────────────────
≤ C              → ✅ Im Rhythmus       (on-rhythm)
C < X ≤ 1.5×C   → ⚡ Bald fällig       (due-soon)
X > 1.5×C        → 🔴 Drifting          (drifting)
Kein Kontakt     → ⚪ Kein Kontakt      (no-contact)
Keine Cadence    → — Kein Rhythmus     (no-cadence)
```

### Darstellung unter `/rhythmus`
Personen werden nach Cadence-Status gruppiert:
1. 🔴 Drifting (am dringendsten)
2. ⚡ Bald fällig
3. ✅ Im Rhythmus
4. ⚪ Kein Kontakt
5. — Kein Rhythmus

Innerhalb jeder Gruppe: Personen mit höherem `strength_score` zuerst (die wichtigsten Beziehungen zuerst).

### Sunday Pulse (`/pulse`)
Wöchentliche Analyse: Wer ist überfällig? Wo gibt es Risiken? KI-generierte Insights.

---

## 12. Timeline & Interaktionen

### Die Timeline auf der Personenseite
Zeigt alle Kontakte und Notizen zu einer Person in **umgekehrt chronologischer Reihenfolge** (neueste zuerst).

Jeder Eintrag hat:
- **Datum** (links, klein)
- **Typ-Label** (z.B. MEETING, CALL, VOICE, NOTE)
- **Zusammenfassung** (Inhalt)
- **Metadaten** (Quelle, Stimmung)

### Interaktions-Typen

| Typ | Wann verwendet |
|-----|---------------|
| `meeting` | Physisches oder virtuelles Meeting |
| `call` | Telefonanruf |
| `email` | E-Mail (per Integration oder manuell) |
| `note` | Freitext-Notiz |
| `voice` | Per Spracherfassung eingetragen |

### Interaktions-Stimmung

| Stimmung | Bedeutung |
|---------|----------|
| `positive` | Gut verlaufen |
| `neutral` | Neutral |
| `tense` | Angespannt / schwierig |

### Mehrere Personen pro Interaktion
Eine Interaktion kann mehrere Personen betreffen (z.B. ein Meeting mit 3 Leuten). Das `person_ids`-Array speichert alle.

---

## 13. Stakeholder-Klassifizierung

### Zwei Ebenen

**E1 — Haupttypen** (10 Optionen + eigene):

| Typ | Wofür |
|-----|-------|
| Partner | Lieferanten, Channel-Partner, JVs |
| Investor | VCs, Angels, Family Offices |
| Kunde | Enterprise, SMB, Individual, Pilot |
| Mitarbeiter | Festangestellt, Freelancer, Praktikum |
| Service-Provider | Steuer, Recht, Marketing, IT |
| Mentor | Industry, Personal, Technical |
| Multiplikator | Influencer, Speaker, Community-Leads |
| Media | Press, Podcast, Newsletter |
| Regulator | Government, Audit, Compliance |
| Privat | Familie, Freund, Bekannter |

**E2 — Untertypen** (pro Haupttyp):
- Werden automatisch als Checkboxen eingeblendet wenn E1 ausgewählt
- Custom: Eigene Untertypen frei eingeben

### Warum das wichtig ist
Stakeholder-Klassifizierung hilft dir zu verstehen **warum** du jemanden kennst — unabhängig davon wie nah (Tiefe) oder wie frisch (Wärme) die Beziehung ist.

---

## 14. Visitenkarten-Scan

### Ablauf

```
1. Auf Neue Person → Kamerabutton
      ↓
2. Foto aufnehmen oder Datei hochladen
      ↓
3. POST → /api/scan-business-card
   Bild → Claude Vision (Sonnet 4.6)
      ↓
4. Claude extrahiert:
   - Name
   - Firma
   - Rolle
   - Telefonnummern (mit Label)
   - E-Mail-Adressen
   - Adressen
   - Social-Links
      ↓
5. Formular-Felder werden vorausgefüllt
   User kann vor Speichern korrigieren
```

### Was bei Duplikaten passiert
- Vorhandene Werte werden NICHT überschrieben
- Neue Werte werden hinzugefügt
- Z.B.: Telefon aus Visitenkarte + existierende Telefone = beide behalten

---

## 15. Organisationen

### Was Organisationen sind
Firmen, die mehrere Personen in ECHO teilen. Eine Person kann einer Organisation zugeordnet sein (via `organization_id`).

### Organisation automatisch anlegen
Beim Anlegen einer Person mit Firmennamen: ECHO sucht ob diese Organisation schon existiert. Wenn ja → verknüpfen. Wenn nein → automatisch neu anlegen.

### Auto-Enrichment
Auf der Organisations-Seite: Button "Auto-Enrichen" → Claude füllt leere Felder aus:
- Branche, Größe, Hauptsitz, Beschreibung, Tags
- Nur leere Felder werden befüllt (vorhandene Daten werden nie überschrieben)

---

## 16. Pipelines & Deals

> ⚠️ Hinweis: ECHO ist kein Sales-CRM. Pipelines sind für bestimmte Use-Cases (z.B. Job-Tracking, Partnerschaft-Pflege) gedacht — nicht als HubSpot-Ersatz.

### Pipeline-Struktur
```
Pipeline
  ├── Name, Beschreibung
  ├── Entity-Typ: Person / Organisation / beides
  ├── Stages (Spalten im Kanban)
  │     ├── Name, Farbe, Reihenfolge
  │     ├── Wahrscheinlichkeit (%)
  │     └── Outcome: won / lost (optional)
  └── Benutzerdefinierte Felder
        (Text, Zahl, Datum, Währung, Auswahl, etc.)
```

### Deal-Felder
| Feld | Beschreibung |
|------|-------------|
| Stage | Aktuelle Spalte im Kanban |
| Wert + Währung | Deal-Betrag |
| Erwartetes Abschluss-Datum | Wann? |
| Wahrscheinlichkeit | % |
| Status | Offen / Gewonnen / Verloren |
| Custom-Fields | Aus Pipeline-Definition |

---

## 17. Workflows & Automatisierung

Workflows sind visuelle Automatisierungen (ähnlich wie Zapier).

### Aufbau
```
[Trigger] → [Filter?] → [Transform?] → [Aktion]
```

**Trigger-Beispiele:**
- Person wurde angelegt
- Interaktion wurde geloggt
- Erinnerung fällig

**Filter-Beispiele:**
- Scope = beruflich
- Tiefe = inner_5
- Cadence-Status = drifting

**Aktionen:**
- Erinnerung erstellen
- Notiz erstellen
- E-Mail senden

### KI-Workflow-Generator
Unter `/integrations/workflows` → "Workflow mit KI erstellen":
Beschreibe in natürlicher Sprache was du automatisieren möchtest → Claude entwirft den Workflow-Graph.

### Status
- `draft` → noch nicht aktiv
- `enabled` → läuft
- `disabled` → pausiert

---

## 18. Duplikat-Erkennung & -Zusammenführung

### Automatische Erkennung
ECHO sucht nach Duplikaten bei:
- **Personen:** Gleicher Name (Fuzzy), gleiche E-Mail, gleiche Telefonnummer
- **Organisationen:** Gleiche Domain, gleiche Website

Konfidenz-Level: `high` (sehr wahrscheinlich Duplikat) oder niedriger.

### Zusammenführung (Merge)
Beim Mergen zweier Personen:
- Felder: ECHO nimmt den "besseren" Wert (nicht-null zuerst)
- Arrays: Beide werden zusammengeführt (dedupliciert)
- Beziehungen: Auf den Überlebenden migriert
- Tiefe-Override: Beides wird berücksichtigt (coalesce)
- Der "verlorene" Datensatz wird soft-deleted

---

## 19. Mein Profil — Self-Person

Jeder Nutzer hat genau eine "Self-Person" in ECHO — das eigene Profil. Es hat besondere Eigenschaften:

### Besonderheiten
- Kein Löschen möglich
- Kein Anrufen / WhatsApp-Button
- Keine Beziehungs-Badges (Wärme, Tiefe)
- Stattdessen: Tab-Navigation

### Die 4 Tabs

**Profil-Tab**
- Gleiches Layout wie alle anderen Personen
- Zeigt Tab-Status: Chancen & Probleme auf einen Blick

**Streaks-Tab**
- Gamification-Dashboard
- XP, Achievements, tägliche Streaks
- Motivation zum regelmäßigen Benutzen der App

**Payments-Tab**
- Zahlungs-/Umsatztracking

**Einstellungen-Tab**
- Alle persönlichen Einstellungen direkt im Profil

### Tab-Status (Chancen & Probleme)

Auf dem Profil-Tab sieht man automatisch berechnete Hinweise:

| Signal | Typ | Schwelle |
|--------|-----|---------|
| X Personen drifting | Problem | > 1.5× Cadence überschritten |
| Y Personen bald fällig | Chance | 1×–1.5× Cadence |
| Z ohne Cadence | Chance | > 5 Personen ohne Cadence |
| Überfällige Erinnerungen | Problem | remind_at < jetzt |
| Hochwertige Duplikate | Problem | Konfidenz = high |
| Profil unvollständig | Chance | < 12/12 Felder ausgefüllt |

---

## 20. Gamification — Streaks & XP

### XP-System
Aktionen in ECHO bringen XP-Punkte. Die genaue Berechnung ist in `/lib/gamification.ts` definiert.

### Level-System
XP → Level (berechnet durch `levelFromXp()`).

### Achievements
`buildAchievements()` berechnet welche Achievements freigeschaltet sind.

### Streak-Berechnung
```
Heute ist YYYY-MM-DD.

Wurde heute ein Debrief gemacht?
  → Ja: Streak beginnt heute
  → Nein: Streak beginnt gestern

Gehe Tag für Tag rückwärts, solange ein Debrief vorhanden.
Sobald kein Debrief an einem Tag → Streak-Kette bricht.

Aktueller Streak = Anzahl der aufeinanderfolgenden Tage.
Längster Streak = Maximum aus dem gesamten Verlauf.
```

---

## 21. Einstellungen

Erreichbar über `/settings` (→ redirect zu Mein Profil → Tab Einstellungen).

### Profil-Einstellungen

| Einstellung | Beschreibung |
|-------------|-------------|
| **Anzeigename** | Wie ECHO dich anspricht ("Guten Abend, Patrick") |
| **Sprache** | Deutsch / English (beeinflusst Voice & Antworten) |

### Voice-Einstellungen

| Einstellung | Beschreibung |
|-------------|-------------|
| **ElevenLabs Voice-ID** | Welche Stimme spricht ECHO? Standard: Sarah Eve (`tnSpp4vdxKPjI9w0GnoV`) |
| **Debrief-Zeit** | Wann soll ECHO abends an den Debrief erinnern? Standard: 21:30 |

### Schreibstil

| Einstellung | Beschreibung |
|-------------|-------------|
| **Locker** | Template-Entwürfe auf Duze, entspannt, mit Emoji |
| **Professionell** | Formeller Ton, Sieze-Option, ohne Emoji |

Dieser Stil ist der Standard für den WhatsApp KI-Entwurf. Kann auf jeder Personenseite temporär überschrieben werden.

### Bring Your Own Keys (BYOK)

Wenn du deine eigenen API-Keys verwendest, nutzt ECHO diese statt der geteilten Standard-Keys:

| Key | Provider | Wozu |
|-----|----------|------|
| Anthropic API Key | Claude | Sprachverarbeitung, Extraktion, Chat |
| ElevenLabs API Key | ElevenLabs | Text-to-Speech Stimmen |

**Sicherheit:** Nur die letzten 4 Zeichen werden angezeigt. Löschen ist per Checkbox möglich.

---

## 22. Externe Integrationen

### Google Calendar
- Verbindung über OAuth
- Sync: Kalendereinträge → Interaktionen in ECHO
- Läuft als Cron-Job (stündlich)

### Gmail
- E-Mails → Interaktionen in ECHO
- Automatisch: Eingehende und gesendete Mails

### WhatsApp
- **Inbound:** Eingehende Nachrichten → erscheinen im Inbox
- **Outbound:** Nachrichten direkt aus ECHO senden
- Webhook-basiert (WhatsApp Business API)

### vCard-Import
- Unter `/people/import`
- .vcf-Datei hochladen → Preview aller Kontakte
- Bestätigen → Bulk-Import mit Duplikat-Prüfung

### ICS-Export
- Unter `/people/[id]/dates.ics`
- Alle wichtigen Daten einer Person als Kalender-Datei
- Kompatibel mit Apple Calendar, Google Calendar, Outlook

---

## 23. Sicherheit & Datenschutz

### Row-Level-Security (RLS)
Jede Tabelle in der Datenbank hat RLS aktiviert. Das bedeutet: **Jeder Nutzer sieht nur seine eigenen Daten.** Es ist technisch unmöglich, auf Daten anderer Nutzer zuzugreifen.

```
Alle Daten haben: user_id = auth.uid()
Alle Queries filtern: WHERE user_id = aktuelle_user_id
```

### Soft-Delete
Personen werden nie wirklich gelöscht. Stattdessen wird `deleted_at` gesetzt. Die Person ist dann:
- Unsichtbar in allen normalen Ansichten
- Noch vorhanden für eventuelle Wiederherstellung
- Muss nie manuell aus Beziehungsgraphen entfernt werden

### API-Keys
- Niemals in Logs gespeichert
- BYO-Keys: Nur Hash/Hint sichtbar, nie Plaintext
- Alle Kommunikation mit externen APIs über Server-Side (nie direkt aus dem Browser)

### EU-Daten-Hosting
- Supabase: EU Region (Frankfurt, fra1)
- DSGVO-konform durch Design

---

## 24. Alle festen Werte & Regeln im Überblick

### Zahlen-Schwellwerte

| Regel | Wert |
|-------|------|
| Wärme: Aktiv | < 30 Tage |
| Wärme: Warm | < 90 Tage |
| Wärme: Kühl | < 180 Tage |
| Wärme: Kalt | 180+ Tage |
| Tiefe: Peripherie | 0 Interaktionen |
| Tiefe: Netzwerk | 1–3 Interaktionen |
| Tiefe: Aktiv | 4–10 Interaktionen |
| Tiefe: Enger Kreis | 11–20 ODER > 6 Monate |
| Tiefe: Inner Circle | > 20 UND > 12 Monate |
| Priorität-Verfall: → Nächste Woche | nach 7 Tagen |
| Priorität-Verfall: → Später | nach 14 Tagen |
| Cadence Due-Soon | > 1.0× bis 1.5× Cadence |
| Cadence Drifting | > 1.5× Cadence |
| Profil-Vollständigkeit | 12 Felder gezählt |
| Max. Tags | 7 |
| Max. Passions | 5 |
| Debrief Hard-Stopp | 5 Minuten |
| Stille-Timeout | 3 Sekunden |
| Free-Tier KI-Limit | 100 Aufrufe/Woche |
| People Prompt Limit | 500 Personen im KI-Kontext |
| Strength Score | 1–5 (Ganzzahl) |
| Visitenkarten-Upload | Max. 25 MB |

### Feste Textwerte (Deutsch)

| Kategorie | Werte |
|-----------|-------|
| Scope | Beruflich, Privat, Beides |
| Tiefen-Labels | Inner Circle, Enger Kreis, Aktiv, Netzwerk, Peripherie |
| Tiefen-Codes | inner_5, trusted_15, active_50, network_150, periphery_500 |
| Prioritätsbriefe | A, B, C |
| Prioritäts-Buckets | Diese Woche, Nächste Woche, Später |
| CTA-Optionen | Newsletter, Proposal, Pitchdeck, Meeting, Intro, Nichts |
| Interaktions-Typen | meeting, call, email, note, voice |
| Erinnerungs-Typen | check-in, birthday, promise, custom |
| Erinnerungs-Wiederholung | Einmalig, Wöchentlich, Monatlich, Jährlich |
| Stimmungen | positive, neutral, tense |
| Telefon-Labels | mobile, iPhone, privat, arbeit, haupt, fax, andere |
| E-Mail-Labels | persönlich, arbeit, schule, andere |
| Adress-Labels | zuhause, arbeit, andere |
| Social-Plattformen | LinkedIn, Instagram, Twitter, GitHub, Mastodon, Bluesky, Threads, TikTok, Website, andere |
| Datums-Labels | Geburtstag, Hochzeitstag, Jahrestag, andere |
| Geo-Arten | Wohnort, Aufenthalt, Herkunft, Hub |
| Erinnerungs-Vorlauf | Am Tag, 1 Tag, 3 Tage, 1 Woche, 2 Wochen, 1 Monat |
| Stakeholder E1 | Partner, Investor, Kunde, Mitarbeiter, Service-Provider, Mentor, Multiplikator, Media, Regulator, Privat |
| Beziehungs-Labels | Partner:in, Ehepartner:in, Mutter, Vater, Sohn, Tochter, Bruder, Schwester, Freund:in, Kolleg:in, Mentor:in, andere |
| Symmetrisch | Partner:in, Ehepartner:in, Freund:in, Kolleg:in |
| Schreibstile | Locker, Professionell |
| WA Use-Cases | Wieder melden, Treffen vorschlagen, Geburtstag, Danke für Intro, Nachfassen, Lebenszeichen |

### KI-Modell

| Zweck | Modell |
|-------|--------|
| Sprachextraktion | claude-sonnet-4-6 |
| Chat / Debrief | claude-sonnet-4-6 |
| Organisation Enrichment | claude-sonnet-4-6 |
| Visitenkarten-Scan | claude-sonnet-4-6 (mit Vision) |
| Workflow-Generator | claude-sonnet-4-6 |

### Sprachen

| Kontext | Sprache |
|---------|---------|
| UI/UX | Deutsch |
| Spracherfassung | Deutsch (de-DE) |
| Code & Commits | Englisch |
| Kommentare im Code | Englisch |

---

*Dokument generiert: 2026-05-14*  
*Stand: Branch `claude/app-architecture-map-5OawO`*
