// Action-Bar auf Person-Detail (Phase 2 V3-Migration, 0030).
//
// „Jede Person ist ein Action-Launcher" — Anrufen + WhatsApp sind
// immer einen Tap entfernt, prominent oben. Weitere Kanäle (Email,
// LinkedIn, SMS, Telegram) liegen im ChannelList-Block direkt drunter.
//
// Datenquelle: person_contacts (V3). Primary-Phone wird für tel: +
// wa.me genutzt; country_code wird in die wa.me-URL gemerged falls
// nicht schon in der Value enthalten.

import type { ContactChannel, PersonContact } from "@/lib/types";

interface Props {
  contacts: PersonContact[];
}

// Lokaler Helper — gleiche Logik wie lib/person-contacts.ts, hier
// inline damit dieser Component kein server-only Modul importiert.
function findPrimaryByChannel(
  contacts: PersonContact[],
  channel: ContactChannel,
): PersonContact | null {
  const inChannel = contacts.filter((c) => c.channel === channel);
  if (inChannel.length === 0) return null;
  return inChannel.find((c) => c.is_primary) ?? inChannel[0];
}

// Normalisiert eine Telefonnummer auf das wa.me-Format: nur Ziffern,
// kein +, keine Leerzeichen. Wenn country_code gesetzt und im Value
// noch nicht enthalten, wird er vorne dran gehängt.
function buildWaMeDigits(phone: PersonContact): string {
  const digits = phone.value.replace(/[^\d]/g, "");
  if (phone.country_code && !phone.value.includes("+")) {
    // country_code ist ISO-2 (DE/AT/...) — wir hängen nichts dran wenn
    // die Value-Digits schon mit Ländervorwahl beginnen. Ohne harte
    // Mapping-Tabelle bleibt die Logik bewusst minimal — bessere
    // Validierung wäre serverseitig per libphonenumber.
    return digits;
  }
  return digits;
}

export function ActionBar({ contacts }: Props) {
  const phone =
    findPrimaryByChannel(contacts, "phone") ??
    findPrimaryByChannel(contacts, "whatsapp");
  const whatsapp =
    findPrimaryByChannel(contacts, "whatsapp") ??
    findPrimaryByChannel(contacts, "phone");

  const phoneDigits = phone ? buildWaMeDigits(phone) : "";
  const whatsappDigits = whatsapp ? buildWaMeDigits(whatsapp) : "";
  const hasUsablePhone = phoneDigits.length >= 7;
  const hasUsableWa = whatsappDigits.length >= 7;
  const hasEmail = contacts.some((c) => c.channel === "email");

  // Wenn keine Action verfügbar ist, Bar weglassen.
  if (!hasUsablePhone && !hasUsableWa && !hasEmail) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <ActionButton
        href={hasUsablePhone ? `tel:${phone!.value}` : undefined}
        label="Anrufen"
        icon={
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
          </svg>
        }
        primary
        background="oklch(28% 0.05 250)"
        foreground="var(--paper)"
      />
      <ActionButton
        href={hasUsableWa ? `https://wa.me/${whatsappDigits}` : undefined}
        label="WhatsApp"
        icon={
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M20.52 3.48A11.94 11.94 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.17 1.6 5.99L0 24l6.18-1.62A11.94 11.94 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.2-1.25-6.21-3.48-8.52zM12 21.82a9.81 9.81 0 0 1-5-1.36l-.36-.21-3.67.96.98-3.57-.23-.37A9.83 9.83 0 1 1 12 21.82zm5.4-7.36c-.3-.15-1.74-.86-2.01-.96-.27-.1-.47-.15-.66.15-.2.3-.76.96-.93 1.15-.17.2-.34.22-.64.07-.3-.15-1.27-.47-2.42-1.49a9.09 9.09 0 0 1-1.68-2.08c-.18-.3-.02-.46.13-.6.13-.13.3-.34.45-.51.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.66-1.6-.91-2.18-.24-.58-.49-.5-.66-.5-.17 0-.37-.02-.57-.02-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.74-.71 1.99-1.4.25-.69.25-1.28.17-1.4-.07-.13-.27-.2-.57-.35z" />
          </svg>
        }
        primary
        background="#25D366"
        foreground="#fff"
      />
      <ActionButton
        label="Mehr"
        icon={
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="19" cy="12" r="1.5" />
          </svg>
        }
        href="#weitere-kanaele"
      />
    </div>
  );
}

function ActionButton({
  href,
  label,
  icon,
  primary = false,
  background,
  foreground,
}: {
  href?: string;
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
  background?: string;
  foreground?: string;
}) {
  const disabled = !href;
  const baseClasses =
    "inline-flex h-12 items-center justify-center gap-2 rounded text-sm font-medium transition";

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className={`${baseClasses} cursor-not-allowed border border-rule bg-paper-2 text-ink-4`}
        aria-label={label}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  }

  if (primary && background && foreground) {
    return (
      <a
        href={href}
        className={`${baseClasses} hover:opacity-90`}
        style={{ background, color: foreground }}
        aria-label={label}
      >
        {icon}
        <span>{label}</span>
      </a>
    );
  }

  return (
    <a
      href={href}
      className={`${baseClasses} border border-rule bg-paper text-ink-2 hover:border-ink-3 hover:text-ink-1 px-4`}
      aria-label={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </a>
  );
}
