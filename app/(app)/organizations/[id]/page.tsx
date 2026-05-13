import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getOrganizationById,
  listPeopleForOrganization,
} from "@/lib/organizations";
import { DeleteOrganizationButton } from "./delete-button";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [org, people] = await Promise.all([
    getOrganizationById(id),
    listPeopleForOrganization(id),
  ]);
  if (!org) notFound();

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl space-y-10">
        <Link
          href="/organizations"
          className="t-label inline-flex items-center hover:text-ink-1"
        >
          ← Organisationen
        </Link>

        <div className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
              {org.name}
            </h1>
            {org.industry && (
              <p className="text-sm text-ink-3">{org.industry}</p>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              {(org.tags ?? []).map((t) => (
                <Link
                  key={t}
                  href={`/organizations?tag=${encodeURIComponent(t)}`}
                  className="tag transition hover:border-action hover:text-action"
                >
                  <span className="dot" />
                  {t}
                </Link>
              ))}
              {org.enriched_at && (
                <span
                  className="tag"
                  style={{
                    borderColor: "var(--action)",
                    color: "var(--action)",
                  }}
                >
                  Auto-Enrich {fmtDate(org.enriched_at)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/organizations/${org.id}/edit`}
              className="rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-ink-3 hover:text-ink-1"
            >
              Bearbeiten
            </Link>
            <DeleteOrganizationButton id={org.id} name={org.name} />
          </div>
        </div>

        <section>
          <div className="section-head">
            <span className="t-label">Stammdaten</span>
            <span className="rule" />
          </div>
          <dl className="kv">
            <dt>Domain</dt>
            <dd className="mono">{org.domain ?? "—"}</dd>
            <dt>Website</dt>
            <dd className="mono">
              {org.website ? (
                <a
                  href={org.website}
                  target="_blank"
                  rel="noopener"
                  className="transition hover:text-action"
                >
                  {org.website}
                </a>
              ) : (
                "—"
              )}
            </dd>
            <dt>Größe</dt>
            <dd>{org.size ?? "—"}</dd>
            <dt>HQ</dt>
            <dd>{org.hq ?? "—"}</dd>
          </dl>
        </section>

        {org.description && (
          <section>
            <div className="section-head">
              <span className="t-label">Beschreibung</span>
              <span className="rule" />
            </div>
            <p className="text-sm leading-relaxed text-ink-2">
              {org.description}
            </p>
          </section>
        )}

        {org.notes && (
          <section>
            <div className="section-head">
              <span className="t-label">Notizen</span>
              <span className="rule" />
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-1">
              {org.notes}
            </p>
          </section>
        )}

        <section>
          <div className="section-head">
            <span className="t-label">
              Personen · {people.length}
            </span>
            <span className="rule" />
          </div>
          {people.length === 0 ? (
            <p className="text-sm italic text-ink-3">
              Noch keine Person dieser Organisation zugeordnet. Auf einer
              Person-Detail-Seite die Firma „{org.name}" eintragen — sie
              erscheint dann hier.
            </p>
          ) : (
            <ul className="overflow-hidden rounded border border-rule bg-paper">
              {people.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/people/${p.id}`}
                    className="flex items-center gap-4 border-b border-rule-soft px-4 py-3 last:border-0 transition-colors hover:bg-paper-2"
                  >
                    <span className="avatar" aria-hidden>
                      {initials(p.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-1">
                        {p.name}
                      </span>
                      {p.role && (
                        <p className="truncate font-mono text-[10px] tracking-wider text-ink-4">
                          {p.role}
                        </p>
                      )}
                    </div>
                    {p.last_contact_at && (
                      <span className="font-mono text-[11px] text-ink-3">
                        {fmtDate(p.last_contact_at)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
