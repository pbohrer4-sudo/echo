# Backup Receipt — pre-refactor

Status der Phase-0-Daten-Sicherung. **Wird per .gitignore nicht committed**, dient nur als lokaler Marker.

**Snapshot-Zeitpunkt:** 2026-05-11T14:15:50.435597+00:00

**Tabellen-Counts:**

| Tabelle | Rows |
|---|---|
| people | 20 (aktiv + soft-deleted gemischt; ~11 aktiv) |
| organizations | 3 |
| interactions | 1 |
| notes | 0 |
| reminders | 3 |
| todos | 0 |
| debriefs | 2 |
| connections | 0 (tote Tabelle, ungenutzt) |
| service_connections | 0 |
| workflows | 7 (6 leere Drafts, 1 enabled Demo) |
| pipelines | 1 (Sales-Pipeline, 6 Stages) |
| deals | 0 |
| profiles | 1 (Patrick) |
| rate_limits | 20 |

**Beobachtungen für Migration-Risiko:**
- Sehr wenige produktive Daten — Migration-Risiko niedrig
- stakeholder_types nur bei 1 Person (Hannes Krieger, 4 Werte mit subtypes)
- depth_override nur bei 1 Person (Mirjam Bohrer = "Persönlich")
- Keine deals — Pipelines-Hide ist faktisch No-Op auf Daten-Ebene
- 1 Interaktion existiert — mit person_ids-Array (1 Person), source=debrief, topics-Array genutzt
- Patrick's profile.model_preferences: extract=opus-4-7, enrich=haiku-4-5

**Patricks-Aufgabe nach diesem Receipt:**
Speichere die Chat-Paste-JSON lokal als `backup-vor-refactor.json` im Repo-Root. Datei ist via `.gitignore` blockiert (`backup-vor-refactor.*` Pattern) — landet NICHT auf GitHub. Optional: zusätzlich auf USB-Stick oder Cloud-Drive außerhalb des Projekts.

## Schema-Re-Capture

Schema-Dump erfolgreich am 12. Mai 2026 via `pg_dump --schema-only --no-owner --no-acl` gegen Session-Pooler (`aws-1-eu-north-1.pooler.supabase.com:5432`). 6009 Zeilen gesamter Dump, 1671 davon im public-Schema. Daraus generiert: `supabase/migrations/0001_initial_schema.sql` (1706 Zeilen inkl. Header).

Inhalt 0001:
- 14 TABLES (connections, deals, debriefs, interactions, notes, organizations, people, pipelines, profiles, rate_limits, reminders, service_connections, todos, workflows)
- 6 FUNCTIONS (admin_overview_stats, admin_users_list, handle_new_user, rate_limit_increment, rate_limit_sweep, update_updated_at_column)
- 15 CONSTRAINTS (PKs + uniqueness)
- 34 INDEXES
- 3 TRIGGERS (updated_at auf people/notes/profiles)
- 23 FK CONSTRAINTS
- 55 RLS POLICIES
- 14 ROW SECURITY enables

Note: 0001 ist nicht idempotent — re-running auf einer Live-DB würde wegen existierender Objekte fehlschlagen. Dient als Dokumentation des Baseline-Schemas, nicht als ausführbare Migration. Für from-scratch Rebuild: 0001 zuerst, dann 0002-0018 in Reihenfolge.

**Restore-Plan falls Migration scheitert:**
1. `git checkout pre-refactor-snapshot`
2. Supabase Studio → SQL Editor → DELETE FROM ... (jede Tabelle in FK-Reihenfolge)
3. JSON-Records aus `backup-vor-refactor.json` per Script re-insert
4. Restore-Skript wird in Phase F-Cleanup als `scripts/restore-backup.mjs` mit committed (TBD).
