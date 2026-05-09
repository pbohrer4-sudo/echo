"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// localStorage shape — kept tiny on purpose. ringingTargetAt is the
// absolute unix-ms moment we should ring; recomputed when the user
// toggles enable, edits the time, or dismisses a ring.
interface AlarmState {
  enabled: boolean;
  time: string; // "HH:MM"
  snoozeMin: 5 | 10 | 15;
  targetAt: number | null;
}

const STORAGE_KEY = "echo:alarm:v1";
const DEFAULT_STATE: AlarmState = {
  enabled: false,
  time: "07:30",
  snoozeMin: 10,
  targetAt: null,
};

const DAY_NAMES = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

// Compute the next time `HH:MM` will hit, starting from `from`. Used
// both on toggle-on and after a ring is dismissed.
function nextOccurrence(time: string, from: number): number {
  const [hh, mm] = time.split(":").map((s) => parseInt(s, 10));
  const target = new Date(from);
  target.setHours(hh, mm, 0, 0);
  if (target.getTime() <= from) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

function formatRelative(ms: number): string {
  if (ms <= 0) return "jetzt";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `in ${m} min`;
  if (h < 24) return `in ${h} h ${m} min`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return `in ${d} ${d === 1 ? "Tag" : "Tagen"} ${remH} h`;
}

function formatWhenRings(targetAt: number, now: number): string {
  const t = new Date(targetAt);
  const isToday = new Date(now).toDateString() === t.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = tomorrow.toDateString() === t.toDateString();
  const time = `${String(t.getHours()).padStart(2, "0")}:${String(
    t.getMinutes(),
  ).padStart(2, "0")}`;
  if (isToday) return `Heute, ${time}`;
  if (isTomorrow) return `Morgen, ${time}`;
  return `${DAY_NAMES[t.getDay()].slice(0, 2)}., ${t.getDate()}. ${MONTH_NAMES[t.getMonth()]}, ${time}`;
}

function loadState(): AlarmState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<AlarmState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: AlarmState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

// WebAudio-based tone so we don't need to ship sound assets. Triangle
// wave at 880Hz with a short envelope = clean, classic alarm beep.
function useAlarmTone() {
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const ensureCtx = useCallback(() => {
    if (ctxRef.current) return ctxRef.current;
    const Ctor =
      typeof window !== "undefined"
        ? (window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext)
        : null;
    if (!Ctor) return null;
    ctxRef.current = new Ctor();
    return ctxRef.current;
  }, []);

  const playBeep = useCallback(
    (durationMs = 200) => {
      const ctx = ensureCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = 880;
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
      gain.gain.linearRampToValueAtTime(0.2, now + durationMs / 1000 - 0.05);
      gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + durationMs / 1000);
    },
    [ensureCtx],
  );

  const startLoop = useCallback(() => {
    const ctx = ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    let id: number | null = null;
    const tick = () => {
      // Triple-beep pattern: beep, gap, beep, gap, beep — feels like
      // a real alarm rather than a mosquito.
      playBeep(180);
      window.setTimeout(() => playBeep(180), 280);
      window.setTimeout(() => playBeep(180), 560);
    };
    tick();
    id = window.setInterval(tick, 1400);
    stopRef.current = () => {
      if (id !== null) window.clearInterval(id);
    };
  }, [ensureCtx, playBeep]);

  const stopLoop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopLoop();
      ctxRef.current?.close().catch(() => {});
    };
  }, [stopLoop]);

  return { playBeep, startLoop, stopLoop };
}

export function AlarmClock() {
  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState<AlarmState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [ringing, setRinging] = useState(false);
  const tone = useAlarmTone();

  // Hydrate from localStorage on mount. Guard with `hydrated` so the
  // server-rendered HTML doesn't flash a different state.
  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  // Persist on every change.
  useEffect(() => {
    if (!hydrated) return;
    saveState(state);
  }, [state, hydrated]);

  // 1-second tick keeps the clock + countdown live.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Fire the alarm when we cross the target. Guard with hydrated so
  // we don't ring against a stale default during SSR mismatch.
  useEffect(() => {
    if (!hydrated) return;
    if (!state.enabled || state.targetAt === null) return;
    if (ringing) return;
    if (now >= state.targetAt) {
      setRinging(true);
      tone.startLoop();
    }
  }, [hydrated, state.enabled, state.targetAt, ringing, now, tone]);

  function setEnabled(enabled: boolean) {
    setState((prev) => ({
      ...prev,
      enabled,
      targetAt: enabled ? nextOccurrence(prev.time, Date.now()) : null,
    }));
  }

  function setTime(time: string) {
    setState((prev) => ({
      ...prev,
      time,
      targetAt: prev.enabled ? nextOccurrence(time, Date.now()) : null,
    }));
  }

  function setSnooze(snoozeMin: 5 | 10 | 15) {
    setState((prev) => ({ ...prev, snoozeMin }));
  }

  function dismissAlarm() {
    tone.stopLoop();
    setRinging(false);
    // Advance target to next occurrence of the same time so tomorrow
    // morning the alarm rings again without re-toggling.
    setState((prev) => ({
      ...prev,
      targetAt: prev.enabled
        ? nextOccurrence(prev.time, Date.now() + 60_000)
        : null,
    }));
  }

  function snoozeAlarm() {
    tone.stopLoop();
    setRinging(false);
    setState((prev) => ({
      ...prev,
      targetAt: Date.now() + prev.snoozeMin * 60_000,
    }));
  }

  function testTone() {
    // Browser audio policy requires a user gesture before playing —
    // this button click counts. Plays one beep so Patrick can hear
    // what he's signing up for.
    tone.playBeep(220);
  }

  // Live clock display.
  const clock = useMemo(() => {
    const d = new Date(now);
    return {
      hh: String(d.getHours()).padStart(2, "0"),
      mm: String(d.getMinutes()).padStart(2, "0"),
      ss: String(d.getSeconds()).padStart(2, "0"),
      date: `${DAY_NAMES[d.getDay()]}, ${d.getDate()}. ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
    };
  }, [now]);

  const remaining =
    state.enabled && state.targetAt !== null ? state.targetAt - now : null;

  return (
    <div className="space-y-6">
      {/* Big live clock — the page anchor */}
      <div className="rounded-2xl border border-rule bg-paper-2 p-8 text-center">
        <p className="t-label mb-2">{clock.date}</p>
        <div className="flex items-baseline justify-center gap-1 font-mono text-6xl font-light tabular-nums tracking-tight text-ink-1 sm:text-7xl">
          <span>{clock.hh}</span>
          <span className="opacity-40">:</span>
          <span>{clock.mm}</span>
          <span className="ml-1 text-3xl text-ink-3 sm:text-4xl">
            :{clock.ss}
          </span>
        </div>
      </div>

      {/* Alarm card */}
      <div
        className={`overflow-hidden rounded-2xl border bg-paper transition ${
          state.enabled ? "border-action/40" : "border-rule"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule bg-paper-2 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden>
              ⏰
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-1">Wecker</p>
              <p className="text-xs text-ink-3">
                {state.enabled && state.targetAt !== null
                  ? `Klingelt ${formatWhenRings(state.targetAt, now)} · ${formatRelative(remaining ?? 0)}`
                  : "Aus"}
              </p>
            </div>
          </div>
          {/* On/Off toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={state.enabled}
            onClick={() => setEnabled(!state.enabled)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${
              state.enabled ? "bg-action" : "bg-paper-3 ring-1 ring-rule"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-paper shadow transition ${
                state.enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
            <span className="sr-only">Wecker ein/aus</span>
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Time picker */}
          <label className="block">
            <span className="t-label mb-2 block">Weckzeit</span>
            <input
              type="time"
              value={state.time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl border border-rule bg-paper px-4 py-3 font-mono text-3xl tabular-nums text-ink-1 transition focus:border-action focus:outline-none focus:ring-3 focus:ring-action-ring sm:text-4xl"
            />
          </label>

          {/* Snooze */}
          <div>
            <span className="t-label mb-2 block">Snooze</span>
            <div className="inline-flex rounded-xl border border-rule bg-paper-2 p-1">
              {[5, 10, 15].map((min) => (
                <button
                  key={min}
                  type="button"
                  onClick={() => setSnooze(min as 5 | 10 | 15)}
                  className={`rounded-lg px-4 py-1.5 text-sm transition ${
                    state.snoozeMin === min
                      ? "bg-paper font-medium text-ink-1 shadow-sm"
                      : "text-ink-3 hover:text-ink-1"
                  }`}
                >
                  {min} min
                </button>
              ))}
            </div>
          </div>

          {/* Test sound + caveat */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={testTone}
              className="inline-flex items-center gap-2 rounded-lg border border-rule bg-paper px-3 py-1.5 text-xs text-ink-2 transition hover:border-action hover:text-action"
            >
              <span aria-hidden>🔔</span> Sound testen
            </button>
            <p className="max-w-xs text-right text-[10px] uppercase tracking-wider text-ink-4">
              Klingelt nur wenn ECHO offen bleibt
            </p>
          </div>
        </div>
      </div>

      {/* Full-screen ringing overlay */}
      {ringing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-paper/95 backdrop-blur">
          <div className="text-center">
            <p className="t-label mb-3">Wecker</p>
            <div className="font-mono text-7xl font-light tabular-nums text-ink-1 sm:text-8xl">
              {clock.hh}
              <span className="opacity-40">:</span>
              {clock.mm}
            </div>
            <p className="mt-3 text-sm text-ink-3">{clock.date}</p>
          </div>
          <div className="flex w-full max-w-md flex-col items-center gap-3 px-6">
            <button
              type="button"
              onClick={dismissAlarm}
              className="w-full rounded-2xl border border-action bg-action px-6 py-5 text-base font-semibold text-paper transition hover:shadow-[0_0_0_4px_var(--action-ring)]"
            >
              Aus
            </button>
            <button
              type="button"
              onClick={snoozeAlarm}
              className="w-full rounded-2xl border border-rule bg-paper px-6 py-4 text-sm font-medium text-ink-1 transition hover:border-action hover:text-action"
            >
              Snooze · {state.snoozeMin} min
            </button>
          </div>
          <p
            className="absolute inset-x-0 top-6 text-center text-xs text-ink-3 motion-safe:animate-pulse"
            aria-live="polite"
          >
            🔔 ECHO weckt dich
          </p>
        </div>
      )}
    </div>
  );
}
