-- 0029 — Strukturierte Locations via OpenStreetMap-Nominatim.
--
-- Die drei freitext-Location-Felder auf people bleiben unangetastet
-- (display-Wert), aber daneben kommt je eine optionale jsonb-Spalte mit
-- den strukturierten Geo-Daten falls der Nutzer einen Vorschlag aus
-- dem Autocomplete übernimmt. Schema des JSONB-Werts:
--
--   { display_name: text,  -- "München, Bayern, Deutschland"
--     lat:          float,
--     lng:          float,
--     place_id:     text,   -- Nominatim place_id (numerisch, als String)
--     osm_type:     text,   -- node/way/relation
--     osm_id:       text }
--
-- NULL bedeutet: User hat freien Text eingegeben (kein Autocomplete).
-- Das ist okay — strukturierte Daten sind ein Nice-to-have für späteres
-- „Personen im Umkreis", nicht Pflicht.
--
-- life_events hat lat/lng/google_place_id bereits aus 0027. Wir nutzen
-- google_place_id pragmatisch für die OSM-place_id — Spaltenname ist
-- jetzt irreführend, aber Umbenennen würde Migration teurer machen.

alter table people
  add column if not exists current_location_geo jsonb,
  add column if not exists home_location_geo jsonb,
  add column if not exists met_location_geo jsonb;
