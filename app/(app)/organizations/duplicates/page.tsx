import Link from "next/link";
import { listOrganizationDuplicates } from "@/lib/duplicates";
import { DuplicatePairCard } from "@/components/duplicate-pair-card";

export const metadata = {
  title: "Doppelte Organisationen",
};

export default async function OrganizationDuplicatesPage() {
  const pairs = await listOrganizationDuplicates();
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
            Doppelte Organisationen
          </h1>
          <p className="text-sm text-ink-3">
            ECHO scannt nach Organisationen mit gleichem Namen oder
            gleicher Domain. Beim Mergen werden alle verlinkten Personen
            und Deals auf die behaltene Organisation umgehängt.
          </p>
          <p className="text-xs text-ink-4">
            <Link
              href="/organizations"
              className="underline-offset-2 hover:underline"
            >
              ← zurück zu Organisationen
            </Link>
          </p>
        </header>

        {pairs.length === 0 && (
          <div className="rounded-2xl border border-rule bg-paper-2 px-6 py-12 text-center">
            <p className="t-label mb-2">Sauber</p>
            <p className="text-sm text-ink-3">
              Keine möglichen Org-Duplikate gefunden.
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
          return (
            <section key={band} className="space-y-3">
              <h2 className="text-sm font-semibold text-ink-1">
                {labels[band]}
                <span className="ml-2 font-mono text-xs font-normal text-ink-4">
                  {items.length}
                </span>
              </h2>
              <div className="space-y-3">
                {items.map((pair) => (
                  <DuplicatePairCard
                    key={pair.pair_id}
                    primary={{
                      id: pair.primary_id,
                      title: pair.primary_name,
                      subtitle:
                        [pair.primary_domain, pair.primary_industry]
                          .filter(Boolean)
                          .join(" · ") || null,
                      href: `/organizations/${pair.primary_id}`,
                    }}
                    secondary={{
                      id: pair.secondary_id,
                      title: pair.secondary_name,
                      subtitle:
                        [pair.secondary_domain, pair.secondary_industry]
                          .filter(Boolean)
                          .join(" · ") || null,
                      href: `/organizations/${pair.secondary_id}`,
                    }}
                    score={pair.score}
                    confidence={pair.confidence}
                    reasons={pair.reasons}
                    endpoint="/api/duplicates/organizations"
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
