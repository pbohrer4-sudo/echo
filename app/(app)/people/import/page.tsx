import Link from "next/link";
import { ImportRunner } from "./import-runner";

export const metadata = {
  title: "Kontakte importieren",
};

export default function ImportPage() {
  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">iPhone Contacts</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Kontakte importieren
          </h1>
          <p className="max-w-2xl text-sm text-ink-3">
            Lade eine .vcf-Datei aus deinen iPhone- oder Mac-Kontakten hoch.
            Echo erkennt Duplikate, vergibt Organisationen automatisch und
            legt Telefonnummern, Mails, Adressen und Geburtstage gleich
            mit an.
          </p>
          <p className="text-xs text-ink-4">
            <Link
              href="/people"
              className="underline-offset-2 hover:underline"
            >
              ← zurück zu Personen
            </Link>
          </p>
        </header>
        <ImportRunner />
      </div>
    </div>
  );
}
