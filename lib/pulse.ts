import { createClient } from "@/lib/supabase/server";
import { chat, CLAUDE_MODEL, type AnthropicUsage } from "@/lib/claude";
import type {
  Interaction,
  Reminder,
  Todo,
  ImportantDate,
} from "@/lib/types";
import type { UserContext } from "@/lib/user-context";

// ─────────── Strukturierte Pulse-Daten (Re-Design) ────────────
//
// Statt nur einen AI-Fließtext zu liefern, exponieren wir die
// aggregierten Rohdaten als typisierte Sektionen für ein interaktives
// Dashboard. Die UI rendert sie als Karten mit Quick-Actions
// (Draft/Snooze/Erledigt) pro Item. AI-Pulse-Generierung bleibt als
// optionaler Bottom-Block.

export interface PulseStalePerson {
  id: string;
  name: string;
  days_since: number;
  cadence_days: number | null;
  last_contact_at: string | null;
  primary_phone: string | null; // für Quick-Draft via WhatsApp
}

export interface PulseBirthday {
  person_id: string;
  name: string;
  date: string;        // ISO YYYY-MM-DD vom Original-Eintrag
  days_until: number;  // 0 = heute, 7 = in einer Woche
  age_turning: number | null; // wenn Jahr im date steht, sonst null
}

export interface PulseReminder extends Reminder {
  person_name: string | null;
}

export interface PulseTodo extends Todo {
  person_name: string | null;
}

export interface PulseData {
  stalePeople: PulseStalePerson[];
  upcomingBirthdays: PulseBirthday[];
  openReminders: PulseReminder[];
  openTodos: PulseTodo[];
  recentInteractions: Interaction[];
  // Für die optionale AI-Generation — wir geben den Map mit, damit
  // generatePulse nicht erneut alle Personen lädt.
  peopleNamesById: Map<string, string>;
}

export async function listPulseData(): Promise<PulseData> {
  const supabase = await createClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const [intRes, remRes, todoRes, peopleRes, contactsRes] = await Promise.all([
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
        "id, name, last_contact_at, cadence_days, important_dates, next_nudge_at",
      )
      .is("deleted_at", null)
      .eq("is_self", false),
    // V3 (0030): Primary-Phone pro Person via person_contacts —
    // brauchen wir für die Draft-Quick-Action ohne weiteren Round-Trip.
    supabase
      .from("person_contacts")
      .select("person_id, value, is_primary, channel")
      .in("channel", ["phone", "whatsapp"]),
  ]);

  if (intRes.error) throw intRes.error;
  if (remRes.error) throw remRes.error;
  if (todoRes.error) throw todoRes.error;
  if (peopleRes.error) throw peopleRes.error;

  const peopleNamesById = new Map<string, string>(
    (peopleRes.data ?? []).map((p) => [
      p.id as string,
      p.name as string,
    ]),
  );

  // Primary-Phone pro person_id — primary bevorzugt, sonst die erste.
  const phoneByPerson = new Map<string, string>();
  for (const c of (contactsRes.data ?? []) as {
    person_id: string;
    value: string;
    is_primary: boolean;
    channel: string;
  }[]) {
    const existing = phoneByPerson.get(c.person_id);
    if (!existing || c.is_primary) {
      phoneByPerson.set(c.person_id, c.value);
    }
  }

  // Stale: cadence_days gesetzt, last_contact_at gesetzt, älter als
  // cadence × 1.5, plus next_nudge_at darf nicht in der Zukunft liegen
  // (Snooze respektieren!).
  const nowMs = now.getTime();
  const stalePeople: PulseStalePerson[] = (peopleRes.data ?? [])
    .filter((p) => p.cadence_days != null && p.last_contact_at != null)
    .filter((p) => {
      if (!p.next_nudge_at) return true;
      return new Date(p.next_nudge_at as string).getTime() <= nowMs;
    })
    .map((p) => {
      const last = new Date(p.last_contact_at as string);
      const daysSince = Math.floor(
        (nowMs - last.getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        id: p.id as string,
        name: p.name as string,
        days_since: daysSince,
        cadence_days: p.cadence_days as number,
        last_contact_at: p.last_contact_at as string,
        primary_phone: phoneByPerson.get(p.id as string) ?? null,
      };
    })
    .filter(
      (p) => p.days_since > Math.floor((p.cadence_days ?? 30) * 1.5),
    )
    .sort((a, b) => b.days_since - a.days_since);

  // Geburtstage in den nächsten 7 Tagen.
  const upcomingBirthdays: PulseBirthday[] = [];
  for (const p of peopleRes.data ?? []) {
    const dates = (p.important_dates ?? []) as ImportantDate[];
    for (const d of dates) {
      if (d.label.toLowerCase() !== "geburtstag") continue;
      const next = nextOccurrenceWithinWeek(d.date, now);
      if (next === null) continue;
      upcomingBirthdays.push({
        person_id: p.id as string,
        name: p.name as string,
        date: d.date,
        days_until: next,
        age_turning: ageTurning(d.date, now),
      });
    }
  }
  upcomingBirthdays.sort((a, b) => a.days_until - b.days_until);

  const openReminders: PulseReminder[] = ((remRes.data ?? []) as Reminder[]).map(
    (r) => ({
      ...r,
      person_name: r.person_id ? peopleNamesById.get(r.person_id) ?? null : null,
    }),
  );
  const openTodos: PulseTodo[] = ((todoRes.data ?? []) as Todo[]).map((t) => ({
    ...t,
    person_name: t.person_id ? peopleNamesById.get(t.person_id) ?? null : null,
  }));

  return {
    stalePeople,
    upcomingBirthdays,
    openReminders,
    openTodos,
    recentInteractions: (intRes.data ?? []) as Interaction[],
    peopleNamesById,
  };
}

function ageTurning(iso: string, now: Date): number | null {
  // Wenn iso ein vollständiges YYYY-MM-DD ist und das Jahr < aktuelles
  // Jahr — zeig „wird X" basierend auf dem nächsten Geburtstag.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const birthYear = Number(m[1]);
  if (!Number.isFinite(birthYear) || birthYear < 1900) return null;
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  let nextYear = now.getFullYear();
  const nextBday = new Date(nextYear, month, day);
  if (nextBday < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    nextYear += 1;
  }
  return nextYear - birthYear;
}

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
        "id, name, last_contact_at, cadence_days, important_dates",
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
      (p) => p.cadence_days != null && p.last_contact_at != null,
    )
    .map((p) => {
      const last = new Date(p.last_contact_at as string);
      const daysSince = Math.floor(
        (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        name: p.name as string,
        days_since: daysSince,
        cadence: p.cadence_days as number,
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
