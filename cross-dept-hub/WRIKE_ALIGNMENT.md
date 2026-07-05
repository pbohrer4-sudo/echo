# Wrike-Alignment - Research & Umsetzung

Ergebnis der Recherche zu Wrikes Datenmodell, Ordner-Logik und
Benachrichtigungen, und wie der Cross-Dept Hub das jeweils abbildet.

## 1. Datenmodell: Ordner = Projekt

In Wrikes Datenmodell sind **Projekte einfach Ordner mit Zusatzattributen**
(Owner, Start-/Enddatum, Status). Ordner selbst sind reine Container ohne
eigene Attribute; beides lässt sich ineinander umwandeln. Der Baum ist
mehrelterig - ein Task kann in mehreren Ordnern/Spaces gleichzeitig leben
(**Cross-Tagging ist Multi-Parenting**, keine Kopie).

**Hub:** `pm_folders` (Container) und `pm_projects` (mit Status/AI-Modus)
getrennt; Cross-Tagging über `pm_task_locations` (Task ↔ Abteilung/Ordner).
Bewusste Abweichung: getrennte Tabellen statt einer Entität - einfacher, und
die Umwandlung Ordner ↔ Projekt entfällt.

## 2. Status-Gruppen (Workflows)

Jeder Wrike-Workflow gruppiert Statusse in **Active / Completed / Deferred /
Cancelled**. Completed/Deferred/Cancelled-Tasks verschwinden aus To-do-Mails
und Überfällig-Widgets. Neue Tasks bekommen den ersten Active-Status.

**Hub:** Statusse `deferred` + `cancelled` ergänzt (Migration 0009);
`STATUS_GROUP`-Mapping in `lib/pm/types.ts`. Alles, was "offen" zählt
(Workload, Überfällig, Posteingang-Badge, Risiko, To-do), filtert jetzt auf
die Active-Gruppe. Frei konfigurierbare Custom-Workflows pro Space sind NICHT
umgesetzt (fester Statussatz) - bewusste Vereinfachung.

## 3. Benachrichtigungen (Inbox)

Wrikes Inbox feuert bei: **Zuweisung**, **@Mention**, Projekt-Owner-Zuweisung.
Der **Wrike Bot** meldet zusätzlich: Task **startklar** (alle unmittelbaren
Vorgänger abgeschlossen) und **alle Unteraufgaben erledigt/zurückgestellt/
abgebrochen** (Parent bereit für Review). Statusänderungen sind E-Mail, nicht
Inbox.

**Hub** (`lib/pm/signals.ts`): Zuweisungs-Notification (Task anlegen,
Details ändern, Automatisierung), @Mention-Parsing in Kommentaren gegen
Workspace-Anzeigenamen, und die beiden Bot-Signale - synchron beim
Statuswechsel in die Completed-Gruppe statt stündlichem Polling, jeweils mit
System-Kommentar ("[Hub-Bot] …") und Inbox-Notification an die zugewiesene
Person. Neue Notification-Typen: `assigned`, `mention`, `ready_to_start`,
`review_ready`.

## 4. Abhängigkeiten

Wrike kennt vier Typen: **FS, SS, FF, SF**; Automationen können Nachfolger
umstellen, wenn alle Vorgänger fertig sind.

**Hub:** `dependency_type` auf `pm_task_dependencies`; Picker + Entfernen auf
der Task-Detailseite. Das Startklar-Signal wertet nur start-blockierende
Typen (FS/SS). Gantt zeichnet keine Abhängigkeitspfeile (Lücke).

## 5. Dauer & Arbeitstage

Wrike: Dauer = Start→Fällig inkl., **"Working Days Only" standardmäßig an**
(Wochenenden zählen nicht; 29.6.(Mo) → 3.7.(Fr) = 5d).

**Hub:** `durationDays()` / `addDurationDays()` in `types.ts`; Badge
"Start → Fällig (Xd)" auf der Detailseite; Feld "Dauer (Tage)" + Checkbox
"Nur Arbeitstage" berechnen das Fälligkeitsdatum serverseitig.

## 6. Spaces: Persönlich, Team, Mitglieder

Wrike legt pro User automatisch einen **Personal Space** an (privat, nicht
teilbar); Team-/Private-Spaces haben Mitglieder + Rollen ("Manage members
and sharing"); dazu **Bookmarks** (Quick-Links, optional in Sektionen).

**Hub:** `pm_departments.personal_owner_id` - "Persönlich" wird beim ersten
Aufruf von /teams angelegt, ist für andere unsichtbar (auch per Direkt-URL);
Mitgliederverwaltung (Rolle Mitglied/Lead/Beobachter) im Abteilungs-Tab
Einstellungen - Mitgliedschaft steuert, wer die Benachrichtigungen der
Abteilung erhält; Lesezeichen-Leiste auf der Abteilungsseite
(`pm_bookmarks`). Hinweis: Die Privatheit des persönlichen Bereichs ist eine
Produktregel oberhalb der Workspace-RLS (wie in Wrike: gleiche Account-Ebene).

## 7. Persönliche Ansichten

Wrike: **My to-do** (zugewiesene Tasks, gruppiert nach Fälligkeit),
**Created by me**, **Stream** (Aktivitäts-Feed mit Filtern).

**Hub:** `/teams/my-todo` (Buckets: Überfällig / Heute / Diese Woche /
Später / Ohne Termin + "Von mir erstellt") und `/teams/stream` (letzte
Kommentare + Bot-Updates, Filter "Ohne Auto-Updates").

## Bekannte Lücken (bewusst)

- Custom-Workflows/Statusse pro Space (fester Statussatz mit Gruppen statt frei definierbar)
- Ordner ↔ Projekt-Umwandlung (getrennte Entitäten)
- Gantt: keine Abhängigkeitspfeile, kein Drag & Drop
- E-Mail-Benachrichtigungs-Einstellungen pro User
- Proofing mit visuellen Markups

## Quellen

- [Wrike API: Folders & Projects](https://developers.wrike.com/api/v4/folders-projects/)
- [Folder vs Project](https://help.wrike.com/hc/en-us/community/posts/1500000271041-Folder-vs-Project)
- [How Wrike Is Structured: Spaces, Folders, Projects, Tasks](https://community.wrike.com/discussion/2914/how-wrike-is-structured-spaces-folders-projects-and-tasks)
- [Status Groups in Wrike](https://help.wrike.com/hc/en-us/articles/29984582493719-Status-Groups-in-Wrike)
- [Default vs. Custom Workflows](https://help.wrike.com/hc/en-us/articles/1500005219382-Default-vs-Custom-Workflows)
- [Inbox in Wrike](https://help.wrike.com/hc/en-us/articles/210323705-Inbox-in-Wrike)
- [Email Notifications](https://help.wrike.com/hc/en-us/articles/210324405-Email-Notifications)
- [@Mentions in Wrike](https://help.wrike.com/hc/en-us/articles/209603269--Mentions-in-Wrike)
- [Types of Spaces](https://help.wrike.com/hc/en-us/articles/1500005120381-Types-of-Spaces)
- [Personal Space](https://help.wrike.com/hc/en-us/articles/360034765174-Personal-Space)
- [Scheduling a Task (Working Days Only)](https://help.wrike.com/hc/en-us/articles/1500005217782-Scheduling-a-Task)
- [Managing Bookmarks in Spaces](https://help.wrike.com/hc/en-us/articles/360021667233-Managing-Bookmarks-in-Spaces)
- [Full set of task dependencies](https://www.wrike.com/blog/meet-the-full-set-of-task-dependencies/)
- [Automation: successor In Progress when predecessor Complete](https://help.wrike.com/hc/en-us/community/posts/23033915179927-Automation-Successor-task-In-Progress-when-Predecessor-is-Complete)
