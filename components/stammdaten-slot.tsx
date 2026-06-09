"use client";

// Leerer Stammdaten-Slot, der direkt im Feld beschreibbar ist —
// statt auf die Edit-Seite zu navigieren. Klick auf „— hinzufügen"
// blendet ein Input an Ort und Stelle ein; Enter/Blur speichert,
// Escape bricht ab. Speichern läuft über addContactAction (Channels)
// bzw. addAddressAction (Adresse). revalidatePath läuft server-seitig.

import { useRef, useState, useTransition, type ReactNode } from "react";
import { addAddressAction, addContactAction } from "@/app/(app)/people/[id]/contact-actions";

// slotKey → wie gespeichert wird. „address" ist ein Sonderfall (JSONB
// auf people), alle anderen sind person_contacts-Channels.
const CHANNEL_MAP: Record<
  string,
  { channel: string; subtype: string | null; placeholder: string; type?: string }
> = {
  "phone-mobile": { channel: "phone", subtype: "mobile", placeholder: "+49 …", type: "tel" },
  "phone-landline": { channel: "phone", subtype: "landline", placeholder: "+49 …", type: "tel" },
  email: { channel: "email", subtype: null, placeholder: "name@domain.de", type: "email" },
  linkedin: { channel: "linkedin", subtype: null, placeholder: "Profil-URL oder Handle" },
  website: { channel: "website", subtype: null, placeholder: "domain.de", type: "url" },
};

const ADDRESS_PLACEHOLDER = "Straße, PLZ Ort, Land";

interface Props {
  personId: string;
  slotKey: string;
  label: string;
  icon: ReactNode;
}

export function StammdatenSlot({ personId, slotKey, label, icon }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const isAddress = slotKey === "address";
  const cfg = CHANNEL_MAP[slotKey];
  const placeholder = isAddress ? ADDRESS_PLACEHOLDER : (cfg?.placeholder ?? "");
  const inputType = isAddress ? "text" : (cfg?.type ?? "text");

  const rowClass =
    "flex items-center gap-3 px-4 py-2.5 transition border-b border-rule-soft last:border-0";

  function save() {
    const v = value.trim();
    if (!v) {
      // Leeres Feld + Blur → einfach zuklappen, kein Fehler.
      setEditing(false);
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("person_id", personId);
    fd.set("value", v);
    if (!isAddress && cfg) {
      fd.set("channel", cfg.channel);
      if (cfg.subtype) fd.set("subtype", cfg.subtype);
    }
    startTransition(async () => {
      const res = isAddress
        ? await addAddressAction(fd)
        : await addContactAction(fd);
      if (res.ok) {
        setEditing(false);
        setValue("");
      } else {
        setError(res.error ?? "Fehler beim Speichern");
      }
    });
  }

  if (!editing) {
    return (
      <li>
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            // focus nach dem Re-Render
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className={`${rowClass} w-full text-left text-ink-4 transition hover:bg-paper-2`}
        >
          {icon}
          <span className="text-sm">{label}</span>
          <span className="ml-auto truncate font-mono text-xs italic">
            — hinzufügen
          </span>
        </button>
      </li>
    );
  }

  return (
    <li>
      <div className={`${rowClass} bg-paper-2`}>
        {icon}
        <span className="text-sm text-ink-1">{label}</span>
        <div className="ml-auto flex items-center gap-2">
          {error && (
            <span className="font-mono text-[10px] text-bad" title={error}>
              ⚠
            </span>
          )}
          <input
            ref={inputRef}
            type={inputType}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
                setValue("");
                setError(null);
              }
            }}
            onBlur={save}
            disabled={pending}
            placeholder={placeholder}
            className="w-48 rounded border border-rule bg-paper px-2 py-1 text-right font-mono text-xs text-ink-1 outline-none focus:border-action focus:ring-2 focus:ring-action/20 disabled:opacity-50"
          />
        </div>
      </div>
    </li>
  );
}
