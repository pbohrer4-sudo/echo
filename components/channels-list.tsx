// „Weitere Kanäle"-Block auf Person-Detail (Phase 2 V3-Migration, 0030).
//
// Liegt einen Klick tiefer als Anrufen + WhatsApp aus der Action-Bar.
// Datenquelle: person_contacts. Native-URI-Schemes wo möglich
// (mailto:, sms:, tel:), sonst https-Link. Primary-Markierung bekommt
// einen kleinen ★-Indikator.

import {
  CONTACT_CHANNEL_LABELS,
  type ContactChannel,
  type PersonContact,
} from "@/lib/types";

interface Props {
  contacts: PersonContact[];
}

interface ResolvedChannel {
  type: ContactChannel;
  label: string;
  value: string;
  href: string;
  is_primary: boolean;
}

function buildHref(c: PersonContact): string | null {
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

function buildChannels(contacts: PersonContact[]): ResolvedChannel[] {
  const out: ResolvedChannel[] = [];
  for (const c of contacts) {
    const href = buildHref(c);
    if (!href) continue;
    const baseLabel = CONTACT_CHANNEL_LABELS[c.channel] ?? c.channel;
    const label = c.subtype ? `${baseLabel} · ${c.subtype}` : baseLabel;
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

export function ChannelsList({ contacts }: Props) {
  const channels = buildChannels(contacts);
  if (channels.length === 0) return null;

  return (
    <section id="weitere-kanaele" className="space-y-3">
      <div className="section-head">
        <span className="t-label">Weitere Kanäle</span>
        <span className="rule" />
      </div>
      <ul className="overflow-hidden rounded border border-rule bg-paper">
        {channels.map((c, i) => (
          <li
            key={`${c.type}-${i}-${c.value}`}
            className="border-b border-rule-soft last:border-0"
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
      </ul>
    </section>
  );
}

// Inline SVG-Icons pro Channel-Typ — keine Icon-Library als Abhängigkeit.
function ChannelIcon({ type }: { type: ContactChannel }) {
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
