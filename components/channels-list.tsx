// „Weitere Kanäle"-Block auf Person-Detail (Phase C6c, Briefing v3 #19).
//
// Liegt einen Klick tiefer als Anrufen + WhatsApp aus der Action-Bar.
// Native-URI-Schemes wo möglich, sonst https-Link.

import type {
  EmailEntry,
  PhoneEntry,
  SocialEntry,
} from "@/lib/types";

interface Props {
  phones: PhoneEntry[];
  emails: EmailEntry[];
  socials: SocialEntry[];
}

interface Channel {
  type: "email" | "linkedin" | "telegram" | "sms" | "twitter" | "instagram" | "github" | "other";
  label: string;
  value: string;
  href: string;
}

function buildChannels({ phones, emails, socials }: Props): Channel[] {
  const out: Channel[] = [];

  // Emails als mailto:
  for (const e of emails ?? []) {
    out.push({
      type: "email",
      label: e.label ?? "Email",
      value: e.value,
      href: `mailto:${e.value}`,
    });
  }

  // Socials — pro Plattform unterschiedlicher Link-Aufbau
  for (const s of socials ?? []) {
    const platform = s.platform?.toLowerCase() ?? "";
    const handle = s.handle_or_url ?? "";
    if (!handle) continue;
    const isUrl = handle.startsWith("http");

    if (platform.includes("linkedin")) {
      const url = isUrl
        ? handle
        : `https://linkedin.com/in/${handle.replace(/^@/, "")}`;
      out.push({ type: "linkedin", label: "LinkedIn", value: handle, href: url });
    } else if (platform.includes("telegram")) {
      const username = handle.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
      out.push({
        type: "telegram",
        label: "Telegram",
        value: `@${username}`,
        href: `https://t.me/${username}`,
      });
    } else if (platform.includes("twitter") || platform.includes("x")) {
      const username = handle.replace(/^@/, "");
      out.push({
        type: "twitter",
        label: "X / Twitter",
        value: `@${username}`,
        href: isUrl ? handle : `https://twitter.com/${username}`,
      });
    } else if (platform.includes("instagram")) {
      const username = handle.replace(/^@/, "");
      out.push({
        type: "instagram",
        label: "Instagram",
        value: `@${username}`,
        href: isUrl ? handle : `https://instagram.com/${username}`,
      });
    } else if (platform.includes("github")) {
      const username = handle.replace(/^@/, "");
      out.push({
        type: "github",
        label: "GitHub",
        value: `@${username}`,
        href: isUrl ? handle : `https://github.com/${username}`,
      });
    } else {
      out.push({
        type: "other",
        label: s.platform ?? "Social",
        value: handle,
        href: isUrl ? handle : `https://${handle}`,
      });
    }
  }

  // SMS — alle Phones außer die mobile (die ist schon in Action-Bar)
  // SMS funktioniert universal via sms:-Scheme.
  for (const p of phones ?? []) {
    out.push({
      type: "sms",
      label: `SMS · ${p.label ?? "Phone"}`,
      value: p.value,
      href: `sms:${p.value}`,
    });
  }

  return out;
}

export function ChannelsList({ phones, emails, socials }: Props) {
  const channels = buildChannels({ phones, emails, socials });
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
            key={`${c.type}-${i}`}
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

// Inline SVG-Icons pro Channel-Typ. Hand-gezeichnet damit kein
// Icon-Library-Dependency nötig ist.
function ChannelIcon({ type }: { type: Channel["type"] }) {
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
      return (
        <svg {...props}>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      );
    case "twitter":
      return (
        <svg {...props}>
          <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
        </svg>
      );
    case "instagram":
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
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
  }
}
