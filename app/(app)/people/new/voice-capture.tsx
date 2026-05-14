"use client";

// Voice-Capture für /people/new — Sprache aufnehmen, an /api/extract
// schicken, create_person-ToolCall-Felder zurück ins Form-State.
//
// Browser-natives SpeechRecognition (Chrome/Safari). Wenn nicht
// verfügbar, fällt das UI auf reine Textarea zurück damit man trotzdem
// einen Freitext eintippen kann.

import { useEffect, useRef, useState } from "react";

export interface VoiceExtractedFields {
  name?: string;
  company?: string;
  role?: string;
  phone?: string;
  email?: string;
  linkedin_url?: string;
  website?: string;
  notes?: string;
  tags?: string;
  birthday?: string;
  current_location?: string;
}

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResult };
}
interface RecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => RecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  }
}

interface Props {
  onApply: (fields: VoiceExtractedFields) => void;
}

export function VoiceCapture({ onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSpeechApi, setHasSpeechApi] = useState(false);
  const recognitionRef = useRef<RecognitionInstance | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasSpeechApi(
      Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition),
    );
  }, []);

  function startRecording() {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Browser unterstützt Speech-Recognition nicht");
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "de-DE";
    rec.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (finalText) setTranscript((prev) => prev + finalText);
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      setError(`Audio-Fehler: ${e.error}`);
      setRecording(false);
    };
    rec.onend = () => {
      setRecording(false);
      setInterim("");
    };
    rec.start();
    recognitionRef.current = rec;
    setRecording(true);
    setError(null);
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setRecording(false);
  }

  async function analyze() {
    const text = `${transcript} ${interim}`.trim();
    if (!text) {
      setError("Nichts aufgenommen");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Extract ${res.status}`);
      }
      const { toolCalls } = (await res.json()) as {
        toolCalls: { name: string; input: Record<string, unknown> }[];
      };
      const create = toolCalls.find((c) => c.name === "create_person");
      if (!create) {
        setError(
          "Keine neuen Personen erkannt. Tipp: nenne explizit Vor- und Nachname.",
        );
        setBusy(false);
        return;
      }
      onApply(mapCreatePersonInput(create.input));
      setOpen(false);
      setTranscript("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded border border-rule bg-paper-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="t-label">Per Sprache anlegen</p>
          <p className="text-xs text-ink-3">
            Sprich oder tippe in 1-2 Sätzen wer das ist. Echo extrahiert Name,
            Firma, Telefon, Tags etc. automatisch und füllt das Formular vor.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded border border-action bg-action-soft px-3 text-xs font-medium text-action transition hover:bg-action hover:text-paper"
          >
            <MicIcon /> Voice
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <textarea
            value={transcript + (interim ? ` ${interim}` : "")}
            onChange={(e) => {
              setTranscript(e.target.value);
              setInterim("");
            }}
            rows={3}
            placeholder='z.B. "Felix Schmitt, Anwalt bei Müller&Partner in München. Telefon 0173 555 1234. Geburtstag 26 März. Vater von Luna. Tags Recht und München."'
            className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
          />
          <div className="flex flex-wrap items-center gap-2">
            {hasSpeechApi && (
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={busy}
                className={`inline-flex h-9 items-center gap-2 rounded px-3 text-xs font-medium transition ${
                  recording
                    ? "border border-bad bg-bad/10 text-bad"
                    : "border border-action bg-action-soft text-action hover:bg-action hover:text-paper"
                }`}
              >
                <MicIcon />
                {recording ? "Stop" : "Aufnehmen"}
              </button>
            )}
            <button
              type="button"
              onClick={analyze}
              disabled={busy || (!transcript && !interim)}
              className="h-9 rounded border border-action bg-action px-3 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-50"
            >
              {busy ? "Werte aus…" : "Formular vorbefüllen"}
            </button>
            <button
              type="button"
              onClick={() => {
                stopRecording();
                setOpen(false);
                setTranscript("");
                setInterim("");
                setError(null);
              }}
              className="h-9 px-2 text-xs text-ink-3 transition hover:text-ink-1"
            >
              Abbrechen
            </button>
            {!hasSpeechApi && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
                Sprach-Eingabe nicht verfügbar — tippen
              </span>
            )}
          </div>
          {error && (
            <p className="text-[11px] text-bad">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="2" width="6" height="13" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
    </svg>
  );
}

function mapCreatePersonInput(
  input: Record<string, unknown>,
): VoiceExtractedFields {
  const s = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  const phones = Array.isArray(input.phones) ? input.phones : [];
  const emails = Array.isArray(input.emails) ? input.emails : [];
  const tags = Array.isArray(input.tags) ? input.tags : [];
  const socials = Array.isArray(input.socials) ? input.socials : [];
  const dates = Array.isArray(input.important_dates)
    ? input.important_dates
    : [];
  const addresses = Array.isArray(input.addresses) ? input.addresses : [];

  const linkedinHit = socials.find((s) => {
    if (!s || typeof s !== "object") return false;
    const platform = (s as Record<string, unknown>).platform;
    return typeof platform === "string" && platform.toLowerCase().includes("linkedin");
  }) as Record<string, unknown> | undefined;
  const websiteHit = socials.find((s) => {
    if (!s || typeof s !== "object") return false;
    const platform = (s as Record<string, unknown>).platform;
    return typeof platform === "string" && platform.toLowerCase().includes("website");
  }) as Record<string, unknown> | undefined;

  const birthdayHit = dates.find((d) => {
    if (!d || typeof d !== "object") return false;
    const label = (d as Record<string, unknown>).label;
    return typeof label === "string" && label.toLowerCase().includes("geburt");
  }) as Record<string, unknown> | undefined;

  const firstAddress = addresses[0] as Record<string, unknown> | undefined;
  const cityFromAddress = firstAddress ? s(firstAddress.city) : undefined;

  return {
    name: s(input.name),
    company: s(input.company),
    role: s(input.role),
    phone:
      phones[0] && typeof phones[0] === "object"
        ? s((phones[0] as Record<string, unknown>).value)
        : undefined,
    email:
      emails[0] && typeof emails[0] === "object"
        ? s((emails[0] as Record<string, unknown>).value)
        : undefined,
    linkedin_url: linkedinHit ? s(linkedinHit.handle_or_url) : undefined,
    website: websiteHit ? s(websiteHit.handle_or_url) : undefined,
    notes: s(input.notes),
    tags: tags
      .filter((t): t is string => typeof t === "string")
      .join(", "),
    birthday: birthdayHit ? s(birthdayHit.date) : undefined,
    current_location: cityFromAddress,
  };
}
