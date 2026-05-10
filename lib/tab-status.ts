import { createClient } from "@/lib/supabase/server";
import { getGamificationStats, levelFromXp, buildAchievements, totalXp } from "@/lib/gamification";
import { listPeopleDuplicates } from "@/lib/duplicates";
import { getProfileDepth } from "@/lib/profile-depth";
import type { Person } from "@/lib/types";

// Computed status signals per tab on the self-profile page. Each
// signal is either a "Chance" (something you could do that would
// move you forward) or a "Problem" (something you should look at
// because it's working against you).
//
// All counts are computed once and read from the same RSC pass —
// no extra round-trips per tab.

export interface TabSignal {
  icon: string;
  label: string;
  detail?: string;
  href?: string;
}

export interface TabStatus {
  chances: TabSignal[];
  problems: TabSignal[];
}

export async function getProfileTabStatus(self: Person): Promise<TabStatus> {
  const supabase = await createClient();
  const chances: TabSignal[] = [];
  const problems: TabSignal[] = [];

  // ── Drifting + due-soon people: relationship-debt signal.
  const { data: cadencePeople } = await supabase
    .from("people")
    .select("id, name, last_interaction_at, expected_cadence_days")
    .is("deleted_at", null)
    .eq("is_self", false);
  let drifting = 0;
  let dueSoon = 0;
  let withoutCadence = 0;
  const now = Date.now();
  for (const p of (cadencePeople ?? []) as Array<{
    last_interaction_at: string | null;
    expected_cadence_days: number | null;
  }>) {
    if (p.expected_cadence_days == null) {
      withoutCadence += 1;
      continue;
    }
    if (!p.last_interaction_at) continue;
    const days =
      (now - new Date(p.last_interaction_at).getTime()) /
      (1000 * 60 * 60 * 24);
    if (days > p.expected_cadence_days * 1.5) drifting += 1;
    else if (days > p.expected_cadence_days) dueSoon += 1;
  }
  if (drifting > 0) {
    problems.push({
      icon: "📉",
      label: `${drifting} Personen drifting`,
      detail: "Über 1,5× Rhythmus her — Beziehung läuft weg",
      href: "/rhythmus",
    });
  }
  if (dueSoon > 0) {
    chances.push({
      icon: "📞",
      label: `${dueSoon} bald fällig`,
      detail: "Innerhalb 1,5× Rhythmus — gute Zeit zum Melden",
      href: "/rhythmus",
    });
  }
  if (withoutCadence > 5) {
    chances.push({
      icon: "🎯",
      label: `${withoutCadence} Personen ohne Cadence`,
      detail: "Setz Rhythmus damit ECHO dich erinnert",
      href: "/people",
    });
  }

  // ── Overdue reminders count.
  const { count: overdueCount } = await supabase
    .from("reminders")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lte("remind_at", new Date().toISOString());
  if ((overdueCount ?? 0) > 0) {
    problems.push({
      icon: "⏰",
      label: `${overdueCount} Erinnerung${overdueCount === 1 ? "" : "en"} überfällig`,
      detail: "Erledigen oder snoozen",
      href: "/inbox",
    });
  }

  // ── Duplikate (nur hochsichere zählen, damit das Signal nicht
  //     rauscht).
  const dupes = await listPeopleDuplicates();
  const highDupes = dupes.filter((d) => d.confidence === "high").length;
  if (highDupes > 0) {
    problems.push({
      icon: "🧬",
      label: `${highDupes} sichere Duplikat${highDupes === 1 ? "" : "e"}`,
      detail: "Mergen für sauberere Daten",
      href: "/people/duplicates",
    });
  }

  // ── Profil-Tiefe als Chance, falls noch Lücken.
  const depth = await getProfileDepth(self);
  if (depth.filled < depth.total) {
    chances.push({
      icon: "🧩",
      label: `Profil ${depth.filled}/${depth.total}`,
      detail: `${depth.total - depth.filled} Felder leer — füll auf was du weißt`,
      href: `/people/${self.id}/edit`,
    });
  }

  // ── Upcoming birthdays from related people in next 14 days.
  const upcoming = await listUpcomingBirthdays(supabase, 14);
  if (upcoming.length > 0) {
    chances.push({
      icon: "🎂",
      label: `${upcoming.length} Geburtstag${upcoming.length === 1 ? "" : "e"} in 14 Tagen`,
      detail: upcoming
        .slice(0, 3)
        .map((u) => `${u.name} (${u.daysAway}d)`)
        .join(" · "),
      href: "/people",
    });
  }

  return { chances, problems };
}

export async function getStreaksTabStatus(): Promise<TabStatus> {
  const chances: TabSignal[] = [];
  const problems: TabSignal[] = [];

  const stats = await getGamificationStats();
  const achievements = buildAchievements(stats);
  const xp = totalXp(achievements);
  const level = levelFromXp(xp);

  // ── Streak today: chance if not done, problem if 0 and streak existed.
  if (!stats.done_today) {
    if (stats.current_streak > 0) {
      problems.push({
        icon: "🔥",
        label: `Streak ${stats.current_streak} in Gefahr`,
        detail: "Debrief heute noch offen — sonst bricht der Streak",
        href: "/debrief",
      });
    } else {
      chances.push({
        icon: "🔥",
        label: "Neuen Streak starten",
        detail: "Mach heute Abend deinen ersten Debrief",
        href: "/debrief",
      });
    }
  }

  // ── XP-Restweg bis nächstes Level.
  if (level.toNext > 0) {
    chances.push({
      icon: "⚡",
      label: `${level.toNext} XP bis Level ${level.level + 1}`,
      detail: `Aktuell Level ${level.level} mit ${level.current} XP`,
    });
  }

  // ── Bestmarke überholbar.
  if (
    stats.longest_streak > 0 &&
    stats.current_streak < stats.longest_streak
  ) {
    chances.push({
      icon: "🏆",
      label: `Bestmarke ${stats.longest_streak} Tage`,
      detail: `Aktuell ${stats.current_streak} — schlag dich selbst`,
    });
  }

  // ── Erfolge fast erreicht (90%+ Progress, nicht done).
  const close = achievements
    .filter((a) => !a.done && a.progress >= 0.7)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 2);
  for (const a of close) {
    chances.push({
      icon: "🎖",
      label: a.title,
      detail: `${Math.round(a.progress * 100)}% — ${a.description}`,
    });
  }

  // ── Im-Rhythmus-Indikator.
  if (stats.on_rhythm_pct !== null) {
    if (stats.on_rhythm_pct >= 70) {
      chances.push({
        icon: "📈",
        label: `${stats.on_rhythm_pct}% im Rhythmus`,
        detail: "Solide Cadence-Hygiene",
      });
    } else if (stats.on_rhythm_pct < 40) {
      problems.push({
        icon: "📉",
        label: `Nur ${stats.on_rhythm_pct}% im Rhythmus`,
        detail: "Viele Beziehungen sind außer Takt",
        href: "/rhythmus",
      });
    }
  }

  return { chances, problems };
}

export async function getPaymentsTabStatus(): Promise<TabStatus> {
  // Placeholder until the billing layer exists. Returns an empty
  // status so the UI renders a "nichts zu zeigen"-state cleanly.
  return { chances: [], problems: [] };
}

export async function getSettingsTabStatus(): Promise<TabStatus> {
  const supabase = await createClient();
  const chances: TabSignal[] = [];
  const problems: TabSignal[] = [];

  // Surface state about the things the Settings page actually
  // controls — voice/debrief/keys/integrations — so the user sees
  // what's missing or live at a glance.

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "display_name, voice_id, debrief_time, claude_key_byo, elevenlabs_key_byo",
    )
    .maybeSingle();

  if (!profile?.display_name) {
    problems.push({
      icon: "🪪",
      label: "Kein Anzeigename gesetzt",
      detail: "ECHO spricht dich ohne Namen an",
    });
  }
  if (!profile?.voice_id) {
    chances.push({
      icon: "🎙",
      label: "Eigene Voice setzen",
      detail: "Sarah Eve ist Default — du kannst eine andere ElevenLabs-Stimme wählen",
    });
  }
  if (!profile?.debrief_time) {
    chances.push({
      icon: "⏰",
      label: "Debrief-Zeit setzen",
      detail: "Wann ECHO dich abends ans Debrief erinnert",
    });
  }
  if (!profile?.claude_key_byo) {
    chances.push({
      icon: "🔑",
      label: "Eigenen Anthropic-Key",
      detail: "Optional — sonst läuft alles über den shared default",
    });
  }
  if (!profile?.elevenlabs_key_byo) {
    chances.push({
      icon: "🔑",
      label: "Eigenen ElevenLabs-Key",
      detail: "Optional — höheres TTS-Quota mit eigenem Key",
    });
  }

  // Connection status — show how many providers are live vs how
  // many sit at "stub" (mostly auf catalog-only Phase).
  const { data: conns } = await supabase
    .from("service_connections")
    .select("provider, status, access_token, last_error")
    .is("deleted_at", null);
  if (conns) {
    const live = conns.filter(
      (c) =>
        c.status === "connected" &&
        !(c.access_token ?? "").startsWith("stub_"),
    ).length;
    const stubs = conns.filter((c) =>
      (c.access_token ?? "").startsWith("stub_"),
    ).length;
    const errors = conns.filter((c) => c.status === "error" || c.last_error).length;

    if (live > 0) {
      chances.push({
        icon: "🔌",
        label: `${live} echte Verbindung${live === 1 ? "" : "en"}`,
        detail: "Calendar/Gmail/WhatsApp-Sync läuft",
        href: "/connections",
      });
    }
    if (stubs > 0) {
      chances.push({
        icon: "🧪",
        label: `${stubs} Stub-Verbindung${stubs === 1 ? "" : "en"}`,
        detail: "OAuth-Credentials eintragen um echte Daten zu pullen",
        href: "/connections",
      });
    }
    if (errors > 0) {
      problems.push({
        icon: "🚨",
        label: `${errors} Verbindung${errors === 1 ? "" : "en"} mit Fehler`,
        detail: "Token abgelaufen oder Provider-Quota — neu connecten",
        href: "/connections",
      });
    }
  }

  return { chances, problems };
}

interface UpcomingBday {
  name: string;
  daysAway: number;
}

async function listUpcomingBirthdays(
  supabase: Awaited<ReturnType<typeof createClient>>,
  windowDays: number,
): Promise<UpcomingBday[]> {
  const { data } = await supabase
    .from("people")
    .select("name, birthday, important_dates")
    .is("deleted_at", null)
    .eq("is_self", false);

  const now = new Date();
  const thisYear = now.getFullYear();
  const todayMs = new Date(thisYear, now.getMonth(), now.getDate()).getTime();
  const horizon = todayMs + windowDays * 86400_000;

  const upcoming: UpcomingBday[] = [];
  for (const p of (data ?? []) as Array<{
    name: string;
    birthday: string | null;
    important_dates: Array<{ label?: string; date?: string }> | null;
  }>) {
    const dates: string[] = [];
    if (p.birthday) dates.push(p.birthday);
    for (const d of p.important_dates ?? []) {
      if (
        d?.date &&
        (d.label?.toLowerCase().includes("geburt") ||
          d.label?.toLowerCase().includes("birth"))
      ) {
        dates.push(d.date);
      }
    }
    for (const raw of dates) {
      // Parse to month/day, project onto current year window.
      const parts = raw.split("-");
      if (parts.length < 3) continue;
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (Number.isNaN(m) || Number.isNaN(d)) continue;
      let next = new Date(thisYear, m, d).getTime();
      if (next < todayMs) next = new Date(thisYear + 1, m, d).getTime();
      if (next <= horizon) {
        upcoming.push({
          name: p.name,
          daysAway: Math.round((next - todayMs) / 86400_000),
        });
      }
    }
  }
  upcoming.sort((a, b) => a.daysAway - b.daysAway);
  return upcoming;
}
