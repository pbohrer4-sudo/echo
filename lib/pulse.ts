import { createClient } from "@/lib/supabase/server";
import { chat, CLAUDE_MODEL, type AnthropicUsage } from "@/lib/claude";
import type {
  Interaction,
  Person,
  Reminder,
  Todo,
  ImportantDate,
} from "@/lib/types";
import type { UserContext } from "@/lib/user-context";

interface PulseInputs {
  recentInteractions: Interaction[];
  openReminders: Reminder[];
  openTodos: Todo[];
  stalePeople: { name: string; days_since: number; cadence: number | null }[];
  upcomingBirthdays: { name: string; date: string; days_until: number }[];
}

export async function generatePulse(ctx: UserContext): Promise<{
  text: string;
  usage: AnthropicUsage;
  model: string;
}> {
  const supabase = await createClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const [intRes, remRes, todoRes, peopleRes] = await Promise.all([
    supabase
      .from("interactions")
      .select("*")
      .gte("occurred_at", sevenDaysAgo.toISOString())
      .order("occurred_at", { ascending: false }),
    supabase
      .from("reminders")
      .select("*")
      .eq("status", "pending")
      .order("remind_at", { ascending: true }),
    supabase
      .from("todos")
      .select("*")
      .eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("people")
      .select(
        "id, name, last_interaction_at, expected_cadence_days, important_dates",
      )
      .is("deleted_at", null)
      .eq("is_self", false),
  ]);

  if (intRes.error) throw intRes.error;
  if (remRes.error) throw remRes.error;
  if (todoRes.error) throw todoRes.error;
  if (peopleRes.error) throw peopleRes.error;

  const stalePeople = (peopleRes.data ?? [])
    .filter(
      (p) => p.expected_cadence_days != null && p.last_interaction_at != null,
    )
    .map((p) => {
      const last = new Date(p.last_interaction_at as string);
      const daysSince = Math.floor(
        (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        name: p.name as string,
        days_since: daysSince,
        cadence: p.expected_cadence_days as number,
      };
    })
    .filter((p) => p.days_since > Math.floor((p.cadence ?? 30) * 1.5))
    .sort((a, b) => b.days_since - a.days_since)
    .slice(0, 8);

  const upcomingBirthdays: PulseInputs["upcomingBirthdays"] = [];
  for (const p of peopleRes.data ?? []) {
    const dates = (p.important_dates ?? []) as ImportantDate[];
    for (const d of dates) {
      if (d.label.toLowerCase() !== "geburtstag") continue;
      const next = nextOccurrenceWithinWeek(d.date, now);
      if (next === null) continue;
      upcomingBirthdays.push({
        name: p.name as string,
        date: d.date,
        days_until: next,
      });
    }
  }
  upcomingBirthdays.sort((a, b) => a.days_until - b.days_until);

  const inputs: PulseInputs = {
    recentInteractions: (intRes.data ?? []) as Interaction[],
    openReminders: (remRes.data ?? []) as Reminder[],
    openTodos: (todoRes.data ?? []) as Todo[],
    stalePeople,
    upcomingBirthdays,
  };

  const peopleNamesById = new Map<string, string>(
    (peopleRes.data ?? []).map((p) => [
      p.id as string,
      p.name as string,
    ]),
  );

  const prompt = buildPulsePrompt(ctx.display_name, inputs, peopleNamesById);
  const { text, usage } = await chat({
    messages: [{ role: "user", content: prompt }],
    system: SYSTEM_PROMPT,
    apiKey: ctx.claude_key,
    maxTokens: 700,
  });

  return { text: text.trim(), usage, model: CLAUDE_MODEL };
}

const SYSTEM_PROMPT = `Du bist ECHO, der persönliche Beziehungs-Assistent.
Du verfasst den wöchentlichen Sonntags-Puls — einen kurzen, ruhigen
Text der dem Nutzer hilft, in der kommenden Woche bewusst seine
Beziehungen zu pflegen.

Format:
- Kein Markdown (kein **, kein *, keine Listen mit Bullet-Points).
  Reine Sätze und Zeilen mit Bindestrich, denn das wird auch
  vorgelesen.
- Auf Deutsch, in zweiter Person ("du").
- Maximal 4-5 kurze Absätze. Keine Wiederholung der Datenliste —
  fasse zusammen, was wirklich relevant ist.
- Konkret und warm, keine Floskeln.

Inhalts-Reihenfolge:
1. Eine Zeile Eröffnung mit dem Wochenrhythmus.
2. Stale-Beziehungen: 2-4 Personen mit denen du länger nichts gehört
   hast, mit Tagen.
3. Offene Versprechen / Reminders dieser Woche, mit Person + was.
4. Geburtstage in den nächsten 7 Tagen (falls vorhanden).
5. Optional: ein Satz Beobachtung aus den letzten Interaktionen.`;

function buildPulsePrompt(
  displayName: string,
  inputs: PulseInputs,
  peopleById: Map<string, string>,
): string {
  const lines: string[] = [];
  lines.push(`Wochen-Snapshot für ${displayName}:`);
  lines.push("");

  if (inputs.recentInteractions.length === 0) {
    lines.push("Letzte 7 Tage: keine Interaktionen geloggt.");
  } else {
    lines.push("Letzte 7 Tage Interaktionen:");
    for (const i of inputs.recentInteractions.slice(0, 12)) {
      const personNames = (i.person_ids ?? [])
        .map((pid) => peopleById.get(pid))
        .filter(Boolean)
        .join(", ");
      const occurred = i.occurred_at.slice(0, 10);
      lines.push(
        `- ${occurred} ${i.type} mit ${personNames || "?"}: ${i.summary ?? ""}`,
      );
    }
  }

  lines.push("");
  if (inputs.stalePeople.length === 0) {
    lines.push("Keine überfälligen Personen.");
  } else {
    lines.push("Überfällige Beziehungen (über cadence × 1.5):");
    for (const p of inputs.stalePeople) {
      lines.push(
        `- ${p.name}: ${p.days_since} Tage her, sonst alle ${p.cadence}`,
      );
    }
  }

  lines.push("");
  if (inputs.openReminders.length === 0 && inputs.openTodos.length === 0) {
    lines.push("Inbox ist leer.");
  } else {
    lines.push(
      `Offen: ${inputs.openReminders.length} Reminders, ${inputs.openTodos.length} Todos`,
    );
    for (const r of inputs.openReminders.slice(0, 8)) {
      const personName = r.person_id
        ? peopleById.get(r.person_id)
        : null;
      lines.push(
        `- Reminder: ${r.text} (${r.remind_at.slice(0, 10)}${
          personName ? ` – ${personName}` : ""
        })`,
      );
    }
    for (const t of inputs.openTodos.slice(0, 6)) {
      const personName = t.person_id
        ? peopleById.get(t.person_id)
        : null;
      lines.push(
        `- Todo: ${t.text}${
          t.due_date ? ` (${t.due_date})` : ""
        }${personName ? ` – ${personName}` : ""}`,
      );
    }
  }

  lines.push("");
  if (inputs.upcomingBirthdays.length === 0) {
    lines.push("Keine Geburtstage in den nächsten 7 Tagen.");
  } else {
    lines.push("Geburtstage diese Woche:");
    for (const b of inputs.upcomingBirthdays) {
      lines.push(
        `- ${b.name} in ${b.days_until === 0 ? "heute" : `${b.days_until} Tagen`} (${b.date.slice(5)})`,
      );
    }
  }

  return lines.join("\n");
}

function nextOccurrenceWithinWeek(iso: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const year = now.getFullYear();
  let next = new Date(year, month, day);
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    next = new Date(year + 1, month, day);
  }
  const days = Math.floor(
    (next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0 || days > 7) return null;
  return days;
}
