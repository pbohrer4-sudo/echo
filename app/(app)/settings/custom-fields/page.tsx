import Link from "next/link";
import { getFieldDefs } from "@/lib/custom-fields.server";
import { CustomFieldsManager } from "./manager";

export const dynamic = "force-dynamic";

export default async function CustomFieldsPage() {
  const defs = await getFieldDefs();

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-2xl space-y-8">
        <Link
          href="/settings"
          className="t-label inline-flex items-center hover:text-ink-1"
        >
          ← Settings
        </Link>
        <header className="space-y-2">
          <p className="t-label">Konfiguration</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Eigene Felder
          </h1>
          <p className="max-w-xl text-sm text-ink-3">
            Lege eigene Felder an, die bei jeder Person auftauchen — Freitext,
            Zahl, Datum, Auswahl oder Ja/Nein. Die Werte pflegst du dann pro
            Person über Bearbeiten.
          </p>
        </header>

        <CustomFieldsManager initialDefs={defs} />
      </div>
    </div>
  );
}
