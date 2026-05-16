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

## QR-Code scannen + automatisch Person anlegen

Stand `512f5c6`: Self-Profile zeigt einen vCard-QR-Code zum Teilen
(`components/share-vcard.tsx`). Beim Empfänger landet das im
nativen Kontakt-Import des Telefons — funktioniert für Nicht-Echo-
User out-of-the-box.

Zu bauen: Wenn der Empfänger ECHO benutzt, sollte er den QR-Code
INNERHALB der App scannen können und die Person inkl. aller
strukturierten Felder direkt im CRM landen.

Architektur:
- Neuer Button „QR scannen" auf /people/new neben dem Voice-Capture.
- Browser-BarcodeDetector-API wo verfügbar (Chrome, Edge), sonst
  Fallback auf html5-qrcode (kleine Lib, ~30kb).
- Geparster vCard-String → parseVcards() (existiert bereits in
  lib/vcard.ts) → Quick-Add-Form pre-filled → Bestätigen.
- Bonus: vCard kann Custom-X-Fields tragen. Echo könnte
  X-ECHO-PURPOSE / X-ECHO-PASSIONS etc. einfügen die parseVcards
  versteht und in die strukturierten Felder schreibt.
