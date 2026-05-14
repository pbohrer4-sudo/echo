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
import { addContactAction } from "@/app/(app)/people/[id]/contact-actions";
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

// Sinnvolle Channel-Auswahl im Quick-Add-Form. Beschränkt auf die
// Action-Bar-relevanten + ein paar häufige — der vollständige Set
// steckt in CONTACT_CHANNELS für die Voice-Pipeline.
const QUICK_ADD_CHANNELS: ContactChannel[] = [
  "phone",
  "whatsapp",
  "email",
  "linkedin",
  "telegram",
  "signal",
  "instagram",
  "website",
];

export function ActionBar({ personId, contacts }: Props) {
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

  const [addOpen, setAddOpen] = useState(false);
  const [addChannel, setAddChannel] = useState<ContactChannel>("phone");
  const [addValue, setAddValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!addValue.trim()) return;
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("channel", addChannel);
    fd.set("value", addValue.trim());
    startTransition(async () => {
      const res = await addContactAction(fd);
      if (!res.ok) {
        setError(res.error ?? "Fehler");
      } else {
        setAddOpen(false);
        setAddValue("");
        setError(null);
      }
    });
  }

  function quickAdd(channel: ContactChannel) {
    setAddChannel(channel);
    setAddOpen(true);
    setError(null);
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <ActionButton
          href={hasUsablePhone ? `tel:${phone!.value}` : undefined}
          onClickIfDisabled={() => quickAdd("phone")}
          label={hasUsablePhone ? "Anrufen" : "+ Telefon"}
          subLabel={hasUsablePhone ? phone!.value : undefined}
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
          primary={hasUsablePhone}
          background="oklch(28% 0.05 250)"
          foreground="var(--paper)"
        />
        <ActionButton
          href={hasUsableWa ? `https://wa.me/${whatsappDigits}` : undefined}
          onClickIfDisabled={() => quickAdd("whatsapp")}
          label={hasUsableWa ? "WhatsApp" : "+ WhatsApp"}
          subLabel={hasUsableWa ? whatsapp!.value : undefined}
          icon={
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M20.52 3.48A11.94 11.94 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.17 1.6 5.99L0 24l6.18-1.62A11.94 11.94 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.2-1.25-6.21-3.48-8.52z" />
            </svg>
          }
          primary={hasUsableWa}
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
          <label className="space-y-1">
            <span className="t-label">Channel</span>
            <select
              value={addChannel}
              onChange={(e) => setAddChannel(e.target.value as ContactChannel)}
              className="h-9 rounded border border-rule bg-paper px-2 text-xs text-ink-1 outline-none focus:border-action focus:ring-2 focus:ring-action/20"
            >
              {QUICK_ADD_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CONTACT_CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
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
            Speichern
          </button>
          <button
            type="button"
            onClick={() => {
              setAddOpen(false);
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

function ActionButton({
  href,
  label,
  subLabel,
  icon,
  primary = false,
  background,
  foreground,
  onClickIfDisabled,
}: {
  href?: string;
  label: string;
  subLabel?: string;
  icon: React.ReactNode;
  primary?: boolean;
  background?: string;
  foreground?: string;
  // Wenn href fehlt (disabled state) und dieser callback gesetzt ist,
  // wird die Bar zum Quick-Add-Trigger statt komplett tot.
  onClickIfDisabled?: () => void;
}) {
  const disabled = !href;
  const baseClasses = subLabel
    ? "inline-flex min-h-12 flex-col items-center justify-center gap-0.5 rounded py-1.5 text-sm font-medium transition"
    : "inline-flex h-12 items-center justify-center gap-2 rounded text-sm font-medium transition";

  const inner = (
    <>
      <span className="inline-flex items-center gap-2">
        {icon}
        <span>{label}</span>
      </span>
      {subLabel && (
        <span className="text-[11px] font-normal opacity-80">{subLabel}</span>
      )}
    </>
  );

  if (disabled) {
    if (onClickIfDisabled) {
      return (
        <button
          type="button"
          onClick={onClickIfDisabled}
          className={`${baseClasses} border border-dashed border-rule bg-paper text-ink-3 hover:border-action hover:text-action`}
          aria-label={label}
        >
          {inner}
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled
        className={`${baseClasses} cursor-not-allowed border border-rule bg-paper-2 text-ink-4`}
        aria-label={label}
      >
        {inner}
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
        {inner}
      </a>
    );
  }

  return (
    <a
      href={href}
      className={`${baseClasses} border border-rule bg-paper text-ink-2 hover:border-ink-3 hover:text-ink-1 px-4`}
      aria-label={label}
    >
      {inner}
    </a>
  );
}
