// Generiert 1-2 kontext-sensitive CTA-Vorschläge pro Reminder.
// Ein einziger LLM-Call deckt alle übergebenen Reminders ab — das
// halbiert die Latenz gegenüber pro-Reminder-Calls und nutzt einen
// gecached Prefix-Prompt. Antwort-Schema ist strikt JSON über ein
// Tool-Use damit Parsing nicht halluziniert.

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/claude";
import { getUserContext } from "@/lib/user-context";
import { createClient } from "@/lib/supabase/server";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { mapAnthropicError } from "@/lib/anthropic-error";
import { logAnthropic } from "@/lib/llm-usage";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ReminderItem {
  id: string;
  text: string;
  type: string;
  recurrence: string;
  remind_at: string;
  person_id: string | null;
}

interface RequestBody {
  reminder_ids: string[];
}

interface CtaResult {
  ctas: Record<string, string[]>;
}

const TOOL: Anthropic.Tool = {
  name: "submit_ctas",
  description:
    "Liefere für JEDE übergebene Reminder-ID 1 bis 2 prägnante CTA-Vorschläge (Call-to-Action). Jeder Vorschlag ist eine einzige, knappe deutsche Frage in IMPERATIV-Du, max 80 Zeichen, mit konkretem nächsten Schritt (z.B. 'Blumen finden?', 'Buchempfehlungen recherchieren?', 'Restaurant für Dinner buchen?'). Berücksichtige den Reminder-Type (birthday/promise/check-in/custom), den Anlass (Hochzeitstag / Geburtstag / etc), und falls gegeben den Personen-Kontext (Gifts / Tags / Passions). Keine Floskeln, keine generischen 'Erinnern lassen?'-Vorschläge.",
  input_schema: {
    type: "object",
    properties: {
      ctas: {
        type: "object",
        description:
          "Map von Reminder-UUID → Array von 1-2 CTA-Strings. JEDE UUID aus der Eingabe muss als Key vorhanden sein.",
        additionalProperties: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    required: ["ctas"],
  },
};

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Recyclen das ai_chat-Bucket — dieser Endpoint ist genauso teuer und
  // genauso freiwillig wie Chat.
  const rl = await rateLimit({
    userId: ctx.user_id,
    key: "ai_chat",
    ...LIMITS.ai_chat,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Zu viele Anfragen — kurz warten." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const ids = Array.isArray(body.reminder_ids)
    ? body.reminder_ids.filter((v): v is string => typeof v === "string")
    : [];
  if (ids.length === 0) {
    return NextResponse.json<CtaResult>({ ctas: {} });
  }

  const supabase = await createClient();
  const { data: remRows, error: remErr } = await supabase
    .from("reminders")
    .select("id, text, type, recurrence, remind_at, person_id")
    .in("id", ids)
    .eq("status", "pending");
  if (remErr) {
    return NextResponse.json({ error: remErr.message }, { status: 500 });
  }

  const reminders = (remRows ?? []) as ReminderItem[];
  if (reminders.length === 0) {
    return NextResponse.json<CtaResult>({ ctas: {} });
  }

  // Personen-Kontext nur für die referenzierten Personen — kleiner als
  // der volle Voice-Context, reicht für CTA-Vorschläge aus.
  const personIds = Array.from(
    new Set(
      reminders
        .map((r) => r.person_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const peopleMap = new Map<
    string,
    { name: string; gift_idea: string | null; tags: string[] }
  >();
  if (personIds.length > 0) {
    const { data: peopleRows } = await supabase
      .from("people")
      .select("id, name, gift_idea")
      .in("id", personIds)
      .is("deleted_at", null);
    const tagRowsRes = await supabase
      .from("person_tags")
      .select("person_id, tags(name)")
      .in("person_id", personIds);
    const tagsByPerson = new Map<string, string[]>();
    type TagRow = { person_id: string; tags: { name: string } | null };
    for (const row of (tagRowsRes.data as TagRow[] | null) ?? []) {
      if (!row.tags) continue;
      const arr = tagsByPerson.get(row.person_id) ?? [];
      arr.push(row.tags.name);
      tagsByPerson.set(row.person_id, arr);
    }
    for (const p of (peopleRows ?? []) as {
      id: string;
      name: string;
      gift_idea: string | null;
    }[]) {
      peopleMap.set(p.id, {
        name: p.name,
        gift_idea: p.gift_idea,
        tags: (tagsByPerson.get(p.id) ?? []).slice(0, 6),
      });
    }
  }

  const lines = reminders.map((r) => {
    const person = r.person_id ? peopleMap.get(r.person_id) : null;
    const personLine = person
      ? `, Person='${person.name}'${person.gift_idea ? `, gifts='${person.gift_idea}'` : ""}${person.tags.length ? `, tags=[${person.tags.join(", ")}]` : ""}`
      : "";
    return `- id=${r.id} type=${r.type} recurrence=${r.recurrence} fällig=${r.remind_at.slice(0, 10)}${personLine} text='${r.text}'`;
  });

  const system = `Du bist ECHO, ein knapper deutscher Beziehungs-Assistent. Du generierst CTA-Vorschläge für Reminders — pro Reminder 1-2 sehr konkrete, sofort umsetzbare nächste-Schritt-Fragen. Beispiele:

- Reminder 'Hochzeitstag · Mirjam' → ['Blumen für Mirjam finden?', 'Tischreservierung im Lieblingsrestaurant buchen?']
- Reminder 'Geburtstag · Tim' → ['Geschenkidee finden basierend auf seinen Hobbys?', 'Glückwunsch-Nachricht entwerfen?']
- Reminder 'Kind von Lisa geboren' → ['Best-Of-Geschenke für Babys recherchieren?', 'Karte zum Glückwunsch schreiben?']
- Reminder 'Check-in mit Sebastian' → ['Letzte Themen zusammenfassen?', 'Termin-Vorschlag in 2 Wochen schicken?']
- Reminder 'Pricing-Pitch an Marvin' → ['Pitchdeck nochmal querchecken?', 'Folge-Termin anfragen?']

Antworte AUSSCHLIESSLICH via submit_ctas-Tool. Pro Reminder maximal 2 Vorschläge. Jeder Vorschlag ist eine einzelne deutsche Frage in Du-Form, max 80 Zeichen.`;

  const user = `Reminders:\n${lines.join("\n")}`;

  const client =
    ctx.claude_key
      ? new Anthropic({ apiKey: ctx.claude_key })
      : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const startMs = Date.now();
  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 800,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "submit_ctas" },
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: user }],
    });
    void logAnthropic({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/reminders/ctas",
      model: CLAUDE_MODEL,
      usage: {
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
      },
      latencyMs: Date.now() - startMs,
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolUse) {
      return NextResponse.json<CtaResult>({ ctas: {} });
    }

    const input = toolUse.input as { ctas?: Record<string, unknown> };
    const out: Record<string, string[]> = {};
    if (input.ctas && typeof input.ctas === "object") {
      for (const id of ids) {
        const raw = (input.ctas as Record<string, unknown>)[id];
        if (Array.isArray(raw)) {
          out[id] = raw
            .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
            .slice(0, 2)
            .map((s) => s.trim());
        }
      }
    }
    return NextResponse.json<CtaResult>({ ctas: out });
  } catch (err) {
    void logAnthropic({
      supabase,
      userId: ctx.user_id,
      endpoint: "/api/reminders/ctas",
      model: CLAUDE_MODEL,
      usage: null,
      latencyMs: Date.now() - startMs,
      status: "error",
    });
    const { status, message } = mapAnthropicError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
