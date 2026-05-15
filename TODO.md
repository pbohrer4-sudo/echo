# TODO

Offene Themen die der User explizit auf später vertagt hat.

## CTA-Chips auf Reminders ausführbar machen

Stand `2e02204`: `/api/reminders/ctas` liefert Vorschläge wie „Blumen für
Mirjam finden?" als anzeigbare Chips. Klick tut aktuell nichts.

Zu bauen: pro Chip einen Handler der die Action tatsächlich ausführt.
Optionen:
- „Recherchieren?" → Claude-Chat-Sheet mit Web-Search-Prompt öffnen
- „Geschenk finden?" → Pre-populated Search-Query an einem Anbieter
  (Amazon Affiliate?) oder strukturierter Vorschlag mit Tags+Passions
- „Nachricht entwerfen?" → DraftGenerator mit passender Use-Case-Vorlage
- „Termin buchen?" → Calendly/Cal.com-Link einfügen

Architektur-Idee: Jeder CTA-Vorschlag hat einen `kind` (research /
draft / book) den die LLM-API zusätzlich zum Text liefert, damit der
Client den richtigen Handler triggern kann.
