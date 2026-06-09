# Ausstehende Entscheidungen — ECHO

Living doc für offene Produkt-/Architektur-Entscheidungen auf dem aktiven `main`-Stand.
Pro Eintrag: **Was** offen ist, **Meine Empfehlung**, **Warum es zählt**, **Status**.
Wenn etwas entschieden ist → in „Erledigt" unten verschieben (mit Datum).

> Hinweis: Die SaaS-Pivot-Entscheidungen (Tiers, Stripe, Auth-Hardening, LLM-Credits,
> Admin-Backend, MCP) liegen im geparkten Worktree-/Backup-Branch
> `backup/session-work-pre-rebase` und sind hier bewusst NICHT dupliziert.

Last updated: 2026-06-09

---

## 1. Kalender- & Erinnerungs-Sync (Apple/Siri + Google) — KONZEPT, noch nicht gebaut

**Was:** Termine & Erinnerungen (`people.important_dates` — Geburtstage, Jahrestage,
„kennengelernt", eigene Anlässe, jeweils mit optionalem `remind` + `remind_lead_days`)
sollen automatisch und „unsichtbar" in den Kalender des Users fließen — Apple Calendar /
Siri sowie Google Calendar / gcal. Der manuelle `.ics`-Download-Button wurde am
2026-06-09 entfernt (Commit `45b1e7c`), weil er nicht zum Ziel „einmal einrichten, dann
still im Hintergrund" passt.

### Technische Ausgangslage (recherchiert 2026-06-09)
- **Siri hat keine API für Web-Apps.** Siri liest aus den System-Apps *Kalender* +
  *Erinnerungen*. Der einzige Weg zu Siri ist: Daten in Apple Calendar / Apple Reminders
  bekommen — dann sieht Siri sie automatisch.
- **Apple und Google sind asymmetrisch:**
  - **Google** hat eine saubere Cloud-API (Google Calendar API, OAuth) → echtes
    Zwei-Wege, sofort, programmatische Erinnerungen.
  - **Apple** hat *keine* einfache Cloud-API. Wege: (a) abonnierter ICS-Feed (read-only,
    iCloud synct auf alle Geräte → Siri liest ihn), (b) CalDAV (schmerzhaft, App-spezifische
    Passwörter), (c) native iOS-App mit EventKit + App Intents (= Siri-nativ, großer Aufwand;
    ECHO ist eine Web-App).

### Drei realistische Stufen
- **Stufe 1 — Abonnierter Kalender-Feed (`webcal://`).** Pro User eine geheime URL, die er
  **einmal** in Apple/Google als „Kalender abonnieren" hinzufügt; danach hält ECHO sie
  aktuell. Kein OAuth, ein Setup, deckt **beide** Ökosysteme + Siri (über Apple Calendar) ab.
  - *Einschränkungen (ehrlich):* read-only (ECHO → Kalender, nicht zurück);
    Refresh-Latenz Apple alle paar Stunden, Google teils ~24h (Google steuert das, nicht wir);
    Alarme (VALARM) zuverlässig auf Apple, auf Google-Abos oft ignoriert. Für
    Geburtstage/Jahrestage völlig okay, für taggleiche Reminder mittelmäßig.
- **Stufe 2 — Google Calendar API (OAuth).** Für Google-User: sofort, zwei-Wege, echte
  Erinnerungen mit Alerts, anlegen/ändern/löschen. Aufwand: OAuth-Flow, Token-Storage +
  Refresh, Google-Cloud-Projekt.
- **Stufe 3 — Apple Siri-nativ.** Nur via native iOS-Companion-App (EventKit schreibt direkt
  in den Gerätekalender, App Intents = Siri-Shortcuts). Eigener großer Lift, weit später.

### Meine Empfehlung
Mit **Stufe 1** starten — der „unsichtbare Weg": ein per-User-Secret-Feed
`/api/calendar/[token].ics`, der **alle** Signale + Erinnerungen aller Personen aggregiert
(die vorhandene ICS-Generierung aus `/api/people/[id]/dates.ics` lässt sich wiederverwenden;
neue Spalte z.B. `profiles.calendar_token`, da Kalender-Clients keine Auth-Cookies senden).
Danach **Stufe 2** (Google OAuth) für Power-User; **Stufe 3** nur falls eine native App kommt.

**Status:** Konzept festgehalten (Patrick: „nur Konzept, nicht bauen", 2026-06-09). Kein Code
außer der Button-Entfernung. Wenn gebaut werden soll → Stufe-1-Feed ist der erste Schritt.

---

## Erledigt (Archiv)

- **2026-06-09** — `.ics`-Export-Button aus der Signals-Sektion entfernt; Ziel ist
  automatischer Abo-/API-Sync statt manuellem Download (`45b1e7c`).
