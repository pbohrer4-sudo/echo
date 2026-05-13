import { createClient } from "@/lib/supabase/server";
import { getDebriefStreak } from "@/lib/debriefs";

export interface GamificationStats {
  current_streak: number;
  longest_streak: number;
  done_today: boolean;
  total_debriefs: number;
  total_people: number;
  total_interactions: number;
  total_promises_kept: number;
  total_todos_completed: number;
  on_rhythm_pct: number | null;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  done: boolean;
  progress: number; // 0..1
  xp: number;
}

export async function getGamificationStats(): Promise<GamificationStats> {
  const supabase = await createClient();

  const [
    streak,
    debriefsRes,
    peopleRes,
    interactionsRes,
    remindersDoneRes,
    todosDoneRes,
    cadencePeopleRes,
  ] = await Promise.all([
    getDebriefStreak(),
    supabase
      .from("debriefs")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("people")
      .select("id, last_contact_at, cadence_days", { count: "exact" })
      .is("deleted_at", null)
      .eq("is_self", false),
    supabase
      .from("interactions")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("status", "done"),
    supabase
      .from("todos")
      .select("id", { count: "exact", head: true })
      .eq("status", "done"),
    supabase
      .from("people")
      .select("last_contact_at, cadence_days")
      .is("deleted_at", null)
      .eq("is_self", false),
  ]);

  // Compute on-rhythm percentage out of people with cadence + last_contact_at.
  const now = Date.now();
  let rated = 0;
  let onRhythm = 0;
  for (const p of (cadencePeopleRes.data ?? []) as Array<{
    last_contact_at: string | null;
    cadence_days: number | null;
  }>) {
    if (p.cadence_days == null || !p.last_contact_at) continue;
    rated += 1;
    const days =
      (now - new Date(p.last_contact_at).getTime()) /
      (1000 * 60 * 60 * 24);
    if (days <= p.cadence_days) onRhythm += 1;
  }

  return {
    current_streak: streak.current,
    longest_streak: streak.longest,
    done_today: streak.doneToday,
    total_debriefs: debriefsRes.count ?? 0,
    total_people: peopleRes.count ?? 0,
    total_interactions: interactionsRes.count ?? 0,
    total_promises_kept: remindersDoneRes.count ?? 0,
    total_todos_completed: todosDoneRes.count ?? 0,
    on_rhythm_pct: rated > 0 ? Math.round((onRhythm / rated) * 100) : null,
  };
}

interface Threshold {
  id: string;
  title: string;
  description: string;
  target: number;
  xp: number;
}

const STREAK_TIERS: Threshold[] = [
  {
    id: "streak_1",
    title: "Erster Debrief",
    description: "Den ersten Abend-Debrief abgeschlossen.",
    target: 1,
    xp: 50,
  },
  {
    id: "streak_7",
    title: "Eine Woche",
    description: "7 Debriefs in Folge.",
    target: 7,
    xp: 100,
  },
  {
    id: "streak_30",
    title: "Ein Monat",
    description: "30 Debriefs in Folge.",
    target: 30,
    xp: 250,
  },
  {
    id: "streak_100",
    title: "100 Tage",
    description: "100 Debriefs in Folge.",
    target: 100,
    xp: 500,
  },
  {
    id: "streak_365",
    title: "Ein Jahr",
    description: "365 Debriefs in Folge — Lebensgewohnheit.",
    target: 365,
    xp: 1500,
  },
];

const PEOPLE_TIERS: Threshold[] = [
  {
    id: "people_1",
    title: "Erste Person",
    description: "Eine Person ins CRM aufgenommen.",
    target: 1,
    xp: 25,
  },
  {
    id: "people_10",
    title: "10 Personen",
    description: "10 Personen gepflegt.",
    target: 10,
    xp: 75,
  },
  {
    id: "people_50",
    title: "50 Personen",
    description: "Dein Netzwerk wächst.",
    target: 50,
    xp: 200,
  },
  {
    id: "people_100",
    title: "100 Personen",
    description: "Drei Stelliges Netzwerk.",
    target: 100,
    xp: 400,
  },
  {
    id: "people_250",
    title: "250 Personen",
    description: "Du kennst halb München.",
    target: 250,
    xp: 800,
  },
];

const INTERACTION_TIERS: Threshold[] = [
  {
    id: "interactions_1",
    title: "Erste Interaktion",
    description: "Treffen, Anruf oder Notiz geloggt.",
    target: 1,
    xp: 25,
  },
  {
    id: "interactions_100",
    title: "100 Interaktionen",
    description: "Konstante Pflege.",
    target: 100,
    xp: 250,
  },
  {
    id: "interactions_500",
    title: "500 Interaktionen",
    description: "ECHO ist Teil deines Alltags.",
    target: 500,
    xp: 600,
  },
];

const PROMISES_TIERS: Threshold[] = [
  {
    id: "promises_1",
    title: "Erstes Versprechen",
    description: "Erste Erinnerung als erledigt markiert.",
    target: 1,
    xp: 25,
  },
  {
    id: "promises_25",
    title: "25 Versprechen",
    description: "Du hältst Wort.",
    target: 25,
    xp: 150,
  },
  {
    id: "promises_100",
    title: "100 Versprechen",
    description: "Verlässlich.",
    target: 100,
    xp: 400,
  },
];

function tierToAchievement(t: Threshold, current: number): Achievement {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    done: current >= t.target,
    progress: Math.min(1, current / t.target),
    xp: t.xp,
  };
}

export function buildAchievements(stats: GamificationStats): Achievement[] {
  const list: Achievement[] = [];
  for (const tier of STREAK_TIERS) list.push(tierToAchievement(tier, stats.longest_streak));
  for (const tier of PEOPLE_TIERS) list.push(tierToAchievement(tier, stats.total_people));
  for (const tier of INTERACTION_TIERS)
    list.push(tierToAchievement(tier, stats.total_interactions));
  for (const tier of PROMISES_TIERS)
    list.push(tierToAchievement(tier, stats.total_promises_kept));

  // Cadence-based achievement (only if user has rated people).
  if (stats.on_rhythm_pct !== null && stats.on_rhythm_pct >= 80) {
    list.push({
      id: "rhythm_80",
      title: "Im Takt",
      description: "80% deiner bewerteten Beziehungen sind im Rhythmus.",
      done: true,
      progress: 1,
      xp: 200,
    });
  } else if (stats.on_rhythm_pct !== null) {
    list.push({
      id: "rhythm_80",
      title: "Im Takt",
      description: "80% deiner bewerteten Beziehungen im Rhythmus halten.",
      done: false,
      progress: Math.min(1, stats.on_rhythm_pct / 80),
      xp: 200,
    });
  }

  return list;
}

export function totalXp(achievements: Achievement[]): number {
  return achievements
    .filter((a) => a.done)
    .reduce((sum, a) => sum + a.xp, 0);
}

// Level: 500 XP per level. Level 1 = 0–499, Level 2 = 500–999, etc.
export function levelFromXp(xp: number): {
  level: number;
  current: number;
  next: number;
  toNext: number;
} {
  const level = Math.floor(xp / 500) + 1;
  const current = xp % 500;
  const next = 500;
  return { level, current, next, toNext: next - current };
}
