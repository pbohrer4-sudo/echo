-- 0028 — per-link Notes auf person_tags / passions / person_circles.
--
-- Dasselbe Tag bedeutet bei verschiedenen Personen verschiedenes
-- („Padel" → spielen wir Donnerstags vs. kennt jemanden der spielt).
-- Die Note gehört deshalb auf die Junction-Tabelle, nicht auf die
-- globale Tag-Definition.
--
-- Drei optionale text-Spalten. Kein Backfill nötig — leere Notes sind
-- in der UI dasselbe wie „keine Daten hinterlegt".

alter table person_tags    add column if not exists note text;
alter table passions       add column if not exists note text;
alter table person_circles add column if not exists note text;
