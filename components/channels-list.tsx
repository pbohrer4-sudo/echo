// „Stammdaten"-Block auf Person-Detail. Fix-Slots für die wichtigsten
// Stammdaten (Mobilfunk, Festnetz, Email, Adresse, LinkedIn, Website)
// werden IMMER gerendert — auch wenn leer, damit der User auf einen
// Blick sieht was noch fehlt. Zusätzliche Channels (Telegram, Signal,
// Socials etc.) werden chronologisch darunter angehängt.
//
// Datenquelle: person_contacts + person.addresses + person.linkedin_url.

import Link from "next/link";
import type { ReactNode } from "react";
import {
  CONTACT_CHANNEL_LABELS,
  GEO_TYPE_LABELS,
  type AddressEntry,
  type ContactChannel,
  type GeoType,
  type PersonContact,
  type PersonGeography,
} from "@/lib/types";
import { StammdatenSlot } from "@/components/stammdaten-slot";

interface Props {
  contacts: PersonContact[];
  // Optional damit die Stammdaten Adresse + Legacy linkedin_url
  // mitrendern können. Beide kommen aus der Person-Row.
  personId?: string;
  addresses?: AddressEntry[];
  linkedinUrl?: string | null;
  currentLocation?: string | null;
  homeLocation?: string | null;
  // Orte sind Teil der Stammdaten-Box (Patrick 2026-06-08). Aktive
  // Geo-Einträge rendern als Zeilen in der Box, inaktive als
  // „Frühere Orte"-Aufklapper darunter. geoAddSlot = die GeoAddRow.
  geographies?: PersonGeography[];
  geoAddSlot?: ReactNode;
}

const GEO_GROUP_ORDER: GeoType[] = [
  "wohnsitz_1",
  "wohnsitz_2",
  "residence",
  "current_location",
  "professional_hub",
  "origin",
  "met_location",
  "custom",
];

function geoLabel(g: PersonGeography): string {
  if (g.geo_type === "custom") return g.custom_label || "Weitere";
  return GEO_TYPE_LABELS[g.geo_type];
}

function geoValue(g: PersonGeography): string {
  const compact = g.city ?? g.display_name.split(",")[0];
  return g.custom_label && g.geo_type === "custom"
    ? g.display_name
    : compact;
}

interface ResolvedChannel {
  type: ContactChannel;
  label: string;
  value: string;
  href: string;
  is_primary: boolean;
}

function buildHref(c: PersonContact | null): string | null {
  if (!c) return null;
  const v = c.value.trim();
  if (!v) return null;
  const isUrl = v.startsWith("http://") || v.startsWith("https://");
  switch (c.channel) {
    case "email":
      return `mailto:${v}`;
    case "phone":
      return `tel:${v}`;
    case "sms":
      return `sms:${v}`;
    case "whatsapp": {
      const digits = v.replace(/[^\d]/g, "");
      return digits ? `https://wa.me/${digits}` : null;
    }
    case "linkedin":
      if (isUrl) return v;
      return `https://linkedin.com/in/${v.replace(/^@/, "")}`;
    case "telegram": {
      const u = v.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
      return `https://t.me/${u}`;
    }
    case "signal":
      return isUrl ? v : `https://signal.me/#p/${v.replace(/^@/, "")}`;
    case "calendly":
      return isUrl ? v : `https://calendly.com/${v.replace(/^@/, "")}`;
    case "website":
      return isUrl ? v : `https://${v}`;
    case "instagram":
      return isUrl ? v : `https://instagram.com/${v.replace(/^@/, "")}`;
    case "twitter":
      return isUrl ? v : `https://twitter.com/${v.replace(/^@/, "")}`;
    case "github":
      return isUrl ? v : `https://github.com/${v.replace(/^@/, "")}`;
    case "mastodon":
    case "bluesky":
    case "threads":
    case "tiktok":
    case "other":
      return isUrl ? v : null;
  }
}

function prettySubtype(channel: ContactChannel, subtype: string): string {
  // Phone-Subtypes lesbar machen — der Picker schreibt „mobile" /
  // „landline", aber die Anzeige soll deutsch + in Klammern.
  if (channel === "phone") {
    const s = subtype.toLowerCase();
    if (s.includes("mobil") || s.includes("iphone")) return "Mobilfunk";
    if (s.includes("landline") || s.includes("festnetz")) return "Festnetz";
    if (s.includes("work") || s.includes("arbeit") || s.includes("office"))
      return "Arbeit";
    if (s.includes("fax")) return "Fax";
  }
  if (channel === "email") {
    const s = subtype.toLowerCase();
    if (s.includes("work") || s.includes("arbeit") || s.includes("office"))
      return "Arbeit";
    if (s.includes("private") || s.includes("privat") || s === "persönlich")
      return "Privat";
  }
  // Fallback: Subtype roh anzeigen, aber capitalized.
  if (!subtype) return "";
  return subtype.charAt(0).toUpperCase() + subtype.slice(1);
}

function buildChannels(contacts: PersonContact[]): ResolvedChannel[] {
  const out: ResolvedChannel[] = [];
  for (const c of contacts) {
    const href = buildHref(c);
    if (!href) continue;
    const baseLabel = CONTACT_CHANNEL_LABELS[c.channel] ?? c.channel;
    const subPretty = c.subtype ? prettySubtype(c.channel, c.subtype) : "";
    const label = subPretty ? `${baseLabel} (${subPretty})` : baseLabel;
    out.push({
      type: c.channel,
      label,
      value: c.value,
      href,
      is_primary: c.is_primary,
    });
  }
  // Sort: primaries first, dann alphabetisch nach Channel
  out.sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.type.localeCompare(b.type);
  });
  return out;
}

// Fix-Slots der Stammdaten — diese erscheinen IMMER. Leere Slots
// zeigen „—" und linken auf die Edit-Seite damit der User direkt
// reinkommt und das Feld füllen kann.
interface SlotRow {
  key: string;
  label: string;
  icon: ContactChannel | "address";
  value: string | null;
  href: string | null;
  is_primary?: boolean;
}

function formatAddress(a: AddressEntry): string {
  const line1 = a.street ?? "";
  const line2 = [a.postal_code, a.city].filter(Boolean).join(" ");
  return [line1, line2, a.country].filter(Boolean).join(", ");
}

function findPhoneBy(
  contacts: PersonContact[],
  predicate: (c: PersonContact) => boolean,
): PersonContact | null {
  return contacts.find(predicate) ?? null;
}

export function ChannelsList({
  contacts,
  personId,
  addresses,
  linkedinUrl,
  currentLocation,
  homeLocation,
  geographies,
  geoAddSlot,
}: Props) {
  // Slot-Detection. Mobilfunk = phone mit subtype mobil/iphone;
  // Festnetz = phone mit landline/festnetz; Email = primary email;
  // Adresse = erste address ODER current_location / home_location als
  // Fallback; LinkedIn = explizit person_contacts ODER legacy
  // person.linkedin_url.
  const mobilePhone = findPhoneBy(contacts, (c) => {
    if (c.channel !== "phone") return false;
    const s = c.subtype?.toLowerCase() ?? "";
    return s.includes("mobil") || s.includes("iphone");
  });
  const landlinePhone = findPhoneBy(contacts, (c) => {
    if (c.channel !== "phone") return false;
    const s = c.subtype?.toLowerCase() ?? "";
    return s.includes("landline") || s.includes("festnetz");
  });
  // Falls KEIN explicit Subtype gesetzt ist, fällt der Slot auf das
  // erste verfügbare phone-Contact — sonst sähen Legacy-Daten ohne
  // Subtype für immer leer aus.
  const fallbackPhone =
    !mobilePhone && !landlinePhone
      ? findPhoneBy(contacts, (c) => c.channel === "phone")
      : null;

  const emailContact =
    contacts.find((c) => c.channel === "email" && c.is_primary) ??
    contacts.find((c) => c.channel === "email") ??
    null;

  const linkedinContact = contacts.find((c) => c.channel === "linkedin");
  const linkedinValue = linkedinContact?.value ?? linkedinUrl ?? null;
  const linkedinHref = linkedinValue
    ? linkedinValue.startsWith("http")
      ? linkedinValue
      : `https://linkedin.com/in/${linkedinValue.replace(/^@/, "")}`
    : null;

  const websiteContact = contacts.find((c) => c.channel === "website");

  // Adresse: erste vollständige Adresse aus addresses[], sonst
  // current_location, sonst home_location.
  const firstAddress =
    (addresses ?? []).find(
      (a) => a.street || a.city || a.postal_code || a.country,
    ) ?? null;
  const addressValue =
    (firstAddress ? formatAddress(firstAddress) : "") ||
    currentLocation ||
    homeLocation ||
    null;

  const editHref = personId ? `/people/${personId}/edit` : "#";

  const fixedSlots: SlotRow[] = [
    {
      key: "phone-mobile",
      label: "Telefon (Mobilfunk)",
      icon: "phone",
      value: (mobilePhone ?? fallbackPhone)?.value ?? null,
      href: buildHref(mobilePhone ?? fallbackPhone ?? null),
      is_primary: (mobilePhone ?? fallbackPhone)?.is_primary,
    },
    {
      key: "phone-landline",
      label: "Telefon (Festnetz)",
      icon: "phone",
      value: landlinePhone?.value ?? null,
      href: buildHref(landlinePhone),
      is_primary: landlinePhone?.is_primary,
    },
    {
      key: "email",
      label: "Email",
      icon: "email",
      value: emailContact?.value ?? null,
      href: buildHref(emailContact),
      is_primary: emailContact?.is_primary,
    },
    {
      key: "address",
      label: "Adresse",
      icon: "address",
      value: addressValue,
      // Adressen haben keinen direkten URI-Scheme (mailto/tel) —
      // wir linken auf Google Maps wenn gefüllt, damit der User
      // klicken kann.
      href: addressValue
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            addressValue,
          )}`
        : null,
    },
    {
      key: "linkedin",
      label: "LinkedIn",
      icon: "linkedin",
      value: linkedinValue,
      href: linkedinHref,
    },
    {
      key: "website",
      label: "Website",
      icon: "website",
      value: websiteContact?.value ?? null,
      href: buildHref(websiteContact ?? null),
    },
  ];

  // Verwendete Contact-IDs aufsammeln damit „Extra"-Liste sie nicht
  // doppelt rendert.
  const usedIds = new Set<string>(
    [
      mobilePhone,
      landlinePhone,
      fallbackPhone,
      emailContact,
      linkedinContact,
      websiteContact,
    ]
      .filter((c): c is PersonContact => Boolean(c))
      .map((c) => c.id),
  );
  // Phone-Channel komplett aus den Extras rauslassen: die Stammdaten
  // haben zwei feste Phone-Slots (Mobilfunk + Festnetz), weitere
  // Telefonnummern landen sonst als loses „Telefon"-Item darunter und
  // verwirren („wieso drei Telefon-Zeilen?"). Wer mehr als zwei Nummern
  // pflegen will, macht das über /people/[id]/edit.
  const extras = buildChannels(
    contacts.filter((c) => !usedIds.has(c.id) && c.channel !== "phone"),
  );

  // Orte (Geo-Einträge) sind Teil der Stammdaten-Box. Aktive sortiert
  // nach GEO_GROUP_ORDER als Zeilen in der Box, inaktive separat als
  // Aufklapper darunter.
  const geos = geographies ?? [];
  const activeGeos = geos
    .filter((g) => g.is_active)
    .sort(
      (a, b) =>
        GEO_GROUP_ORDER.indexOf(a.geo_type) -
        GEO_GROUP_ORDER.indexOf(b.geo_type),
    );
  const inactiveGeos = geos.filter((g) => !g.is_active);

  return (
    <section id="stammdaten" className="space-y-3">
      <div className="section-head">
        <span className="t-label">Stammdaten</span>
        <span className="rule" />
      </div>
      <ul className="overflow-hidden rounded border border-rule bg-paper">
        {fixedSlots.map((s) => (
          <SlotItem
            key={s.key}
            slot={s}
            editHref={editHref}
            personId={personId}
          />
        ))}
        {extras.map((c, i) => (
          <li
            key={`${c.type}-${i}-${c.value}`}
            className="border-t border-rule-soft"
          >
            <a
              href={c.href}
              target={c.href.startsWith("http") ? "_blank" : undefined}
              rel={c.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-paper-2"
            >
              <ChannelIcon type={c.type} />
              <span className="text-sm text-ink-1">{c.label}</span>
              {c.is_primary && (
                <span
                  className="font-mono text-[9px] uppercase tracking-wider text-action"
                  title="Primärer Kontakt"
                  aria-hidden
                >
                  ★
                </span>
              )}
              <span className="ml-auto truncate font-mono text-xs text-ink-3">
                {c.value}
              </span>
            </a>
          </li>
        ))}
        {/* Orte — aktive Geo-Einträge als Box-Zeilen. */}
        {activeGeos.map((g) => (
          <li
            key={g.id}
            className="flex items-center gap-3 border-t border-rule-soft px-4 py-2.5"
          >
            <ChannelIcon type="address" />
            <span className="text-sm text-ink-1">{geoLabel(g)}</span>
            <span className="ml-auto truncate font-mono text-xs text-ink-3">
              {geoValue(g)}
            </span>
          </li>
        ))}
        {/* „— Ort hinzufügen"-Zeile (GeoAddRow), erweitert inline. */}
        {geoAddSlot}
      </ul>
      {inactiveGeos.length > 0 && (
        <details className="space-y-1.5">
          <summary className="t-label cursor-pointer text-ink-4 transition hover:text-ink-2">
            Frühere Orte ({inactiveGeos.length})
          </summary>
          <ul className="mt-2 overflow-hidden rounded border border-rule bg-paper">
            {inactiveGeos.map((g) => (
              <li
                key={g.id}
                className="flex items-center gap-3 border-b border-rule-soft px-4 py-2.5 last:border-0"
              >
                <ChannelIcon type="address" />
                <span className="text-sm text-ink-4">{geoLabel(g)}</span>
                <span className="ml-auto truncate font-mono text-xs text-ink-4">
                  {geoValue(g)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function SlotItem({
  slot,
  editHref,
  personId,
}: {
  slot: SlotRow;
  editHref: string;
  personId?: string;
}) {
  const filled = Boolean(slot.value);
  const rowClass =
    "flex items-center gap-3 px-4 py-2.5 transition hover:bg-paper-2 border-b border-rule-soft last:border-0";

  if (filled && slot.href) {
    return (
      <li>
        <a
          href={slot.href}
          target={slot.href.startsWith("http") ? "_blank" : undefined}
          rel={slot.href.startsWith("http") ? "noopener noreferrer" : undefined}
          className={rowClass}
        >
          <ChannelIcon type={slot.icon} />
          <span className="text-sm text-ink-1">{slot.label}</span>
          {slot.is_primary && (
            <span
              className="font-mono text-[9px] uppercase tracking-wider text-action"
              title="Primärer Kontakt"
              aria-hidden
            >
              ★
            </span>
          )}
          <span className="ml-auto truncate font-mono text-xs text-ink-3">
            {slot.value}
          </span>
        </a>
      </li>
    );
  }

  // Leerer Slot — direkt im Feld beschreibbar (kein Wechsel zur
  // Edit-Seite). Klick auf „— hinzufügen" blendet ein Inline-Input
  // ein, das per Server-Action speichert. Nur möglich wenn wir eine
  // personId haben; sonst Fallback auf den Link zur Edit-Seite.
  if (personId) {
    return (
      <StammdatenSlot
        personId={personId}
        slotKey={slot.key}
        label={slot.label}
        icon={<ChannelIcon type={slot.icon} />}
      />
    );
  }

  return (
    <li>
      <Link href={editHref} className={`${rowClass} text-ink-4`}>
        <ChannelIcon type={slot.icon} />
        <span className="text-sm">{slot.label}</span>
        <span className="ml-auto truncate font-mono text-xs italic">
          — hinzufügen
        </span>
      </Link>
    </li>
  );
}

// Inline SVG-Icons pro Channel-Typ — keine Icon-Library als Abhängigkeit.
function ChannelIcon({ type }: { type: ContactChannel | "address" }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "shrink-0 text-ink-3",
  };
  switch (type) {
    case "address":
      return (
        <svg {...props}>
          <path d="M12 22s-8-7.5-8-13a8 8 0 1 1 16 0c0 5.5-8 13-8 13z" />
          <circle cx="12" cy="9" r="3" />
        </svg>
      );
    case "email":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      );
    case "phone":
      return (
        <svg {...props}>
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M8 10v6M8 7v.01M12 16v-3a3 3 0 0 1 6 0v3M12 10v6" />
        </svg>
      );
    case "telegram":
      return (
        <svg {...props}>
          <path d="m4 12 6 3 8-9-6 13-3-3-2 3-3-7Z" />
        </svg>
      );
    case "sms":
    case "whatsapp":
    case "signal":
      return (
        <svg {...props}>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      );
    case "calendly":
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "website":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "twitter":
      return (
        <svg {...props}>
          <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
        </svg>
      );
    case "instagram":
    case "threads":
    case "tiktok":
      return (
        <svg {...props}>
          <rect x="2" y="2" width="20" height="20" rx="5" />
          <path d="M16 11.37a4 4 0 1 1-7.92 1.31 4 4 0 0 1 7.92-1.31z M17.5 6.5h.01" />
        </svg>
      );
    case "github":
      return (
        <svg {...props}>
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
        </svg>
      );
    case "mastodon":
    case "bluesky":
    case "other":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
  }
}
