"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { ToolCall } from "@/lib/tools";
import type { BusinessCardData } from "@/lib/business-card";
import {
  serializeFilterToParams,
  type PeopleFilterSpec,
} from "@/lib/people-filter";
import { stripMarkdown } from "@/lib/text";
import { ExtractionConfirmation } from "./extraction-confirmation";

type OrbState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "confirming"
  | "error";

// Three message kinds keep the transcript readable: spoken/typed user
// turns, ECHO's replies, and a "this got saved" record so Patrick can
// scroll back and see what was actually written to the CRM.
type TranscriptItem =
  | { kind: "user"; content: string; via: "voice" | "text"; ts: number }
  | { kind: "assistant"; content: string; ts: number }
  | { kind: "actions"; calls: ToolCall[]; ts: number }
  | { kind: "break"; ts: number };

// Wenn zwischen zwei Items mehr als 4 Stunden liegen, behandeln wir das
// als neue Session — typisches Pattern wie ChatGPT / Slack-Threads.
// Ein expliziter "break"-Item (durch "Neue Session"-Klick) zwingt
// ebenfalls eine Trennung.
const SESSION_GAP_MS = 4 * 60 * 60 * 1000;
// Wieviele Sessions werden gleichzeitig gerendert (älteres bleibt im
// localStorage, ist aber nicht im DOM — verhindert dass extrem lange
// Verläufe die Page langsam machen).
const VISIBLE_SESSIONS = 3;

interface Session {
  startTs: number;
  items: TranscriptItem[];
}

function groupSessions(items: TranscriptItem[]): Session[] {
  const sessions: Session[] = [];
  let current: TranscriptItem[] = [];
  let lastTs = 0;
  for (const item of items) {
    const isBreak = item.kind === "break";
    const gap = lastTs > 0 && item.ts - lastTs > SESSION_GAP_MS;
    if ((isBreak || gap) && current.length > 0) {
      sessions.push({ startTs: current[0].ts, items: current });
      current = [];
    }
    if (!isBreak) current.push(item);
    lastTs = item.ts;
  }
  if (current.length > 0) {
    sessions.push({ startTs: current[0].ts, items: current });
  }
  return sessions;
}

function sessionLabel(ts: number): string {
  const date = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const time = date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (ts >= today.getTime()) return `Heute · ${time}`;
  if (ts >= yesterday.getTime()) return `Gestern · ${time}`;
  return date.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
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

// 16 last messages get sent to the model as conversation history; the
// transcript itself can hold more for the user to scroll through.
const MAX_HISTORY = 16;
const STORAGE_KEY = "echo:chat:v1";

const STATE_LABEL: Record<OrbState, string> = {
  idle: "Drück den Kreis oder die Leertaste zum Sprechen",
  listening: "Höre zu — nochmal drücken zum Beenden",
  thinking: "ECHO denkt nach…",
  speaking: "ECHO spricht — drücken zum Stoppen",
  confirming: "Bestätigen oder verwerfen",
  error: "Fehler — drücken zum Neustarten",
};

const STATE_RING: Record<OrbState, string> = {
  idle: "ring-1 ring-rule bg-paper-2 hover:ring-action hover:bg-action/5",
  listening: "ring-4 ring-action bg-action/15 animate-pulse",
  thinking: "ring-1 ring-rule bg-paper-2",
  speaking: "ring-4 ring-signal bg-signal-soft animate-pulse",
  confirming: "ring-2 ring-action/60 bg-paper-2",
  error: "ring-2 ring-bad bg-paper-2",
};

const ACTION_LABEL: Record<string, string> = {
  create_person: "Person angelegt",
  update_person: "Person aktualisiert",
  log_interaction: "Interaktion gespeichert",
  create_note: "Notiz gespeichert",
  create_reminder: "Erinnerung gesetzt",
  create_todo: "Aufgabe angelegt",
};

function summarizeAction(call: ToolCall): string {
  const input = call.input as Record<string, unknown>;
  switch (call.name) {
    case "create_person":
      return [input.name, input.company].filter(Boolean).join(" · ") || "Person";
    case "update_person":
      return (
        (input._person_name as string | undefined) ??
        (input.name as string | undefined) ??
        "Person"
      );
    case "log_interaction":
      return (
        (input.summary as string | undefined)?.slice(0, 80) ??
        (input.type as string | undefined) ??
        "Interaktion"
      );
    case "create_note":
      return (
        ((input.title as string | undefined) ||
          (input.body as string | undefined)) ??
        ""
      ).slice(0, 80);
    case "create_reminder":
      return (input.text as string | undefined) ?? "Erinnerung";
    case "create_todo":
      return (input.text as string | undefined) ?? "Aufgabe";
    default:
      return "";
  }
}

function loadTranscript(): TranscriptItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TranscriptItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTranscript(items: TranscriptItem[]) {
  if (typeof window === "undefined") return;
  try {
    // Cap stored history so localStorage doesn't balloon over months
    // of dictation. 200 items ≈ a few weeks of typical use.
    const trimmed = items.slice(-200);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore quota errors — transcript is best-effort, not critical.
  }
}

export function VoiceOrb() {
  const router = useRouter();
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [interim, setInterim] = useState("");
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[]>([]);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [scanning, setScanning] = useState(false);
  // Pixel-Abstand vom unteren Rand des Scroll-Containers. > Schwelle
  // → Fade + Chevron-Knopf anzeigen damit der User merkt dass unten
  // noch Content folgt (z.B. weitere Confirmation-Cards).
  const [scrolledFromBottom, setScrolledFromBottom] = useState(0);

  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const finalRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hydratedRef = useRef(false);
  // Set true when the user clicks the orb to cancel mid-listen.
  // Checked in processFinal so we don't submit an unintended snippet.
  const cancelledRef = useRef(false);

  // Hydrate from localStorage on mount, persist on every change. Keeps
  // the transcript visible across reloads so Patrick can pick up where
  // he left off — same as ChatGPT/Claude expectations.
  useEffect(() => {
    setTranscript(loadTranscript());
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveTranscript(transcript);
  }, [transcript]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {}
      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
      audioRef.current?.pause();
    };
  }, []);

  // Auto-scroll to bottom whenever new content lands. useLayoutEffect
  // so it happens before the browser paints — no visible jump.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [transcript, interim, pendingToolCalls.length, orbState]);

  // Track scroll-position relative to bottom. Recomputes on scroll AND
  // when content grows (ResizeObserver) — die Confirmation-Card kann
  // erst nachträglich groß werden, wenn Claude noch Items reinträgt.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function recompute() {
      const dist = el!.scrollHeight - el!.scrollTop - el!.clientHeight;
      setScrolledFromBottom(dist);
    }
    recompute();
    el.addEventListener("scroll", recompute, { passive: true });
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", recompute);
      ro.disconnect();
    };
  }, []);

  function scrollToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  // Schwelle: > 40px Abstand zum Boden = Indikator zeigen. 40 ist grob
  // unterhalb der Sichtbarkeit einer halben Confirmation-Card-Zeile.
  const showScrollHint = scrolledFromBottom > 40;

  // The chat history we send to the model: only user/assistant turns,
  // tool-call action records are CRM bookkeeping and don't belong in
  // the prompt context.
  const chatHistory = useMemo(
    () =>
      transcript
        .filter(
          (t): t is Extract<TranscriptItem, { kind: "user" | "assistant" }> =>
            t.kind === "user" || t.kind === "assistant",
        )
        .map((t) => ({ role: t.kind, content: t.content }))
        .slice(-MAX_HISTORY),
    [transcript],
  );

  // 3 Sekunden Stille = automatisch beenden + submitten. Lang genug
  // damit normale Atempausen mitten im Satz nicht abschneiden, kurz
  // genug dass der User nach dem Sprechen nicht warten muss.
  function resetSilenceTimer() {
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = window.setTimeout(() => {
      try {
        recognitionRef.current?.stop();
      } catch {}
    }, 3000);
  }

  const playSpeech = useCallback(
    async (text: string, onEnded: () => void) => {
      const ttsRes = await fetch("/api/voice/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!ttsRes.ok) {
        const data = await ttsRes.json().catch(() => ({}));
        throw new Error(data.error ?? `TTS ${ttsRes.status}`);
      }
      const blob = await ttsRes.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      setOrbState("speaking");
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (audioRef.current === audio) {
          audioRef.current = null;
          onEnded();
        }
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setError("Audio-Wiedergabe fehlgeschlagen");
        setOrbState("error");
      };
      await audio.play();
    },
    [],
  );

  const submitText = useCallback(
    async (text: string, via: "voice" | "text") => {
      if (!text) {
        setOrbState("idle");
        return;
      }

      setSuggestedReplies([]);

      const userItem: TranscriptItem = {
        kind: "user",
        content: text,
        via,
        ts: Date.now(),
      };
      const historyForModel = [...chatHistory, { role: "user", content: text }];
      setTranscript((prev) => [...prev, userItem]);
      setOrbState("thinking");

      try {
        const extractRes = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Send the prior chat history WITHOUT the latest message —
          // the API expects { transcript: latest, history: prior }.
          body: JSON.stringify({
            transcript: text,
            history: historyForModel.slice(0, -1),
          }),
        });
        if (!extractRes.ok) {
          const data = await extractRes.json().catch(() => ({}));
          throw new Error(data.error ?? `Extract ${extractRes.status}`);
        }
        const { text: rawAssistantText, toolCalls } =
          (await extractRes.json()) as {
            text: string;
            toolCalls: ToolCall[];
          };
        const assistantText = stripMarkdown(rawAssistantText ?? "");

        if (assistantText) {
          setTranscript((prev) => [
            ...prev,
            { kind: "assistant", content: assistantText, ts: Date.now() },
          ]);
        }

        // query_people ist read-only: Voice navigiert den Nutzer zur
        // People-Liste mit gesetzten Filtern, ohne Confirmation-Dialog.
        const queryCall = (toolCalls ?? []).find(
          (c) => c.name === "query_people",
        );
        if (queryCall) {
          const spec = queryCall.input as PeopleFilterSpec;
          const qs = serializeFilterToParams(spec).toString();
          router.push(qs ? `/people?${qs}` : "/people");
        }

        const writeCalls = (toolCalls ?? []).filter(
          (c) => c.name !== "suggest_replies" && c.name !== "query_people",
        );
        const hasExtractions = writeCalls.length > 0;
        if (hasExtractions) setPendingToolCalls(writeCalls);

        const replyChips = (toolCalls ?? []).find(
          (c) => c.name === "suggest_replies",
        );
        if (replyChips && !hasExtractions) {
          const opts = (replyChips.input as { replies?: string[] }).replies;
          setSuggestedReplies(Array.isArray(opts) ? opts.slice(0, 5) : []);
        }

        // Voice-originated turns get spoken back; typed turns stay
        // silent — typing implies the user is in a quiet/meeting mode
        // and doesn't want ECHO talking back.
        if (assistantText && via === "voice") {
          await playSpeech(assistantText, () => {
            setOrbState(hasExtractions ? "confirming" : "idle");
          });
        } else {
          setOrbState(hasExtractions ? "confirming" : "idle");
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unbekannter Fehler";
        setError(message);
        setOrbState("error");
      }
    },
    [chatHistory, playSpeech],
  );

  const processFinal = useCallback(async () => {
    const text = finalRef.current.trim();
    finalRef.current = "";
    setInterim("");
    // If the user clicked to cancel, drop whatever was captured. The
    // orb-click handler set cancelledRef and moved us to idle already.
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    await submitText(text, "voice");
  }, [submitText]);

  const startListening = useCallback(() => {
    setError(null);
    setPendingToolCalls([]);
    cancelledRef.current = false;

    if (!recognitionRef.current) {
      const Ctor =
        window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (!Ctor) {
        setError(
          "Dein Browser unterstützt keine Spracherkennung. Nimm Chrome oder Edge — oder tipp einfach unten.",
        );
        setOrbState("error");
        return;
      }
      const recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "de-DE";
      recognition.onresult = (event) => {
        let interimText = "";
        let finalText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const t = result[0].transcript;
          if (result.isFinal) finalText += t;
          else interimText += t;
        }
        if (finalText) finalRef.current += finalText;
        setInterim(interimText);
        resetSilenceTimer();
      };
      recognition.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") return;
        // Map common error codes to localized strings instead of leaking
        // the raw spec name to the user.
        const friendly: Record<string, string> = {
          "not-allowed": "Mikrofon-Berechtigung verweigert",
          "audio-capture": "Mikrofon nicht verfügbar",
          "service-not-allowed": "Spracherkennung blockiert",
          network: "Netzwerkfehler beim Erkennen",
        };
        setError(friendly[event.error] ?? `Spracherkennung: ${event.error}`);
        setOrbState("error");
      };
      recognitionRef.current = recognition;
    }

    const recognition = recognitionRef.current;
    finalRef.current = "";
    setInterim("");

    recognition.onend = () => {
      recognition.onend = null;
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      processFinal();
    };

    try {
      recognition.start();
      setOrbState("listening");
      resetSilenceTimer();
    } catch (err) {
      console.error(err);
      setError("Mikrofon nicht verfügbar — Berechtigung erteilt?");
      setOrbState("error");
    }
  }, [processFinal]);

  async function handleConfirm(editedCalls: ToolCall[]) {
    // editedCalls comes from ExtractionConfirmation already filtered
    // (unchecked items dropped, scalar fields edited). If the user
    // unchecked everything, treat as cancel.
    if (!editedCalls.length) {
      handleCancel();
      return;
    }
    setCommitting(true);
    try {
      const res = await fetch("/api/extract/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolCalls: editedCalls }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Commit ${res.status}`);
      }
      // Append a transcript record so the user can see what got saved
      // when they scroll back later. This is the "und gemacht wurde"
      // half of the LLM-style history.
      setTranscript((prev) => [
        ...prev,
        { kind: "actions", calls: editedCalls, ts: Date.now() },
      ]);
      setPendingToolCalls([]);
      setOrbState("idle");
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Speichern fehlgeschlagen";
      setError(message);
      setOrbState("error");
    } finally {
      setCommitting(false);
    }
  }

  function handleCancel() {
    setPendingToolCalls([]);
    setOrbState("idle");
  }

  function handleOrbClick() {
    if (orbState === "idle" || orbState === "error") {
      startListening();
      return;
    }
    if (orbState === "listening") {
      // Stop + submit — Klick beim Sprechen heißt "fertig, los". Cancel
      // ohne Submit gibt's via Esc-Hotkey unten (kein versehentlicher
      // Daten-Verlust durch Doppel-Klick).
      setOrbState("thinking");
      try {
        recognitionRef.current?.stop();
      } catch {}
      return;
    }
    if (orbState === "speaking") {
      audioRef.current?.pause();
      audioRef.current = null;
      setOrbState(pendingToolCalls.length ? "confirming" : "idle");
      return;
    }
  }

  // Visitenkarten-Scan: Bild → /api/scan-business-card (Claude Vision)
  // → BusinessCardData → in einen create_person ToolCall umbauen → wie
  // ein Voice-Extract behandeln (ExtractionConfirmation öffnet sich).
  // Default-Scope ist "work" weil Visitenkarten meist Business sind.
  async function handleScanFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Nur Bilder erlaubt");
      setOrbState("error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Bild zu groß (max. 5 MB)");
      setOrbState("error");
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/scan-business-card", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Scan ${res.status}`);
      }
      const { data } = (await res.json()) as { data: BusinessCardData };
      if (!data.name && !data.company && data.phones.length === 0) {
        throw new Error("Konnte nichts auf der Karte erkennen");
      }

      const personInput: Record<string, unknown> = {
        name: data.name ?? "",
        scope: "work",
      };
      if (data.company) personInput.company = data.company;
      if (data.role) personInput.role = data.role;
      if (data.phones.length) personInput.phones = data.phones;
      if (data.emails.length) personInput.emails = data.emails;
      if (data.addresses.length) personInput.addresses = data.addresses;
      if (data.socials.length) personInput.socials = data.socials;

      const toolCall: ToolCall = {
        name: "create_person",
        input: personInput,
      };

      // Marker im Verlauf damit man später sieht dass eine Karte
      // gescannt wurde — gleicher Flow wie Voice / Text.
      setTranscript((prev) => [
        ...prev,
        {
          kind: "user",
          content: `📇 Visitenkarte gescannt${data.name ? `: ${data.name}` : ""}`,
          via: "text",
          ts: Date.now(),
        },
      ]);
      setSuggestedReplies([]);
      setPendingToolCalls([toolCall]);
      setOrbState("confirming");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan fehlgeschlagen");
      setOrbState("error");
    } finally {
      setScanning(false);
    }
  }

  function handleComposerSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = composer.trim();
    if (!text) return;
    setComposer("");
    if (composerRef.current) composerRef.current.style.height = "auto";
    void submitText(text, "text");
  }

  function handleComposerKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts newline — same as Slack/ChatGPT.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleComposerSubmit(e);
    }
  }

  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setComposer(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  }

  // "Neue Session"-Knopf: setzt einen Trenner statt zu löschen, damit
  // der bisherige Verlauf scrollbar bleibt (User wollte die letzten ~3
  // Sessions oben weiter sehen können um Angefangenes fertig zu machen).
  function startNewSession() {
    setTranscript((prev) => {
      // Doppel-Trenner vermeiden — hilft falls User mehrfach klickt.
      const last = prev[prev.length - 1];
      if (last && last.kind === "break") return prev;
      return [...prev, { kind: "break", ts: Date.now() }];
    });
    setSuggestedReplies([]);
    setPendingToolCalls([]);
    setOrbState("idle");
    setError(null);
  }

  // Hard-Wipe — hinter Confirm versteckt damit's nicht aus Versehen
  // passiert. Erreichbar nur wenn man Shift hält beim Klick.
  function clearTranscript() {
    if (!window.confirm("Wirklich den kompletten Verlauf löschen?")) return;
    setTranscript([]);
    setSuggestedReplies([]);
    setPendingToolCalls([]);
    setOrbState("idle");
    setError(null);
  }

  // Spacebar shortcut for hands-free voice activation when no input
  // has focus — power-user nudge toward the 80%-voice goal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      // Space = Mic toggle (idle → listening); Esc = Cancel beim
      // Sprechen ohne Submit. Esc ist die explizite Geste damit ein
      // Klick auf den Orb nicht versehentlich Aufnahmen wegwirft.
      if (e.code === "Space" && !inField) {
        if (orbState !== "idle" && orbState !== "error") return;
        e.preventDefault();
        startListening();
        return;
      }
      if (e.code === "Escape" && orbState === "listening") {
        cancelledRef.current = true;
        setOrbState("idle");
        try {
          recognitionRef.current?.abort();
        } catch {}
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [orbState, startListening]);

  const orbDisabled = orbState === "thinking" || orbState === "confirming";

  // Sessions zeigen wir nur die letzten N — Älteres bleibt im
  // localStorage erhalten aber nicht im DOM. Falls ein older-flag, blenden
  // wir oben einen Hinweis ein, damit der User weiß dass nicht alles
  // gerendert ist.
  const allSessions = useMemo(() => groupSessions(transcript), [transcript]);
  const visibleSessions = allSessions.slice(-VISIBLE_SESSIONS);
  const hiddenSessionCount = allSessions.length - visibleSessions.length;
  const isEmpty = allSessions.length === 0 && !interim;

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* Header strip — voice-first messaging + clear button */}
      <div className="flex items-center justify-between gap-3 border-b border-rule px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="t-label">ECHO</span>
          <span className="rounded-full border border-action/40 bg-action-soft px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-action">
            Voice-first · 80 %
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-ink-4 sm:inline">
            Leertaste = Mic
          </span>
          {transcript.length > 0 && (
            <button
              type="button"
              onClick={(e) =>
                e.shiftKey ? clearTranscript() : startNewSession()
              }
              title="Klick: neue Session beginnen (Verlauf bleibt). Shift+Klick: alles löschen."
              className="rounded border border-rule px-2.5 py-1 text-xs text-ink-3 transition hover:border-ink-3 hover:text-ink-1"
            >
              Neue Session
            </button>
          )}
        </div>
      </div>

      {/* Transcript — scrollable LLM-style thread. Scroll-Hint
          (Fade + Chevron) sind absolute Children der Voice-Orb-Root,
          positioniert relativ zum Composer-Boden. */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-8"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          {isEmpty && (
            <div className="rounded-xl border border-rule bg-paper-2 p-6 text-center">
              <p className="t-label mb-3">Sprich mit ECHO</p>
              <p className="text-sm text-ink-2">
                „Lukas Maier von Siemens war heute beim Kaffee — er sucht ein
                Geschenk für seine Frau Sabine, ihre Hochzeit ist am 14.
                September."
              </p>
              <p className="mt-3 text-xs text-ink-4">
                Personen, Notizen, Erinnerungen, Aufgaben — alles per
                Stimme. Drück den Kreis unten oder tipp die Leertaste.
              </p>
            </div>
          )}

          {hiddenSessionCount > 0 && (
            <p className="text-center font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
              {hiddenSessionCount}{" "}
              {hiddenSessionCount === 1 ? "ältere Session" : "ältere Sessions"}{" "}
              ausgeblendet
            </p>
          )}

          {visibleSessions.map((session, sIdx) => {
            const isFirstSession = sIdx === 0 && hiddenSessionCount === 0;
            return (
              <div key={session.startTs} className="flex flex-col gap-5">
                {!isFirstSession && (
                  <div className="flex items-center gap-3 pt-2">
                    <hr className="flex-1 border-t border-rule" />
                    <span className="t-label">
                      {sessionLabel(session.startTs)}
                    </span>
                    <hr className="flex-1 border-t border-rule" />
                  </div>
                )}
                {session.items.map((item, idx) => {
                  if (item.kind === "user") {
                    return (
                      <div key={idx} className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-br-md border border-action/30 bg-action-soft px-4 py-2.5 text-sm text-ink-1 shadow-sm">
                          {item.via === "voice" && (
                            <span className="t-label mr-2 inline align-middle">
                              🎙
                            </span>
                          )}
                          {item.content}
                        </div>
                      </div>
                    );
                  }
                  if (item.kind === "assistant") {
                    return (
                      <div key={idx} className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-rule bg-paper px-4 py-2.5 text-sm text-ink-1 shadow-sm">
                          <span className="t-label mr-2 inline align-middle">
                            ECHO
                          </span>
                          {item.content}
                        </div>
                      </div>
                    );
                  }
                  if (item.kind === "actions") {
                    // committed tool calls — small green-ish chips inline so
                    // the thread reads like "what we said + what got saved"
                    return (
                      <div
                        key={idx}
                        className="flex flex-wrap items-center gap-2 self-start"
                      >
                        {item.calls.map((c, ci) => (
                          <span
                            key={ci}
                            className="inline-flex items-center gap-2 rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider"
                            style={{
                              borderColor: "oklch(58% 0.10 145)",
                              color: "oklch(28% 0.06 145)",
                              background: "oklch(95% 0.03 145)",
                            }}
                          >
                            <span>✓</span>
                            <span className="font-sans normal-case tracking-normal">
                              {ACTION_LABEL[c.name] ?? c.name}
                              {summarizeAction(c) && (
                                <span className="ml-1 text-ink-3">
                                  · {summarizeAction(c)}
                                </span>
                              )}
                            </span>
                          </span>
                        ))}
                      </div>
                    );
                  }
                  return null; // break-Items werden via groupSessions konsumiert
                })}
              </div>
            );
          })}

          {orbState === "listening" && interim && (
            <div className="flex justify-end" aria-live="polite">
              <div className="max-w-[85%] rounded-2xl rounded-br-md border border-action/40 bg-action/5 px-4 py-2.5 text-sm italic text-ink-3">
                <span className="t-label mr-2 inline align-middle">🎙</span>
                {interim}…
              </div>
            </div>
          )}

          {orbState === "thinking" && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md border border-rule bg-paper px-4 py-2.5 text-sm text-ink-3">
                <span className="t-label mr-2 inline align-middle">ECHO</span>
                <span className="inline-flex gap-1 align-middle">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-4 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-4 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-4" />
                </span>
              </div>
            </div>
          )}

          {orbState === "confirming" && pendingToolCalls.length > 0 && (
            <div className="rounded-xl border border-action/40 bg-action-soft p-3">
              <ExtractionConfirmation
                toolCalls={pendingToolCalls}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
                pending={committing}
              />
            </div>
          )}

          {suggestedReplies.length > 0 &&
            orbState !== "confirming" &&
            orbState !== "thinking" && (
              <div className="flex flex-wrap gap-2">
                {suggestedReplies.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    onClick={() => {
                      try {
                        recognitionRef.current?.stop();
                      } catch {}
                      void submitText(reply, "text");
                    }}
                    className="rounded-full border border-rule bg-paper px-3 py-1.5 text-xs text-ink-2 transition hover:border-action hover:bg-action-soft hover:text-ink-1"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}

          {error && (
            <p className="rounded border border-bad/40 bg-bad/5 px-3 py-2 text-xs text-bad">
              Fehler: {error}
            </p>
          )}
        </div>
      </div>

      {/* Scroll-Hint: erscheint nur wenn der Verlauf merklich nach
          unten weiterläuft. Klick scrollt sanft ans Ende. Positioned
          absolute zur Voice-Orb-Root, sitzt knapp oberhalb der
          Composer-Bar damit es nicht den Orb verdeckt. */}
      {showScrollHint && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Nach unten scrollen"
          className="absolute bottom-[170px] right-6 z-10 inline-flex h-9 items-center gap-1.5 rounded-full border border-rule bg-paper px-3 text-xs text-ink-2 shadow-[0_2px_12px_rgba(20,17,13,0.10)] transition hover:border-action hover:text-action"
        >
          <span>weiter unten</span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}

      {/* Composer — voice as hero, text as fallback */}
      <div className="border-t border-rule bg-paper-2 px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3">
          <button
            type="button"
            onClick={handleOrbClick}
            disabled={orbDisabled}
            className={`relative flex h-24 w-24 items-center justify-center rounded-full transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${STATE_RING[orbState]}`}
            aria-label={STATE_LABEL[orbState]}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-9 w-9 transition-colors ${
                orbState === "listening"
                  ? "text-action"
                  : orbState === "speaking"
                    ? "text-signal"
                    : "text-ink-2"
              }`}
            >
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <line x1="12" y1="18" x2="12" y2="22" />
            </svg>
            {orbState === "listening" && (
              <span className="absolute -inset-2 animate-ping rounded-full border border-action/40" />
            )}
          </button>
          <p className="text-xs text-ink-3">{STATE_LABEL[orbState]}</p>

          <form
            onSubmit={handleComposerSubmit}
            className="flex w-full items-end gap-2 rounded-2xl border border-rule bg-paper px-3 py-2 transition focus-within:border-action focus-within:shadow-[0_0_0_3px_var(--action-ring)]"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleScanFile(f);
                // reset damit dasselbe File nochmal auswählbar ist
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={
                scanning ||
                orbState === "thinking" ||
                orbState === "confirming"
              }
              title="Visitenkarte scannen"
              aria-label="Visitenkarte scannen"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-ink-3 transition hover:bg-paper-2 hover:text-action disabled:opacity-40"
            >
              {scanning ? (
                <span className="inline-flex gap-0.5" aria-hidden>
                  <span className="h-1 w-1 animate-bounce rounded-full bg-ink-3 [animation-delay:-0.3s]" />
                  <span className="h-1 w-1 animate-bounce rounded-full bg-ink-3 [animation-delay:-0.15s]" />
                  <span className="h-1 w-1 animate-bounce rounded-full bg-ink-3" />
                </span>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <rect x="3" y="6" width="18" height="13" rx="2" />
                  <path d="M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
              )}
            </button>
            <textarea
              ref={composerRef}
              value={composer}
              onChange={autoResize}
              onKeyDown={handleComposerKey}
              rows={1}
              placeholder="… oder tippen (Voice ist schneller)"
              className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm text-ink-1 placeholder:text-ink-4 focus:outline-none"
              disabled={orbState === "thinking" || orbState === "confirming"}
            />
            <button
              type="submit"
              disabled={
                !composer.trim() ||
                orbState === "thinking" ||
                orbState === "confirming"
              }
              className="inline-flex h-8 items-center gap-1 rounded border border-action bg-action px-3 text-xs font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)] disabled:opacity-40"
            >
              Senden
              <span aria-hidden>↵</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
