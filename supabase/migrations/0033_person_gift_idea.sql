-- Neues Person-Feld: "Geschenk". Freitext, was man dieser Person zum
-- nächsten Anlass schenken könnte. Per Briefing als 1-Wort-Kategorie
-- gewünscht — separates Feld statt freier Tag, weil der Wert pro
-- Person genau einmal vorkommt und im Profile-Header rendert.

alter table people
  add column if not exists gift_idea text;

comment on column people.gift_idea is
  'Freitext-Vorschlag was man dieser Person schenken würde. UI-Label: "Geschenk".';
