"use client";

// Action-Bar auf Person-Detail (Phase 2 V3-Migration, 0030).
//
// „Jede Person ist ein Action-Launcher" — Anrufen + WhatsApp sind
// immer einen Tap entfernt, prominent oben. Wenn kein Kontakt
// hinterlegt ist, bleibt die Bar trotzdem sichtbar mit muted-Buttons
// + einem inline „+ Kontakt"-Formular damit man sofort einen
// hinzufügen kann ohne erst auf /people/{id}/edit zu wechseln.

import { useState, useTransition } from "react";
import {
  CONTACT_CHANNEL_LABELS,
  type ContactChannel,
  type PersonContact,
} from "@/lib/types";
import {
  addContactAction,
  updateContactAction,
} from "@/app/(app)/people/[id]/contact-actions";
import { PhoneInput } from "@/components/phone-input";

interface Props {
  personId: string;
  contacts: PersonContact[];
}

function findPrimaryByChannel(
  contacts: PersonContact[],
  channel: ContactChannel,
): PersonContact | null {
  const inChannel = contacts.filter((c) => c.channel === channel);
  if (inChannel.length === 0) return null;
  return inChannel.find((c) => c.is_primary) ?? inChannel[0];
}

function buildWaMeDigits(phone: PersonContact): string {
  return phone.value.replace(/[^\d]/g, "");
}

// Quick-Add-Optionen im Inline-Form. Phone splittet sich in Festnetz
// und Mobilfunk auf (gleicher channel=phone, unterschiedlicher
// subtype) — der Subtype steuert das Anzeige-Label in der
// Kanäle-Liste UND die WhatsApp-Fallback-Logik (Mobil = automatisch
// WhatsApp-Nummer).
interface QuickAddOption {
  id: string;
  label: string;
  channel: ContactChannel;
  subtype: string | null;
}
const QUICK_ADD_OPTIONS: QuickAddOption[] = [
  { id: "phone:mobile", label: "Telefon (Mobilfunk)", channel: "phone", subtype: "mobile" },
  { id: "phone:landline", label: "Telefon (Festnetz)", channel: "phone", subtype: "landline" },
  { id: "whatsapp", label: "WhatsApp", channel: "whatsapp", subtype: null },
  { id: "email", label: CONTACT_CHANNEL_LABELS.email, channel: "email", subtype: null },
  { id: "linkedin", label: CONTACT_CHANNEL_LABELS.linkedin, channel: "linkedin", subtype: null },
  { id: "telegram", label: CONTACT_CHANNEL_LABELS.telegram, channel: "telegram", subtype: null },
  { id: "signal", label: CONTACT_CHANNEL_LABELS.signal, channel: "signal", subtype: null },
  { id: "instagram", label: CONTACT_CHANNEL_LABELS.instagram, channel: "instagram", subtype: null },
  { id: "website", label: CONTACT_CHANNEL_LABELS.website, channel: "website", subtype: null },
];

function optionForChannelSubtype(
  channel: ContactChannel,
  subtype: string | null,
): QuickAddOption | undefined {
  return QUICK_ADD_OPTIONS.find(
    (o) => o.channel === channel && (o.subtype ?? null) === (subtype ?? null),
  );
}

function findMobilePhone(contacts: PersonContact[]): PersonContact | null {
  // Phone-Contacts mit subtype 'mobile' / 'iphone' / 'mobil' — auch
  // legacy-Daten ohne strict-Enum (Voice-Extract liefert oft freie
  // Strings wie „mobil").
  const phones = contacts.filter((c) => c.channel === "phone");
  const mobile = phones.find((c) => {
    const s = c.subtype?.toLowerCase() ?? "";
    return s.includes("mobil") || s.includes("iphone");
  });
  if (mobile) return mobile;
  // Wenn kein expliziter Mobile-Subtype, gibt's keinen — der
  // Caller fällt dann auf primary phone zurück.
  return null;
}

export function ActionBar({ personId, contacts }: Props) {
  const phone =
    findPrimaryByChannel(contacts, "phone") ??
    findPrimaryByChannel(contacts, "whatsapp");
  // WhatsApp-Auflösung: explicit WhatsApp-Contact > Mobile-Phone >
  // beliebige Phone. So „läuft" WhatsApp automatisch auf der Mobil-
  // nummer, ohne dass der User sie doppelt anlegen muss.
  const whatsapp =
    findPrimaryByChannel(contacts, "whatsapp") ??
    findMobilePhone(contacts) ??
    findPrimaryByChannel(contacts, "phone");

  const phoneDigits = phone ? buildWaMeDigits(phone) : "";
  const whatsappDigits = whatsapp ? buildWaMeDigits(whatsapp) : "";
  const hasUsablePhone = phoneDigits.length >= 7;
  const hasUsableWa = whatsappDigits.length >= 7;

  const [addOpen, setAddOpen] = useState(false);
  // Quick-Add nutzt jetzt die Option-ID (z.B. „phone:mobile") statt
  // nur den Channel — sonst könnten wir Festnetz und Mobilfunk nicht
  // im selben Dropdown unterscheiden.
  const [addOptionId, setAddOptionId] = useState<string>(
    QUICK_ADD_OPTIONS[0].id,
  );
  const [addValue, setAddValue] = useState("");
  const [editContactId, setEditContactId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const currentOption =
    QUICK_ADD_OPTIONS.find((o) => o.id === addOptionId) ?? QUICK_ADD_OPTIONS[0];
  const addChannel = currentOption.channel;

  function submit() {
    if (!addValue.trim()) return;
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("value", addValue.trim());
    if (currentOption.subtype) fd.set("subtype", currentOption.subtype);
    startTransition(async () => {
      let res: { ok: boolean; error?: string };
      if (editContactId) {
        fd.set("contact_id", editContactId);
        res = await updateContactAction(fd);
      } else {
        fd.set("channel", currentOption.channel);
        res = await addContactAction(fd);
      }
      if (!res.ok) {
        setError(res.error ?? "Fehler");
      } else {
        setAddOpen(false);
        setAddValue("");
        setEditContactId(null);
        setError(null);
      }
    });
  }

  function quickAdd(channel: ContactChannel) {
    // Default-Option pro Channel suchen. Bei phone nehmen wir Mobilfunk
    // als sinnvollen Standard (häufiger als Festnetz).
    const defaultOption =
      channel === "phone"
        ? QUICK_ADD_OPTIONS.find((o) => o.id === "phone:mobile")
        : QUICK_ADD_OPTIONS.find((o) => o.channel === channel);
    setAddOptionId(defaultOption?.id ?? QUICK_ADD_OPTIONS[0].id);
    setAddValue("");
    setEditContactId(null);
    setAddOpen(true);
    setError(null);
  }

  function quickEdit(contact: PersonContact) {
    const match =
      optionForChannelSubtype(contact.channel, contact.subtype) ??
      QUICK_ADD_OPTIONS.find((o) => o.channel === contact.channel) ??
      QUICK_ADD_OPTIONS[0];
    setAddOptionId(match.id);
    setAddValue(contact.value);
    setEditContactId(contact.id);
    setAddOpen(true);
    setError(null);
  }

  const phoneIcon = (
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
  );
  const waIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.52 3.48A11.94 11.94 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.17 1.6 5.99L0 24l6.18-1.62A11.94 11.94 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.2-1.25-6.21-3.48-8.52z" />
    </svg>
  );

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <ChannelCard
          label="Telefon"
          icon={phoneIcon}
          href={hasUsablePhone ? `tel:${phone!.value}` : null}
          value={hasUsablePhone ? phone!.value : null}
          onAdd={() => quickAdd("phone")}
          onEdit={hasUsablePhone && phone ? () => quickEdit(phone) : undefined}
          background="oklch(28% 0.05 250)"
          foreground="var(--paper)"
        />
        <ChannelCard
          label="WhatsApp"
          icon={waIcon}
          href={hasUsableWa ? `https://wa.me/${whatsappDigits}` : null}
          value={hasUsableWa ? whatsapp!.value : null}
          onAdd={() => quickAdd("whatsapp")}
          onEdit={hasUsableWa && whatsapp ? () => quickEdit(whatsapp) : undefined}
          background="#25D366"
          foreground="#fff"
        />
        <button
          type="button"
          onClick={() => quickAdd("phone")}
          className="inline-flex min-h-12 items-center justify-center gap-1 rounded border border-dashed border-rule bg-paper px-3 text-sm text-ink-3 transition hover:border-action hover:text-action"
          title="Kontakt hinzufügen"
        >
          + Kontakt
        </button>
      </div>

      {addOpen && (
        <div className="flex flex-wrap items-end gap-2 rounded border border-rule bg-paper-2 p-3">
          {editContactId ? (
            <p className="basis-full text-[11px] text-ink-3">
              {currentOption.label} bearbeiten
            </p>
          ) : (
            <label className="space-y-1">
              <span className="t-label">Channel</span>
              <select
                value={addOptionId}
                onChange={(e) => setAddOptionId(e.target.value)}
                className="h-9 rounded border border-rule bg-paper px-2 text-xs text-ink-1 outline-none focus:border-action focus:ring-2 focus:ring-action/20"
              >
                {QUICK_ADD_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex-1 space-y-1">
            <span className="t-label">
              {addChannel === "phone" || addChannel === "whatsapp"
                ? "Nummer (z. B. +49 173 …)"
                : addChannel === "email"
                  ? "Email-Adresse"
                  : addChannel === "linkedin"
                    ? "Handle oder URL"
                    : "Wert"}
            </span>
            {addChannel === "phone" ||
            addChannel === "whatsapp" ||
            addChannel === "sms" ? (
              <div
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                  if (e.key === "Escape") setAddOpen(false);
                }}
                className="min-w-[16rem]"
              >
                <PhoneInput
                  value={addValue}
                  onChange={setAddValue}
                  inputClassName="h-9 w-full rounded border border-rule bg-paper px-2 text-xs text-ink-1 outline-none focus:border-action focus:ring-2 focus:ring-action/20"
                  autoFocus
                />
              </div>
            ) : (
              <input
                type="text"
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                  if (e.key === "Escape") setAddOpen(false);
                }}
                autoFocus
                className="h-9 w-full min-w-[16rem] rounded border border-rule bg-paper px-2 text-xs text-ink-1 outline-none focus:border-action focus:ring-2 focus:ring-action/20"
              />
            )}
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !addValue.trim()}
            className="h-9 rounded border border-action bg-action px-3 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
          >
            {editContactId ? "Speichern" : "Hinzufügen"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAddOpen(false);
              setEditContactId(null);
              setError(null);
            }}
            className="h-9 px-2 text-xs text-ink-3 transition hover:text-ink-1"
          >
            Abbrechen
          </button>
          {error && (
            <p className="basis-full text-[11px] text-bad">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// Telefon / WhatsApp Action-Card mit zwei Click-Targets:
// 1. Obere Hälfte (Icon + Label): wenn ein href gesetzt ist, ein
//    <a> der direkt anruft / wa.me öffnet. Ohne href: leerer
//    Header (kein Anrufen möglich).
// 2. Untere Hälfte (Nummer / Add): bei vorhandener Nummer ein
//    Button der die Edit-Form vorbefüllt öffnet. Ohne Nummer:
//    „+ hinzufügen"-Button der die Add-Form öffnet.
//
// Die zwei Targets sitzen visuell in einer Card mit gemeinsamem
// Background — durch den 60/40-Vertikal-Split wirken sie wie ein
// einzelnes Element mit zwei klickbaren Zonen.
function ChannelCard({
  label,
  icon,
  href,
  value,
  onAdd,
  onEdit,
  background,
  foreground,
}: {
  label: string;
  icon: React.ReactNode;
  href: string | null;
  value: string | null;
  onAdd: () => void;
  onEdit?: () => void;
  background: string;
  foreground: string;
}) {
  // Empty-State: dashed Button, einzelnes Click-Target = add.
  if (!value) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex min-h-12 flex-col items-center justify-center gap-0.5 rounded border border-dashed border-rule bg-paper py-1.5 text-sm text-ink-3 transition hover:border-action hover:text-action"
        aria-label={`${label} hinzufügen`}
      >
        <span className="inline-flex items-center gap-2">
          {icon}
          <span>{label}</span>
        </span>
        <span className="text-[10px] font-normal opacity-70">+ hinzufügen</span>
      </button>
    );
  }

  // Populated: kompakte Card, Icon + Nummer in EINER Zeile damit die
  // Höhe minimal bleibt. Tap-Targets: das Icon ruft an / öffnet wa.me,
  // die Nummer-Underline öffnet den Edit-Popover. Channel-Wort
  // (Telefon / WhatsApp) bleibt weg — Icon + Card-Farbe genügen.
  return (
    <div
      className="flex h-12 items-center gap-2 overflow-hidden rounded px-3"
      style={{ background, color: foreground }}
    >
      {href ? (
        <a
          href={href}
          className="flex shrink-0 items-center hover:opacity-90"
          aria-label={`${label} – anrufen`}
          title={label}
        >
          {icon}
        </a>
      ) : (
        <span
          className="flex shrink-0 items-center opacity-70"
          title={label}
        >
          {icon}
        </span>
      )}
      <button
        type="button"
        onClick={onEdit}
        title="Nummer bearbeiten"
        className="min-w-0 flex-1 truncate text-sm font-medium underline underline-offset-2 opacity-95 transition hover:opacity-100"
      >
        {value}
      </button>
    </div>
  );
}
