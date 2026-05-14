"use client";

import { useState } from "react";

// Use-case definitions — hardcoded set that covers the most common WhatsApp
// reasons to reach out. Templates render immediately (no AI call needed),
// then the user can edit before sending.
type UseCase =
  | "reengage"
  | "meeting"
  | "birthday"
  | "danke-intro"
  | "followup"
  | "lebenszeichen";

type Style = "locker" | "professionell";

interface UseCase_ {
  id: UseCase;
  label: string;
  emoji: string;
  locker: string;
  professionell: string;
}

const USE_CASES: UseCase_[] = [
  {
    id: "reengage",
    label: "Wieder melden",
    emoji: "👋",
    locker:
      "Hey {firstName}! Schon ewig nichts voneinander gehört – wie läuft's bei dir? 🙂",
    professionell:
      "Hallo {firstName}, ich hoffe es geht dir gut. Es ist schon eine Weile her – ich würde mich gerne wieder austauschen. Wann passt dir ein kurzer Austausch?",
  },
  {
    id: "meeting",
    label: "Treffen vorschlagen",
    emoji: "☕",
    locker:
      "Hi {firstName}, ich würde mich gerne mal mit dir zusammensetzen. Hast du nächste Woche einen freien Slot?",
    professionell:
      "Guten Tag {firstName}, ich würde gerne einen Termin mit dir vereinbaren. Wann hättest du nächste Woche Zeit für ein kurzes Gespräch?",
  },
  {
    id: "birthday",
    label: "Geburtstag",
    emoji: "🎉",
    locker:
      "Happy Birthday {firstName}! 🎉 Alles Gute – hoffe du feierst richtig schön!",
    professionell:
      "Herzlichen Glückwunsch zum Geburtstag, {firstName}! Ich wünsche dir alles Gute und einen wunderschönen Tag.",
  },
  {
    id: "danke-intro",
    label: "Danke für Intro",
    emoji: "🙏",
    locker: "Hey {firstName}, danke für die Intro! Das war echt nett von dir 🙏",
    professionell:
      "Hallo {firstName}, vielen herzlichen Dank für die Vermittlung – das schätze ich sehr.",
  },
  {
    id: "followup",
    label: "Nachfassen",
    emoji: "🔄",
    locker:
      "Hi {firstName}, ich melde mich kurz wegen unseres letzten Gesprächs – gibt's schon Neuigkeiten?",
    professionell:
      "Hallo {firstName}, ich möchte kurz an unser letztes Gespräch anknüpfen – gibt es bereits eine Entscheidung oder neue Entwicklungen?",
  },
  {
    id: "lebenszeichen",
    label: "Lebenszeichen",
    emoji: "💬",
    locker:
      "Hey {firstName}! Hab kurz an dich gedacht und wollte einfach mal Hallo sagen. Wie geht's? 😊",
    professionell:
      "Hallo {firstName}, ich hoffe es geht dir gut. Ich melde mich kurz – einfach um zu hören wie es bei dir läuft.",
  },
];

function firstName(fullName: string): string {
  return fullName.split(/\s+/)[0] ?? fullName;
}

function applyTemplate(template: string, name: string): string {
  return template.replace(/\{firstName\}/g, firstName(name));
}

export function WaAiDraft({
  person,
  phones,
  defaultStyle,
}: {
  person: { id: string; name: string };
  phones: { value: string; label?: string }[];
  defaultStyle: Style;
}) {
  const [active, setActive] = useState<UseCase | null>(null);
  const [style, setStyle] = useState<Style>(defaultStyle);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);

  const primaryPhone = phones[0]?.value ?? "";
  const e164 = primaryPhone.replace(/\s+/g, "").replace(/^\+/, "");

  function selectUseCase(uc: UseCase_) {
    setActive(uc.id);
    const text = applyTemplate(
      style === "locker" ? uc.locker : uc.professionell,
      person.name,
    );
    setDraft(text);
    setCopied(false);
  }

  function handleStyleChange(s: Style) {
    setStyle(s);
    if (active) {
      const uc = USE_CASES.find((u) => u.id === active)!;
      const text = applyTemplate(
        s === "locker" ? uc.locker : uc.professionell,
        person.name,
      );
      setDraft(text);
    }
  }

  async function copyDraft() {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const waHref = `https://wa.me/${e164}${draft ? `?text=${encodeURIComponent(draft)}` : ""}`;

  return (
    <section>
      <div className="section-head">
        <span className="t-label">KI-Entwurf für WhatsApp</span>
        <span className="rule" />
        {/* Style toggle sits inline in the section header */}
        <div className="flex h-6 shrink-0 items-center rounded border border-rule bg-paper p-0.5 gap-0">
          <button
            type="button"
            onClick={() => handleStyleChange("locker")}
            className={`rounded px-2 text-[10px] font-medium leading-5 transition-colors ${
              style === "locker"
                ? "bg-paper-2 text-ink-1"
                : "text-ink-4 hover:text-ink-2"
            }`}
          >
            Locker
          </button>
          <button
            type="button"
            onClick={() => handleStyleChange("professionell")}
            className={`rounded px-2 text-[10px] font-medium leading-5 transition-colors ${
              style === "professionell"
                ? "bg-paper-2 text-ink-1"
                : "text-ink-4 hover:text-ink-2"
            }`}
          >
            Professionell
          </button>
        </div>
      </div>

      {/* Use-case chips */}
      <div className="flex flex-wrap gap-2">
        {USE_CASES.map((uc) => (
          <button
            key={uc.id}
            type="button"
            onClick={() => selectUseCase(uc)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
              active === uc.id
                ? "border-action bg-action text-paper"
                : "border-rule bg-paper text-ink-2 hover:border-action/50 hover:text-ink-1"
            }`}
          >
            <span>{uc.emoji}</span>
            {uc.label}
          </button>
        ))}
      </div>

      {/* Draft area — only shown after a use-case is selected */}
      {active ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full resize-none rounded border border-rule bg-paper px-3 py-2 text-sm leading-relaxed text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={copyDraft}
              className="inline-flex items-center gap-1.5 rounded border border-rule px-2.5 py-1.5 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
            >
              {copied ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Kopiert
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Kopieren
                </>
              )}
            </button>
            {e164 && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium text-paper transition hover:opacity-90"
                style={{ background: "#25D366" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12.004 2.003C6.473 2.003 2 6.474 2 12.004c0 1.774.463 3.44 1.27 4.895L2 22l5.233-1.252A9.966 9.966 0 0 0 12.004 22C17.535 22 17.535 17.529 22 12.004c0-5.529-4.465-10.001-9.996-10.001zm0 18.18a8.16 8.16 0 0 1-4.146-1.131l-.297-.176-3.077.735.783-2.998-.194-.308A8.14 8.14 0 0 1 3.82 12.004c0-4.52 3.676-8.198 8.184-8.198 4.504 0 8.18 3.678 8.18 8.198 0 4.52-3.676 8.179-8.18 8.179z"/></svg>
                In WhatsApp öffnen
              </a>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-ink-4">
          Wähl einen Use-Case — {firstName(person.name)} bekommt einen Entwurf
          basierend auf Beziehungstiefe und Schreibstil.
        </p>
      )}
    </section>
  );
}
