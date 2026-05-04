"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ToolCall } from "@/lib/tools";
import { stripMarkdown } from "@/lib/text";
import { ExtractionConfirmation } from "./extraction-confirmation";

type OrbState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "confirming"
  | "error";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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

const MAX_HISTORY = 16;

const STATE_LABEL: Record<OrbState, string> = {
  idle: "Tippen zum Sprechen",
  listening: "Höre zu — nochmal tippen zum Beenden",
  thinking: "ECHO denkt nach…",
  speaking: "ECHO spricht — tippen zum Stoppen",
  confirming: "Bestätigen oder verwerfen",
  error: "Fehler — tippen für Neustart",
};

const STATE_RING: Record<OrbState, string> = {
  idle: "ring-1 ring-rule bg-paper-2",
  listening: "ring-2 ring-action bg-action/10 animate-pulse",
  thinking: "ring-1 ring-rule bg-paper-2",
  speaking: "ring-2 ring-signal bg-signal-soft animate-pulse",
  confirming: "ring-2 ring-action/60 bg-paper-2",
  error: "ring-2 ring-bad bg-paper-2",
};

export function VoiceOrb() {
  const router = useRouter();
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [interim, setInterim] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[]>([]);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const finalRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {}
      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
      audioRef.current?.pause();
    };
  }, []);

  function resetSilenceTimer() {
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = window.setTimeout(() => {
      try {
        recognitionRef.current?.stop();
      } catch {}
    }, 2000);
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
    async (text: string) => {
      if (!text) {
        setOrbState("idle");
        return;
      }

      setSuggestedReplies([]);

      const userMessage: ChatMessage = { role: "user", content: text };
      const next: ChatMessage[] = [...messages, userMessage].slice(
        -MAX_HISTORY,
      );
      setMessages(next);
      setOrbState("thinking");

      try {
        const extractRes = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: text, history: messages }),
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
          const assistantMessage: ChatMessage = {
            role: "assistant",
            content: assistantText,
          };
          setMessages((prev) =>
            [...prev, assistantMessage].slice(-MAX_HISTORY),
          );
        }

        const writeCalls = (toolCalls ?? []).filter(
          (c) => c.name !== "suggest_replies",
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

        if (assistantText) {
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
    [messages, playSpeech],
  );

  const processFinal = useCallback(async () => {
    const text = finalRef.current.trim();
    finalRef.current = "";
    setInterim("");
    await submitText(text);
  }, [submitText]);

  const startListening = useCallback(() => {
    setError(null);
    setPendingToolCalls([]);

    if (!recognitionRef.current) {
      const Ctor =
        window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (!Ctor) {
        setError(
          "Dein Browser unterstützt keine Spracherkennung. Nimm Chrome oder Edge.",
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
        setError(`Spracherkennung: ${event.error}`);
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

  async function handleConfirm() {
    if (!pendingToolCalls.length) return;
    setCommitting(true);
    try {
      const res = await fetch("/api/extract/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolCalls: pendingToolCalls }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Commit ${res.status}`);
      }
      setPendingToolCalls([]);
      setOrbState("idle");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Speichern fehlgeschlagen";
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

  function handleClick() {
    if (orbState === "idle" || orbState === "error") {
      startListening();
      return;
    }
    if (orbState === "listening") {
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

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");

  return (
    <div className="flex flex-col items-center gap-8">
      <button
        type="button"
        onClick={handleClick}
        disabled={orbState === "thinking" || orbState === "confirming"}
        className={`h-48 w-48 rounded-full transition-all duration-300 disabled:cursor-not-allowed ${STATE_RING[orbState]}`}
        aria-label={STATE_LABEL[orbState]}
      >
        <span className="sr-only">{STATE_LABEL[orbState]}</span>
      </button>

      <p className="t-label">{STATE_LABEL[orbState]}</p>

      <div className="w-full max-w-xl space-y-4 text-sm">
        {orbState === "listening" && interim && (
          <p className="italic text-ink-3">„{interim}…"</p>
        )}
        {lastUser && (
          <p className="text-ink-2">
            <span className="t-label mr-2 inline">Du</span>
            {lastUser.content}
          </p>
        )}
        {lastAssistant && (
          <p className="text-ink-1">
            <span className="t-label mr-2 inline">ECHO</span>
            {lastAssistant.content}
          </p>
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
                    void submitText(reply);
                  }}
                  className="rounded border border-rule bg-paper px-3 py-1.5 text-sm text-ink-1 transition hover:border-action hover:bg-action-soft"
                >
                  {reply}
                </button>
              ))}
            </div>
          )}

        {orbState === "confirming" && pendingToolCalls.length > 0 && (
          <ExtractionConfirmation
            toolCalls={pendingToolCalls}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            pending={committing}
          />
        )}

        {error && <p className="text-bad">{error}</p>}
      </div>
    </div>
  );
}
