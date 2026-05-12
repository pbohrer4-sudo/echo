import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/user-context";
import { chatForTask } from "@/lib/ai";
import { listCadenceRows } from "@/lib/cadence";

// Smart Reminders: AI-generated nudges for relationships that are
// drifting or due-soon, using the existing cadence model as the
// trigger and the most recent interaction as context. Output is a
// list of suggestions the user can accept (creates a row in
// reminders) or dismiss.
//
// Stays read-only on the DB until the user acts — no auto-write —
// because Patrick was clear about not wanting ECHO to do things
// without his consent.

export interface SmartSuggestion {
  person_id: string;
  person_name: string;
  reminder_type: "check-in" | "promise" | "custom";
  text: string;
  remind_at: string; // ISO 8601, default = now + 2 days
  reason: string; // why this was suggested, shown to the user
  daysSince: number | null;
}

interface AiReply {
  suggestions: Array<{
    person_id: string;
    text: string;
    reminder_type: "check-in" | "promise" | "custom";
    remind_at_offset_days: number;
    reason: string;
  }>;
}

const MAX_CANDIDATES = 8;

export async function listSmartSuggestions(): Promise<SmartSuggestion[]> {
  const ctx = await getUserContext();
  if (!ctx) return [];

  const cadenceRows = await listCadenceRows();

  // Only consider drifting + due-soon. on-rhythm is fine, no-contact
  // gets nagged elsewhere, no-cadence is opt-out by definition.
  const candidates = cadenceRows
    .filter((r) => r.bucket === "drifting" || r.bucket === "due-soon")
    .sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0))
    .slice(0, MAX_CANDIDATES);

  if (candidates.length === 0) return [];

  // Pull the latest interaction summary for each candidate so the
  // model has fresh context to write a reminder that references
  // something specific instead of "check in mit Lukas" generic.
  const supabase = await createClient();
  const personIds = candidates.map((c) => c.person.id);
  const { data: latest } = await supabase
    .from("interactions")
    .select("person_id, summary, occurred_at, type")
    .in("person_id", personIds)
    .order("occurred_at", { ascending: false })
    .limit(personIds.length * 3);

  const latestByPerson = new Map<string, { summary: string; type: string }>();
  for (const row of latest ?? []) {
    if (!latestByPerson.has(row.person_id)) {
      latestByPerson.set(row.person_id, {
        summary: row.summary ?? "",
        type: row.type ?? "interaction",
      });
    }
  }

  const lines = candidates.map((c) => {
    const last = latestByPerson.get(c.person.id);
    return `- ${c.person.id} | ${c.person.name}${
      c.person.company ? ` (${c.person.company})` : ""
    } | ${c.daysSince ?? "?"} Tage her | Soll ${
      c.person.expected_cadence_days ?? "?"
    }d${last ? ` | letzter ${last.type}: ${last.summary.slice(0, 120)}` : ""}`;
  });

  const system = `Du schlägst Erinnerungs-Aktionen für ein persönliches CRM vor.

Eingabe: Liste von Personen, die seit zu vielen Tagen keinen Kontakt hatten.
Aufgabe: Pro Person max. eine konkrete Erinnerung im Format JSON.

Regeln:
- Beziehe dich auf die letzte Interaktion, falls vorhanden ("frag wegen Kaffee
  Vorschlag" statt "melde dich").
- reminder_type: "check-in" für reine Beziehungspflege, "promise" wenn die
  letzte Interaktion eine offene Zusage hatte, "custom" für alles andere.
- remind_at_offset_days: 1 bis 7. Drifter mit hoher Tage-Zahl nach 1-2 Tagen,
  due-soon nach 3-5.
- text: max 80 Zeichen, präzise, deutsch.
- reason: kurz, max 60 Zeichen, warum das jetzt sinnvoll ist.

Antworte ausschließlich mit JSON nach diesem Schema:
{ "suggestions": [{"person_id": "uuid", "text": "...", "reminder_type": "...",
  "remind_at_offset_days": N, "reason": "..."}] }
`;

  const user = `Personen:\n${lines.join("\n")}`;

  let parsed: AiReply | null = null;
  try {
    const { text: raw } = await chatForTask({
      ctx,
      task: "extract", // reuses the user's preferred extraction model
      messages: [{ role: "user", content: user }],
      system,
      maxTokens: 2000,
    });
    parsed = extractJson<AiReply>(raw);
  } catch (err) {
    console.error("[smart-reminders] AI call failed", err);
    return [];
  }

  if (!parsed?.suggestions) return [];

  const out: SmartSuggestion[] = [];
  for (const s of parsed.suggestions) {
    const candidate = candidates.find((c) => c.person.id === s.person_id);
    if (!candidate) continue;
    const offset = Math.max(
      1,
      Math.min(14, Number(s.remind_at_offset_days) || 2),
    );
    const remindAt = new Date(Date.now() + offset * 86400_000).toISOString();
    out.push({
      person_id: candidate.person.id,
      person_name: candidate.person.name,
      reminder_type: s.reminder_type ?? "check-in",
      text: (s.text ?? "").slice(0, 200),
      remind_at: remindAt,
      reason: (s.reason ?? "").slice(0, 200),
      daysSince: candidate.daysSince,
    });
  }
  return out;
}

// Extract the first JSON object from an LLM response, tolerating
// surrounding prose / markdown fences. Returns null on parse failure.
function extractJson<T>(raw: string): T | null {
  if (!raw) return null;
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

// Commit a single suggestion as a real reminder row.
export async function commitSmartSuggestion(
  s: Pick<
    SmartSuggestion,
    "person_id" | "reminder_type" | "text" | "remind_at"
  >,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase.from("reminders").insert({
    user_id: ctx.user_id,
    person_id: s.person_id,
    type: s.reminder_type,
    text: s.text,
    remind_at: s.remind_at,
    status: "pending",
    source: "ai-generated",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
