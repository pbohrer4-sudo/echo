"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ToolCall } from "@/lib/tools";
import { stripMarkdown } from "@/lib/text";
import { ExtractionConfirmation } from "./extraction-confirmation";
import type { DebriefContext } from "@/lib/debriefs";

type Phase =
  | "idle"
  | "greeting"
  | "greeting-decide"
  | "prompt"
  | "listening"
  | "extracting"
  | "summary"
  | "confirming"
  | "next"
  | "next-decide"
  | "finalizing"
  | "outro"
  | "done"
  | "aborted";

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

const HARD_CAP_MS = 5 * 60 * 1000;

const STATE_RING: Record<string, string> = {
  speaking: "ring-2 ring-signal bg-signal-soft animate-pulse",
  listening: "ring-2 ring-action bg-action/10 animate-pulse",
  thinking: "ring-1 ring-rule bg-paper-2",
  idle: "ring-1 ring-rule bg-paper-2",
  done: "ring-2 ring-action bg-action-soft",
  aborted: "ring-1 ring-rule bg-paper-2",
};

interface CountTotals {
  people: number;
  interactions: number;
  notes: number;
  reminders: number;
  todos: number;
}

const ZERO_COUNTS: CountTotals = {
  people: 0,
  interactions: 0,
  notes: 0,
  reminders: 0,
  todos: 0,
};

function countLabel(n: number, sing: string, plur: string): string {
  return `${n} ${n === 1 ? sing : plur}`;
}

export function DebriefFlow({
  displayName,
  context,
}: {
  displayName: string;
  context: DebriefContext;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [interim, setInterim] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[]>([]);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [totals, setTotals] = useState<CountTotals>(ZERO_COUNTS);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const finalRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const hardCapTimerRef = useRef<number | null>(null);
  const abortedRef = useRef(false);
  // submitText recurses on chip replies — closure-captured `messages`
  // would be one turn behind. We mirror state into a ref so the
  // recursion sees the latest history.
  const messagesRef = useRef<ChatMessage[]>([]);

  const stopAudio = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const playTTS = useCallback(async (text: string): Promise<void> => {
    const res = await fetch("/api/voice/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `TTS ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    return new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (audioRef.current === audio) audioRef.current = null;
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Audio-Wiedergabe fehlgeschlagen"));
      };
      audio.play().catch(reject);
    });
  }, []);

  const ensureRecognition = useCallback((): RecognitionInstance | null => {
    if (recognitionRef.current) return recognitionRef.current;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Dein Browser unterstützt keine Spracherkennung. Nimm Chrome oder Edge.");
      return null;
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
    };
    recognitionRef.current = recognition;
    return recognition;
  }, []);

  // 3 Sekunden Stille = beenden. Konsistent mit voice-orb damit beide
  // Flows sich gleich anfühlen.
  function resetSilenceTimer() {
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = window.setTimeout(() => {
      try {
        recognitionRef.current?.stop();
      } catch {}
    }, 3000);
  }

  const listenOnce = useCallback(
    (): Promise<string> =>
      new Promise((resolve) => {
        const recognition = ensureRecognition();
        if (!recognition) {
          resolve("");
          return;
        }
        finalRef.current = "";
        setInterim("");
        recognition.onend = () => {
          recognition.onend = null;
          if (silenceTimerRef.current) {
            window.clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          resolve(finalRef.current.trim());
        };
        try {
          recognition.start();
          resetSilenceTimer();
        } catch {
          resolve("");
        }
      }),
    [ensureRecognition],
  );

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {}
  }, []);

  const speak = useCallback(
    async (text: string) => {
      setMessages((prev) => {
        const next = [...prev, { role: "assistant" as const, content: text }];
        messagesRef.current = next;
        return next;
      });
      try {
        await playTTS(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : "TTS fehlgeschlagen");
      }
    },
    [playTTS],
  );

  // Start the flow once on mount. The empty deps array + the phase check
  // inside guarantees this fires exactly once even under React Strict Mode.
  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    startedAtRef.current = Date.now();

    // Real watchdog — if the flow hasn't completed within HARD_CAP_MS,
    // force a finalize. The previous Date.now() check at the top of
    // startTurn/askNext only fired between turns; a long monologue or
    // a stuck recognition call would never trigger it.
    hardCapTimerRef.current = window.setTimeout(() => {
      if (abortedRef.current) return;
      void finalize();
    }, HARD_CAP_MS);

    (async () => {
      const interactionsLine =
        context.interactionsToday > 0
          ? `Du hattest heute ${countLabel(context.interactionsToday, "Interaktion", "Interaktionen")} bisher`
          : "Bisher steht heute noch nichts in deinem Tag";
      const remindersLine =
        context.dueRemindersToday > 0
          ? ` und ${countLabel(context.dueRemindersToday, "offene Erinnerung", "offene Erinnerungen")}`
          : "";

      setPhase("greeting");
      await speak(
        `Guten Abend, ${displayName}. ${interactionsLine}${remindersLine}. Bereit für den Debrief?`,
      );
      setPhase("greeting-decide");
    })();

    return () => {
      abortedRef.current = true;
      try {
        recognitionRef.current?.abort();
      } catch {}
      stopAudio();
      if (silenceTimerRef.current) {
        window.clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (hardCapTimerRef.current) {
        window.clearTimeout(hardCapTimerRef.current);
        hardCapTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function abort() {
    setPhase("aborted");
    stopAudio();
    stopListening();
    await speak("Alles klar, dann morgen. Schlaf gut.");
    setPhase("done");
  }

  async function submitText(transcript: string) {
    if (abortedRef.current) return;
    setSuggestedReplies([]);
    // Mirror into messagesRef so any re-entrant submitText (chip-reply
    // chains) sees the up-to-date history instead of a stale closure.
    setMessages((prev) => {
      const next = [...prev, { role: "user" as const, content: transcript }];
      messagesRef.current = next;
      return next;
    });
    setPhase("extracting");

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, history: messagesRef.current }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Extract ${res.status}`);
      }
      const { text: rawText, toolCalls } = (await res.json()) as {
        text: string;
        toolCalls: ToolCall[];
      };
      const text = stripMarkdown(rawText ?? "");

      const writeCalls = (toolCalls ?? []).filter(
        (c) => c.name !== "suggest_replies",
      );
      const replies = (toolCalls ?? []).find(
        (c) => c.name === "suggest_replies",
      );
      const replyOptions = replies
        ? ((replies.input as { replies?: string[] }).replies ?? []).slice(0, 5)
        : [];

      if (writeCalls.length > 0) {
        setPendingToolCalls(writeCalls);
        setPhase("summary");
        if (text) await speak(text);
        setPhase("confirming");
      } else if (replyOptions.length > 0) {
        // Question with quick replies — speak, then offer chips + listening.
        if (text) {
          setPhase("summary");
          await speak(text);
        }
        setSuggestedReplies(replyOptions);
        setPhase("listening");
        const next = await listenOnce();
        setInterim("");
        if (next) {
          await submitText(next);
        } else {
          // Silence — chips stay visible, user clicks one or we move on.
          setPhase("listening");
        }
      } else {
        if (text) {
          setPhase("summary");
          await speak(text);
        }
        await askNext();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Extrahieren");
      setPhase("confirming");
    }
  }

  async function startTurn() {
    if (abortedRef.current) return;
    if (Date.now() - startedAtRef.current > HARD_CAP_MS) {
      await finalize();
      return;
    }
    setPhase("prompt");
    await speak(
      "Erzähl mir von deinem Tag. Wer war dabei, was kam raus?",
    );
    setPhase("listening");
    const transcript = await listenOnce();
    setInterim("");
    if (!transcript) {
      // Empty — assume user is done.
      await finalize();
      return;
    }
    await submitText(transcript);
  }

  function handleChipClick(reply: string) {
    try {
      recognitionRef.current?.stop();
    } catch {}
    setSuggestedReplies([]);
    void submitText(reply);
  }

  async function askNext() {
    if (abortedRef.current) return;
    if (Date.now() - startedAtRef.current > HARD_CAP_MS) {
      await finalize();
      return;
    }
    setPhase("next");
    await speak("Noch etwas, das ich festhalten soll?");
    setPhase("next-decide");
  }

  // Track confirm-in-flight to disable the button so the user can't
  // double-commit the same set of tool calls.
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm(editedCalls: ToolCall[]) {
    if (!editedCalls.length) {
      await handleCancel();
      return;
    }
    if (confirming) return;
    setConfirming(true);
    setPhase("extracting");
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
      const { commits } = (await res.json()) as { commits: CountTotals };
      setTotals((prev) => ({
        people: prev.people + commits.people,
        interactions: prev.interactions + commits.interactions,
        notes: prev.notes + commits.notes,
        reminders: prev.reminders + commits.reminders,
        todos: prev.todos + commits.todos,
      }));
      setPendingToolCalls([]);
      await askNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
      setPhase("confirming");
    } finally {
      setConfirming(false);
    }
  }

  async function handleCancel() {
    setPendingToolCalls([]);
    await askNext();
  }

  async function finalize() {
    if (hardCapTimerRef.current) {
      window.clearTimeout(hardCapTimerRef.current);
      hardCapTimerRef.current = null;
    }
    setPhase("finalizing");
    const durationSec = Math.floor((Date.now() - startedAtRef.current) / 1000);
    const summaryText = messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content)
      .join(" — ");
    try {
      await fetch("/api/debriefs/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: summaryText,
          duration_sec: durationSec,
          counts: totals,
        }),
      });
    } catch {
      // Don't block the outro on a failed save — the data already exists.
    }

    const parts: string[] = [];
    if (totals.interactions)
      parts.push(countLabel(totals.interactions, "Interaktion", "Interaktionen"));
    if (totals.reminders)
      parts.push(countLabel(totals.reminders, "Erinnerung", "Erinnerungen"));
    if (totals.todos) parts.push(countLabel(totals.todos, "Aufgabe", "Aufgaben"));
    if (totals.notes) parts.push(countLabel(totals.notes, "Notiz", "Notizen"));
    if (totals.people)
      parts.push(countLabel(totals.people, "neue Person", "neue Personen"));

    setPhase("outro");
    if (parts.length) {
      await speak(
        `${parts.join(", ")} gespeichert. Schlaf gut, ${displayName}.`,
      );
    } else {
      await speak(`War wenig los heute. Schlaf gut, ${displayName}.`);
    }
    setPhase("done");
    router.refresh();
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");

  const orbVariant: keyof typeof STATE_RING = (() => {
    if (phase === "greeting" || phase === "prompt" || phase === "summary" || phase === "next" || phase === "outro")
      return "speaking";
    if (phase === "listening") return "listening";
    if (phase === "extracting" || phase === "finalizing") return "thinking";
    if (phase === "done") return "done";
    if (phase === "aborted") return "aborted";
    return "idle";
  })();

  const showGreetingDecide = phase === "greeting-decide";
  const showNextDecide = phase === "next-decide";
  const showConfirming =
    phase === "confirming" && pendingToolCalls.length > 0;
  const showStopListen = phase === "listening";
  const isDone = phase === "done";

  return (
    <div className="flex flex-col items-center gap-8">
      <div
        className={`h-40 w-40 rounded-full transition-all duration-300 ${STATE_RING[orbVariant]}`}
        aria-hidden
      />

      <p className="t-label">
        {phase === "greeting" && "ECHO begrüßt"}
        {phase === "greeting-decide" && "Bereit?"}
        {phase === "prompt" && "ECHO fragt"}
        {phase === "listening" && "Höre zu — tippen zum Beenden"}
        {phase === "extracting" && "Strukturiere…"}
        {phase === "summary" && "ECHO fasst zusammen"}
        {phase === "confirming" && "Bestätigen"}
        {phase === "next" && "ECHO fragt"}
        {phase === "next-decide" && "Noch etwas?"}
        {phase === "finalizing" && "Speichere…"}
        {phase === "outro" && "Gute Nacht"}
        {phase === "done" && "Fertig"}
        {phase === "aborted" && "Übersprungen"}
        {phase === "idle" && "Lade…"}
      </p>

      <div className="w-full max-w-xl space-y-4 text-sm">
        {phase === "listening" && interim && (
          <p className="italic text-ink-3">„{interim}…"</p>
        )}
        {lastUser && phase !== "listening" && (
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

        {suggestedReplies.length > 0 && phase === "listening" && (
          <div className="flex flex-wrap justify-center gap-2">
            {suggestedReplies.map((reply) => (
              <button
                key={reply}
                type="button"
                onClick={() => handleChipClick(reply)}
                className="rounded border border-rule bg-paper px-3 py-1.5 text-sm text-ink-1 transition hover:border-action hover:bg-action-soft"
              >
                {reply}
              </button>
            ))}
          </div>
        )}

        {showStopListen && suggestedReplies.length === 0 && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={stopListening}
              className="rounded border border-action bg-action px-4 py-2 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
            >
              Fertig — auswerten
            </button>
          </div>
        )}

        {showGreetingDecide && (
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={startTurn}
              className="rounded border border-action bg-action px-4 py-2 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
            >
              Ja, los
            </button>
            <button
              type="button"
              onClick={abort}
              className="rounded border border-rule px-4 py-2 text-sm text-ink-2 transition hover:border-ink-3 hover:text-ink-1"
            >
              Nicht heute
            </button>
          </div>
        )}

        {showConfirming && (
          <ExtractionConfirmation
            toolCalls={pendingToolCalls}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            pending={confirming}
          />
        )}

        {showNextDecide && (
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={startTurn}
              className="rounded border border-action bg-action px-4 py-2 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
            >
              Ja, weiter
            </button>
            <button
              type="button"
              onClick={finalize}
              className="rounded border border-rule px-4 py-2 text-sm text-ink-2 transition hover:border-ink-3 hover:text-ink-1"
            >
              Nein, das war's
            </button>
          </div>
        )}

        {isDone && (
          <div className="flex flex-col items-center gap-3 rounded border border-rule bg-paper-2 p-5">
            <p className="t-label">Gespeichert</p>
            <ul className="space-y-1 text-sm text-ink-2">
              <li>{totals.interactions} Interaktionen</li>
              <li>{totals.reminders} Erinnerungen</li>
              <li>{totals.todos} Aufgaben</li>
              <li>{totals.notes} Notizen</li>
              <li>{totals.people} neue Personen</li>
            </ul>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-2 rounded border border-rule px-4 py-2 text-sm text-ink-2 transition hover:border-ink-3 hover:text-ink-1"
            >
              Zurück zur Voice-Seite
            </button>
          </div>
        )}

        {error && <p className="text-bad">{error}</p>}
      </div>
    </div>
  );
}
