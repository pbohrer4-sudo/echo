# Voice-Extraktion Regelwerk

Diese Datei ist die **Single Source of Truth** für die Voice-Erkennungslogik. Jede Zeile definiert ein Pattern, das in Echo's System-Prompt aufgenommen werden soll.

## Wie das funktioniert

Aktuell ist die Logik **statisch im System-Prompt** (`lib/prompts.ts`) hinterlegt. Wenn du eine Regel änderst oder hinzufügst, wandert sie nach dem nächsten Sync in den Prompt.

**Edit-Workflow:**

1. `docs/voice-rules.csv` öffnen (Numbers / Excel / Google Sheets / direkt im Editor)
2. Zeile hinzufügen oder bearbeiten
3. Mir Bescheid sagen — ich übertrage die Regeln in den System-Prompt
4. Voice probiert neuen Pattern

Optional später: ein Server-Script baut den System-Prompt aus dieser CSV automatisch zusammen. Bis dahin: manuelle Pflege.

## Spalten

| Spalte | Was es ist | Pflicht |
|---|---|---|
| **id** | Eindeutige Nummer für Referenz in Bug-Reports und Tests | ✓ |
| **active** | Y/N — Regel ein/aus schalten ohne sie zu löschen | ✓ |
| **category** | Gruppierung (met-context, relationship, contact, date, job, interaction, reminder, todo, tag, passion, circle, axis-purpose, axis-depth, axis-mode, filter, location, …) | ✓ |
| **trigger_pattern** | Die Phrase oder das Pattern auf Deutsch oder Englisch (mit Platzhaltern wie X, Y, N) | ✓ |
| **language** | de / en / both | ✓ |
| **extraction_target** | Welcher Tool-Call + welche Felder gesetzt werden sollen | ✓ |
| **example_input** | Konkrete Beispiel-Eingabe vom User | ✓ |
| **expected_output** | Was rauskommen soll als JSON oder Beschreibung | ✓ |
| **edge_cases** | Bekannte Fallstricke, Konflikte, Vorrang-Regeln | optional |

## Kategorien (Stand 2026-05)

### met-context
Wann/wo/durch-wen kennengelernt. Goldfeld + Beziehungen.

### relationship
Familie / Freund / Kollege / Mentor — alles was Personen miteinander verbindet. **Immer in relationships, NIEMALS in notes.**

### contact
Telefon / Email / Social — alles was strukturierter Kommunikations-Channel ist.

### date
Geburtstag / Hochzeitstag / wichtige Tage.

### job
Firma + Rolle.

### interaction
Treffen / Anrufe / Emails — werden via `log_interaction` festgehalten.

### reminder / todo
Versprechen + Aufgaben.

### tag / passion / circle
Cluster-Daten — Interessen, Identität, Communities.

### axis-purpose / axis-depth / axis-mode
3-Achsen-Klassifizierung.

### filter
Frage / Suche — geht via `query_people`.

### location
Wohnort / Heimat / aktuell.

## Vorrang-Regeln (Allgemeine Heuristik)

Wenn mehrere Triggers gleichzeitig matchen:

1. **Strukturierte Felder schlagen Notes.** Z. B. „durch Nick kennengelernt" gehört IMMER zu `how_we_met` + relationship, NIE als Freitext in notes.
2. **Explizite Werte schlagen Inferenz.** Wenn User sagt „arbeit-Mail felix@stripe.com" → Label arbeit. Wenn er nur „Mail ist felix@..." sagt → persönlich (Default).
3. **Tool-Call-Chains erlaubt.** „David durch Nick kennengelernt" → create_person(Nick wenn nicht vorhanden) + update_person(David) mit Beziehung referenziert.

## Was die CSV (noch) NICHT kann

- **Dynamische Regel-Updates**: Änderungen müssen aktuell manuell in den Prompt übertragen werden. Ein automatischer Builder ist als Folge-Sprint geplant.
- **A/B-Testing**: Wenn du verschiedene Phrasings vergleichen willst, mach zwei Rows mit unterschiedlichen `active`-States.
- **Per-User-Overrides**: Alle User teilen sich aktuell denselben Regelsatz. Per-User-Customization wäre eine separate Migration.

## Wie du Regeln testest

1. CSV-Zeile fertig schreiben
2. Voice-Orb öffnen, das `example_input` exakt einsprechen oder tippen
3. In der Extraction-Confirmation-Modal nachschauen welche Tool-Calls Claude tatsächlich produziert hat
4. Vergleich mit `expected_output`
5. Wenn's nicht passt: `edge_cases` ergänzen + mir sagen, dann tune ich den Prompt

## Wachstum

Die CSV soll wachsen. Starte mit den 40 Patterns die jetzt drin sind, ergänze bei jedem „warum hat Voice das NICHT erkannt"-Moment eine neue Row.
