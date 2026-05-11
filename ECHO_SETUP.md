# Echo Personal CRM - Claude Code Setup (Bestehende Codebase)

## Ausgangslage

Echo hat bereits eine bestehende Logik. Wir wollen die Architektur Richtung Briefing ausrichten, ohne alles wegzuwerfen oder Daten zu verlieren.

## Vorbereitung

### Schritt 1: Branch anlegen für die Umstellung


```bash
cd echo
git checkout -b refactor/3-axis-model
```



Falls noch nicht in git, jetzt initialisieren:


```bash
git init
git add .
git commit -m "Initial commit before refactor"
git checkout -b refactor/3-axis-model
```



### Schritt 2: Sicherheitsnetz

Bevor du loslegst:


```bash
git tag pre-refactor-snapshot
supabase db dump -f backup-vor-refactor.sql
```



Falls etwas schiefläuft:


```bash
git checkout pre-refactor-snapshot
# Datenbank zurückspielen falls nötig
```



## Die richtigen Prompts in der richtigen Reihenfolge

### Prompt 1 - Discovery starten


```
Lies CLAUDE.md komplett.

Wir starten NICHT mit Code-Änderungen. Führe zuerst die Discovery Phase durch:

1. Analysiere die bestehende Echo-Codebase systematisch
2. Erstelle ECHO_INVENTORY.md (was existiert)
3. Erstelle ECHO_GAP_ANALYSIS.md (was muss bleiben, ändern, ersetzen, neu bauen)
4. Schlage mir einen Migration Plan vor

Wichtig: Schreibe in dieser Phase KEINEN Produktivcode.
Erst nach meiner expliziten Freigabe des Migration Plans gehen wir an die Umsetzung.
```



Claude Code wird jetzt deine bestehende Codebase durchgehen und zwei Dokumente erstellen. Das ist die wichtigste Phase. Nimm dir Zeit, die Outputs zu lesen.

### Prompt 2 - Migration Plan kalibrieren

Nach dem Lesen der Discovery-Outputs gibst du Feedback. Typische Reaktionen:


```
Gut. Bei [Feature X] willst du refactoren, ich würde aber bevorzugen:
- Komplett ersetzen, weil [Grund]
- ODER stärker beibehalten, weil [Grund]

Aktualisiere den Migration Plan entsprechend und zeig mir die finale Version.
```



### Prompt 3 - Migration freigeben


```
Migration Plan freigegeben. Starte mit Phase 1 des Migration Plans.

Vor jeder destruktiven Operation (Schema-Änderung, File-Delete, größeres Refactor):
1. Beschreibe was du vorhast
2. Liste die betroffenen Files
3. Warte auf mein "Go" bevor du es ausführst
```



### Prompt 4+ - Iterativ arbeiten

Für jede Migration-Phase:


```
Nächste Phase: [Phase X]. Geh vor wie etabliert: zeigen vor ausführen.
```



## Was Discovery liefern sollte

Nach Prompt 1 solltest du diese zwei Dateien in deinem Repo haben:

### ECHO_INVENTORY.md - was existiert

Sollte beantworten:
- Welches Framework (Next.js? Anderes?)
- Welche Datenbank (Supabase? Postgres pur? Prisma?)
- Welches aktuelle Datenmodell (welche Tabellen, welche Felder)
- Welche Routes existieren
- Welche AI-Integrationen sind bereits da
- Welche Features funktionieren, welche sind halbfertig

### ECHO_GAP_ANALYSIS.md - was muss passieren

Sollte für jeden Aspekt aus dem Briefing einordnen:
- KEEP: existiert bereits, passt zum Ziel
- REFACTOR: existiert, muss geändert werden
- REPLACE: existiert, muss weg, durch neue Logik ersetzt
- BUILD: existiert nicht, muss neu gebaut werden

Plus: Risiko-Einschätzung pro Änderung.

## Migration Plan - typische Phasen

Was Claude Code typischerweise vorschlagen wird (Reihenfolge orientiert sich an Risiko):

Phase A - Datenmodell-Migration (niedriges Risiko, hoher Hebel)
- Neue Spalten hinzufügen: depth, purpose, mode
- Bestehende Daten in neue Felder mappen (z.B. alter stakeholder_type -> purpose)
- Alte Felder als deprecated markieren, aber behalten

Phase B - Server Actions / API umstellen
- Neue Server Actions schreiben, die mit neuen Feldern arbeiten
- Alte Endpoints parallel laufen lassen

Phase C - UI schrittweise umstellen
- Person Detail Page mit 3-Achsen-Badges
- Quick-Add-Formular mit neuen Feldern
- People List mit neuen Filtern

Phase D - KI-Layer integrieren
- Claude API für Extraction
- PDL Enrichment
- Suggestion System

Phase E - Aufräumen
- Alte Felder entfernen
- Alte Endpoints entfernen
- Tests grün

## Entscheidung Refactor vs. Parallel-Neubau

Die Gap Analysis wird zeigen, wie groß der Delta zwischen Echo und dem Briefing-Ziel ist:

- Wenn <40% ersetzt werden müssen: Refactor lohnt sich, schrittweise Migration
- Wenn >70% ersetzt werden müssen: Parallel-Neubau mit Daten-Import am Ende ist oft schneller

Diese Entscheidung triffst du nach Lesen der Discovery-Outputs.

## Tipps für die Arbeit mit Claude Code bei Refactors

Was gut funktioniert:
- Klare Phasen-Trennung (Discovery -> Plan -> Migration)
- Jede Phase einzeln freigeben
- Vor destruktiven Änderungen immer Bestätigung verlangen
- Branch pro Migrationsphase

Was du vermeiden solltest:
- Mehrere Migration-Phasen parallel angehen
- Discovery überspringen ("ich kenne meinen Code schon")
- Direkt auf main arbeiten
- Datenbank-Migrationen ohne Backup

Wenn Claude Code etwas vorschlägt, was sich falsch anfühlt:


```
Stop. Schau in PERSONAL_CRM_BUILD_BRIEFING.md Abschnitt [X] nochmal genau.
Dein Vorschlag widerspricht [konkretes Prinzip]. Korrigiere bitte.
```


## Geschätzte Zeit für den Echo-Refactor

Hängt stark davon ab, wie viel bestehender Code übernommen werden kann.

- Discovery + Plan: 1 Arbeitstag
- Phase A (Datenmodell): 1-2 Tage
- Phase B (Server Layer): 2-3 Tage
- Phase C (UI): 3-5 Tage
- Phase D (KI): 2-3 Tage
- Phase E (Cleanup): 1 Tag

Gesamt: 10-15 Arbeitstage. Falls die Gap Analysis zeigt, dass >70% ersetzt werden müssen, kann ein Parallel-Neubau schneller sein. Das entscheiden wir nach Discovery.
