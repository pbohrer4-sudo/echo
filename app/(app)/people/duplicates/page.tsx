import Link from "next/link";
import { listPeopleDuplicates } from "@/lib/duplicates";
import { DuplicatePairCard } from "@/components/duplicate-pair-card";

export const metadata = {
  title: "Doppelte Personen",
};

export default async function PeopleDuplicatesPage() {
  const pairs = await listPeopleDuplicates();
  const grouped = {
    high: pairs.filter((p) => p.confidence === "high"),
    medium: pairs.filter((p) => p.confidence === "medium"),
    low: pairs.filter((p) => p.confidence === "low"),
  };

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Aufräumen</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Doppelte Personen
          </h1>
          <p className="text-sm text-ink-3">
            ECHO findet Personen, die sich mit hoher Wahrscheinlichkeit
            überschneiden — über Name, Email, Telefon oder Firma. Beim
            Mergen werden Telefonnummern, Emails, Adressen, Tags,
            Stakeholder-Felder usw. zusammengeführt; Interaktionen,
            Notizen, Erinnerungen und Aufgaben wandern auf die behaltene
            Person.
          </p>
          <p className="text-xs text-ink-4">
            <Link
              href="/people"
              className="underline-offset-2 hover:underline"
            >
              ← zurück zur Personen-Liste
            </Link>
          </p>
        </header>

        {pairs.length === 0 && (
          <div className="rounded-2xl border border-rule bg-paper-2 px-6 py-12 text-center">
            <p className="t-label mb-2">Sauber</p>
            <p className="text-sm text-ink-3">
              Keine möglichen Duplikate gefunden. ECHO scannt automatisch
              jedes Mal neu, wenn diese Seite geladen wird.
            </p>
          </div>
        )}

        {(["high", "medium", "low"] as const).map((band) => {
          const items = grouped[band];
          if (items.length === 0) return null;
          const labels = {
            high: "Hohe Wahrscheinlichkeit",
            medium: "Mittlere Wahrscheinlichkeit",
            low: "Zum Drüberschauen",
          } as const;
          const descs = {
            high: "Klare Treffer — Name + Email/Telefon stimmen überein.",
            medium: "Wahrscheinlich dieselbe Person — kurz prüfen.",
            low: "Mögliche Treffer — eher Hinweise als Sicheres.",
          } as const;
          return (
            <section key={band} className="space-y-3">
              <div className="space-y-0.5">
                <h2 className="text-sm font-semibold text-ink-1">
                  {labels[band]}
                  <span className="ml-2 font-mono text-xs font-normal text-ink-4">
                    {items.length}
                  </span>
                </h2>
                <p className="text-xs text-ink-3">{descs[band]}</p>
              </div>
              <div className="space-y-3">
                {items.map((pair) => (
                  <DuplicatePairCard
                    key={pair.pair_id}
                    primary={{
                      id: pair.primary_id,
                      title: pair.primary_name,
                      subtitle:
                        [pair.primary_role, pair.primary_company]
                          .filter(Boolean)
                          .join(" · ") || null,
                      href: `/people/${pair.primary_id}`,
                      avatarUrl: pair.primary_avatar_url,
                    }}
                    secondary={{
                      id: pair.secondary_id,
                      title: pair.secondary_name,
                      subtitle:
                        [pair.secondary_role, pair.secondary_company]
                          .filter(Boolean)
                          .join(" · ") || null,
                      href: `/people/${pair.secondary_id}`,
                      avatarUrl: pair.secondary_avatar_url,
                    }}
                    score={pair.score}
                    confidence={pair.confidence}
                    reasons={pair.reasons}
                    endpoint="/api/duplicates/people"
                    initialPrimaryId={pair.primary_id}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
