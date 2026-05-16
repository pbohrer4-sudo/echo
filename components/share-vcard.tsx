// Teilen-Block für das eigene Profil. Generiert eine vCard aus Person
// + Contacts und rendert sie als QR-Code (server-side via `qrcode` lib
// als SVG-String). Beim Scannen mit einer beliebigen Kamera-App
// öffnet sich der native Kontakt-Import-Dialog — funktioniert mit
// jedem Smartphone, kein echo nötig auf der anderen Seite.

import QRCode from "qrcode";
import type { Person, PersonContact } from "@/lib/types";
import { buildVCard } from "@/lib/vcard";

export async function ShareVCard({
  person,
  contacts,
}: {
  person: Person;
  contacts: PersonContact[];
}) {
  const vcard = buildVCard({ person, contacts });

  // QR-Code als SVG-String. Margin 1 (statt Standard 4) damit der Code
  // bei kleinen Screens mehr Platz hat. ErrorCorrectionLevel M ist ein
  // guter Trade-off — höher → mehr Reservoir, größerer Code.
  const svg = await QRCode.toString(vcard, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 280,
    color: { dark: "#14110d", light: "#ffffff" },
  });

  // Data-URL für den „.vcf herunterladen"-Button. base64 weil vCard
  // CRLF und Sonderzeichen enthalten kann, die in Plain-Data-URIs
  // schief gehen.
  const vcardB64 = Buffer.from(vcard, "utf-8").toString("base64");
  const dataUrl = `data:text/vcard;base64,${vcardB64}`;
  const downloadName = `${person.name.replace(/\s+/g, "-")}.vcf`;

  return (
    <section className="space-y-4">
      <div className="section-head">
        <span className="t-label">Teilen</span>
        <span className="rule" />
      </div>
      <div className="rounded border border-rule bg-paper p-4">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div
            className="rounded bg-white p-3"
            // Server hat den SVG-String generiert; rendern als
            // dangerouslySetInnerHTML weil wir das SVG nicht parsen
            // wollen. Source ist `qrcode`-Lib + sanitized vCard.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <div className="flex max-w-xs flex-col gap-2 text-sm text-ink-2">
            <p>
              Lass jemanden den QR-Code mit der Kamera scannen —
              Telefon, Email, Adresse landen direkt in deren Kontakten.
            </p>
            <p className="text-xs text-ink-3">
              Wer ECHO benutzt, scannt mit der App-Kamera und kriegt die
              Person inkl. Goldfeld direkt ins CRM.
            </p>
            <a
              href={dataUrl}
              download={downloadName}
              className="inline-flex w-fit items-center gap-1.5 rounded border border-rule bg-paper-2 px-3 py-1.5 text-xs text-ink-2 transition hover:border-action hover:text-action"
            >
              .vcf herunterladen
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
