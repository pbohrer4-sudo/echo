import Link from "next/link";
import type {
  AddressEntry,
  EmailEntry,
  ImportantDate,
  PhoneEntry,
  RelationshipEntry,
  SocialEntry,
} from "@/lib/types";

export function PhoneList({ phones }: { phones: PhoneEntry[] }) {
  if (phones.length === 0)
    return <p className="text-xs italic text-ink-4">Keine Nummern hinterlegt.</p>;
  return (
    <ul className="space-y-2">
      {phones.map((p, i) => (
        <li key={i} className="flex items-baseline justify-between gap-4">
          <span className="t-label w-20 shrink-0">{p.label}</span>
          <a
            href={`tel:${p.value.replace(/\s+/g, "")}`}
            className="flex-1 truncate text-sm text-ink-1 transition hover:text-action"
          >
            {p.value}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function EmailList({ emails }: { emails: EmailEntry[] }) {
  if (emails.length === 0)
    return <p className="text-xs italic text-ink-4">Keine Email-Adressen.</p>;
  return (
    <ul className="space-y-2">
      {emails.map((em, i) => (
        <li key={i} className="flex items-baseline justify-between gap-4">
          <span className="t-label w-20 shrink-0">{em.label}</span>
          <a
            href={`mailto:${em.value}`}
            className="flex-1 truncate text-sm text-ink-1 transition hover:text-action"
          >
            {em.value}
          </a>
        </li>
      ))}
    </ul>
  );
}

function addressMapUrl(a: AddressEntry): string {
  const parts = [a.street, a.postal_code, a.city, a.country].filter(Boolean);
  return `https://maps.apple.com/?q=${encodeURIComponent(parts.join(", "))}`;
}

export function AddressList({ addresses }: { addresses: AddressEntry[] }) {
  if (addresses.length === 0)
    return <p className="text-xs italic text-ink-4">Keine Adressen.</p>;
  return (
    <ul className="space-y-3">
      {addresses.map((a, i) => (
        <li key={i} className="space-y-1">
          <span className="t-label">{a.label}</span>
          <a
            href={addressMapUrl(a)}
            target="_blank"
            rel="noopener"
            className="block text-sm text-ink-1 transition hover:text-action"
          >
            {a.street && <span className="block">{a.street}</span>}
            {(a.postal_code || a.city) && (
              <span className="block">
                {[a.postal_code, a.city].filter(Boolean).join(" ")}
              </span>
            )}
            {a.country && <span className="block">{a.country}</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}

function socialUrl(s: SocialEntry): string {
  const v = s.handle_or_url.trim();
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "");
  switch (s.platform) {
    case "LinkedIn":
      return `https://linkedin.com/in/${handle}`;
    case "Twitter":
      return `https://twitter.com/${handle}`;
    case "Instagram":
      return `https://instagram.com/${handle}`;
    case "GitHub":
      return `https://github.com/${handle}`;
    case "Bluesky":
      return `https://bsky.app/profile/${handle}`;
    case "Threads":
      return `https://threads.net/@${handle}`;
    case "TikTok":
      return `https://tiktok.com/@${handle}`;
    case "Mastodon": {
      const stripped = handle.replace(/^@/, "");
      const parts = stripped.split("@");
      if (parts.length === 2) return `https://${parts[1]}/@${parts[0]}`;
      return `https://mastodon.social/@${stripped}`;
    }
    case "Website":
      return `https://${v.replace(/^https?:\/\//, "")}`;
    default:
      return v;
  }
}

export function SocialList({ socials }: { socials: SocialEntry[] }) {
  if (socials.length === 0)
    return <p className="text-xs italic text-ink-4">Keine Social Profiles.</p>;
  return (
    <ul className="space-y-2">
      {socials.map((s, i) => (
        <li key={i} className="flex items-baseline justify-between gap-4">
          <span className="t-label w-20 shrink-0">{s.platform}</span>
          <a
            href={socialUrl(s)}
            target="_blank"
            rel="noopener"
            className="flex-1 truncate text-sm text-ink-1 transition hover:text-action"
          >
            {s.handle_or_url}
          </a>
        </li>
      ))}
    </ul>
  );
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString(
    "de-DE",
    { day: "2-digit", month: "long", year: "numeric" },
  );
}

function leadLabel(days: number): string {
  if (days <= 0) return "Erinnert · am Tag";
  if (days === 1) return "Erinnert · 1 Tag vorher";
  if (days === 7) return "Erinnert · 1 Woche vorher";
  if (days === 14) return "Erinnert · 2 Wochen vorher";
  if (days === 30) return "Erinnert · 1 Monat vorher";
  return `Erinnert · ${days} Tage vorher`;
}

export function DateList({
  dates,
  personId,
}: {
  dates: ImportantDate[];
  personId: string;
}) {
  if (dates.length === 0)
    return <p className="text-xs italic text-ink-4">Keine Daten hinterlegt.</p>;
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {dates.map((d, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-4 text-sm"
          >
            <span className="t-label w-28 shrink-0">{d.label}</span>
            <span className="flex-1 text-ink-1">{fmtDate(d.date)}</span>
            {d.remind && (
              <span className="t-label text-action">
                {leadLabel(d.remind_lead_days ?? 0)}
              </span>
            )}
          </li>
        ))}
      </ul>
      <a
        href={`/api/people/${personId}/dates.ics`}
        download
        className="inline-flex rounded border border-rule px-3 py-1.5 text-xs text-ink-2 transition hover:border-action hover:text-action"
      >
        ↓ als .ics exportieren
      </a>
    </div>
  );
}

// V3 (0030): liest jetzt aus person_relationships statt JSONB-Array.
// label-Spalte aus der Tabelle bevorzugt; sonst Mapping aus
// relationship_type-Enum via RELATIONSHIP_TYPE_LABELS.
import {
  RELATIONSHIP_TYPE_LABELS,
  type PersonRelationship,
} from "@/lib/types";

export function RelationshipList({
  relationships,
  peopleMap,
}: {
  relationships: PersonRelationship[];
  peopleMap: Record<string, string>;
}) {
  if (relationships.length === 0)
    return <p className="text-xs italic text-ink-4">Keine Beziehungen.</p>;
  return (
    <ul className="space-y-2">
      {relationships.map((r) => {
        const name = peopleMap[r.related_person_id];
        const displayLabel =
          r.label && r.label.trim()
            ? r.label
            : RELATIONSHIP_TYPE_LABELS[r.relationship_type];
        return (
          <li
            key={r.id}
            className="flex items-baseline justify-between gap-4 text-sm"
          >
            <span className="t-label w-28 shrink-0">{displayLabel}</span>
            {name ? (
              <Link
                href={`/people/${r.related_person_id}`}
                className="flex-1 text-ink-1 transition hover:text-action"
              >
                {name}
              </Link>
            ) : (
              <span className="flex-1 italic text-ink-4">
                (nicht gefunden)
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
