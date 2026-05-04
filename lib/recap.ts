import { createClient } from "@/lib/supabase/server";
import { chat } from "@/lib/claude";
import type { Interaction } from "@/lib/types";
import type { UserContext } from "@/lib/user-context";

export type RecapPeriod = "month" | "year";

export interface RecapStats {
  periodLabel: string;
  interactions: number;
  uniquePeople: number;
  newPeople: number;
  promisesKept: number;
  todosCompleted: number;
  debriefs: number;
  longestStreak: number;
  topTopics: { topic: string; count: number }[];
  topPeople: { name: string; count: number }[];
  sentiment: { positive: number; neutral: number; tense: number };
}

export async function generateRecap({
  ctx,
  from,
  to,
  periodLabel,
}: {
  ctx: UserContext;
  from: Date;
  to: Date;
  periodLabel: string;
}): Promise<{ text: string; stats: RecapStats }> {
  const supabase = await createClient();
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const fromDate = fromIso.slice(0, 10);
  const toDate = toIso.slice(0, 10);

  const [intRes, newPeopleRes, peopleNamesRes, donePromisesRes, doneTodosRes, debriefsRes] =
    await Promise.all([
      supabase
        .from("interactions")
        .select("type, summary, sentiment, topics, person_ids, occurred_at")
        .gte("occurred_at", fromIso)
        .lte("occurred_at", toIso),
      supabase
        .from("people")
        .select("id", { count: "exact", head: true })
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .is("deleted_at", null)
        .eq("is_self", false),
      supabase
        .from("people")
        .select("id, name")
        .is("deleted_at", null),
      supabase
        .from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("status", "done")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabase
        .from("todos")
        .select("id", { count: "exact", head: true })
        .eq("status", "done")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      supabase
        .from("debriefs")
        .select("date")
        .gte("date", fromDate)
        .lte("date", toDate),
    ]);

  if (intRes.error) throw intRes.error;
  if (peopleNamesRes.error) throw peopleNamesRes.error;
  if (debriefsRes.error) throw debriefsRes.error;

  const interactions = (intRes.data ?? []) as Interaction[];
  const peopleNames = new Map<string, string>(
    (peopleNamesRes.data ?? []).map((p) => [
      p.id as string,
      p.name as string,
    ]),
  );

  const uniquePeopleSet = new Set<string>();
  const peopleCount = new Map<string, number>();
  const topicCount = new Map<string, number>();
  const sentiment = { positive: 0, neutral: 0, tense: 0 };
  for (const i of interactions) {
    for (const pid of i.person_ids ?? []) {
      uniquePeopleSet.add(pid);
      peopleCount.set(pid, (peopleCount.get(pid) ?? 0) + 1);
    }
    for (const t of i.topics ?? []) {
      topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
    }
    if (i.sentiment === "positive") sentiment.positive += 1;
    else if (i.sentiment === "tense") sentiment.tense += 1;
    else sentiment.neutral += 1;
  }

  const topTopics = Array.from(topicCount.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topPeople = Array.from(peopleCount.entries())
    .map(([id, count]) => ({ name: peopleNames.get(id) ?? "?", count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const debriefDates = new Set(
    (debriefsRes.data ?? []).map((d) => (d as { date: string }).date),
  );
  const longestStreak = computeLongestStreak(debriefDates);

  const stats: RecapStats = {
    periodLabel,
    interactions: interactions.length,
    uniquePeople: uniquePeopleSet.size,
    newPeople: newPeopleRes.count ?? 0,
    promisesKept: donePromisesRes.count ?? 0,
    todosCompleted: doneTodosRes.count ?? 0,
    debriefs: debriefDates.size,
    longestStreak,
    topTopics,
    topPeople,
    sentiment,
  };

  const prompt = buildRecapPrompt(ctx.display_name, stats);
  const text = await chat({
    messages: [{ role: "user", content: prompt }],
    system: SYSTEM_PROMPT,
    apiKey: ctx.claude_key,
    maxTokens: 800,
  });

  return { text: text.trim(), stats };
}

const SYSTEM_PROMPT = `Du bist ECHO, der persönliche Beziehungs-Assistent.
Du verfasst einen reflektierenden Rückblick auf einen Zeitraum
(Monat oder Jahr) — kein Action-Plan, sondern eine Bestandsaufnahme.

Format:
- Klartext, kein Markdown.
- Auf Deutsch, in zweiter Person.
- 4-6 kurze Absätze.
- Beginne mit einer Eröffnung die den Zeitraum benennt.
- Nutze die rohen Stats als Basis, übersetze sie in ruhige Sätze.
- Nenne 2-3 Personen namentlich (top_people) wenn vorhanden.
- Schließe mit einem Satz Beobachtung — kein Bewertung-Urteil, eher
  ein "was fällt auf, was lädt zum nächsten Zeitraum ein".

Vermeide Floskeln wie "Du hast Großartiges geleistet". Sei sachlich
und warm.`;

function buildRecapPrompt(displayName: string, stats: RecapStats): string {
  const lines: string[] = [];
  lines.push(`Rückblick für ${displayName} — ${stats.periodLabel}`);
  lines.push("");
  lines.push(`Interaktionen geloggt: ${stats.interactions}`);
  lines.push(`Eindeutige Personen kontaktiert: ${stats.uniquePeople}`);
  lines.push(`Neue Personen ins CRM: ${stats.newPeople}`);
  lines.push(`Versprechen eingehalten: ${stats.promisesKept}`);
  lines.push(`Aufgaben erledigt: ${stats.todosCompleted}`);
  lines.push(`Debriefs durchgeführt: ${stats.debriefs}`);
  lines.push(`Längster Debrief-Streak: ${stats.longestStreak}`);
  lines.push("");
  if (stats.topPeople.length > 0) {
    lines.push("Top Personen (nach Anzahl Interaktionen):");
    for (const p of stats.topPeople) {
      lines.push(`- ${p.name}: ${p.count}`);
    }
    lines.push("");
  }
  if (stats.topTopics.length > 0) {
    lines.push("Top Themen:");
    for (const t of stats.topTopics) {
      lines.push(`- ${t.topic}: ${t.count}`);
    }
    lines.push("");
  }
  const total = stats.sentiment.positive + stats.sentiment.neutral + stats.sentiment.tense;
  if (total > 0) {
    lines.push(
      `Sentiment-Verteilung: ${stats.sentiment.positive} positiv, ${stats.sentiment.neutral} neutral, ${stats.sentiment.tense} angespannt`,
    );
  }
  return lines.join("\n");
}

function computeLongestStreak(dates: Set<string>): number {
  if (dates.size === 0) return 0;
  const sorted = Array.from(dates).sort();
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const s of sorted) {
    const d = new Date(s);
    if (
      prev &&
      (d.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24) === 1
    ) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prev = d;
  }
  return longest;
}
