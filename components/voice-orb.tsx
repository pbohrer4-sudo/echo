"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type OrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

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
  error: "Fehler — tippen für Neustart",
};

const STATE_RING: Record<OrbState, string> = {
  idle: "ring-1 ring-neutral-800 bg-neutral-900",
  listening: "ring-2 ring-[#c8ff3e] bg-[#c8ff3e]/15 animate-pulse",
  thinking: "ring-1 ring-neutral-700 bg-neutral-900",
  speaking: "ring-2 ring-[#c8ff3e] bg-[#c8ff3e]/30 animate-pulse",
  error: "ring-2 ring-red-600 bg-red-900/20",
};

export function VoiceOrb() {
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [interim, setInterim] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const finalRef = useRef("");

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {}
      audioRef.current?.pause();
    };
  }, []);

  const processFinal = useCallback(async () => {
    const text = finalRef.current.trim();
    finalRef.current = "";
    setInterim("");

    if (!text) {
      setOrbState("idle");
      return;
    }

    const userMessage: ChatMessage = { role: "user", content: text };
    const next: ChatMessage[] = [...messages, userMessage].slice(-MAX_HISTORY);
    setMessages(next);
    setOrbState("thinking");

    try {
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!chatRes.ok) {
        const data = await chatRes.json().catch(() => ({}));
        throw new Error(data.error ?? `Chat ${chatRes.status}`);
      }
      const { text: assistantText } = (await chatRes.json()) as {
        text: string;
      };

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: assistantText,
      };
      const updated: ChatMessage[] = [...next, assistantMessage].slice(
        -MAX_HISTORY,
      );
      setMessages(updated);

      const ttsRes = await fetch("/api/voice/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: assistantText }),
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
          setOrbState("idle");
        }
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setError("Audio-Wiedergabe fehlgeschlagen");
        setOrbState("error");
      };
      await audio.play();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      setError(message);
      setOrbState("error");
    }
  }, [messages]);

  const startListening = useCallback(() => {
    setError(null);

    if (!recognitionRef.current) {
      const Ctor =
        window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (!Ctor) {
        setError("Dein Browser unterstützt keine Spracherkennung. Nimm Chrome oder Edge.");
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
      processFinal();
    };

    try {
      recognition.start();
      setOrbState("listening");
    } catch (err) {
      console.error(err);
      setError("Mikrofon nicht verfügbar — Berechtigung erteilt?");
      setOrbState("error");
    }
  }, [processFinal]);

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
      setOrbState("idle");
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
        disabled={orbState === "thinking"}
        className={`h-48 w-48 rounded-full transition-all duration-300 disabled:cursor-not-allowed ${STATE_RING[orbState]}`}
        aria-label={STATE_LABEL[orbState]}
      >
        <span className="sr-only">{STATE_LABEL[orbState]}</span>
      </button>

      <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
        {STATE_LABEL[orbState]}
      </p>

      <div className="min-h-24 w-full max-w-xl space-y-3 text-sm">
        {orbState === "listening" && interim && (
          <p className="text-neutral-400 italic">„{interim}…"</p>
        )}
        {lastUser && (
          <p className="text-neutral-300">
            <span className="text-neutral-500">Du: </span>
            {lastUser.content}
          </p>
        )}
        {lastAssistant && (
          <p className="text-[#c8ff3e]">
            <span className="text-neutral-500">ECHO: </span>
            {lastAssistant.content}
          </p>
        )}
        {error && <p className="text-red-400">{error}</p>}
      </div>
    </div>
  );
}
