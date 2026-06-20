import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/claude";
import { createClient } from "@/lib/supabase/server";
import { getDepartmentById } from "./departments";
import { buildDepartmentKnowledge } from "./documents";
import { getTask } from "./tasks";
import type { PmDepartment, PmTask } from "./types";

// Structured output the AI agent produces for a cross-department request.
// This is written to pm_task_briefings as a PENDING suggestion — never
// auto-applied (CLAUDE.md AI rule #1: always a human-in-the-loop step).
export interface GeneratedBriefing {
  summary: string;
  briefing: string;
  suggested_response: string;
  estimated_hours: number | null;
  open_questions: string[];
  reasoning: string;
}

const BRIEFING_TOOL: Anthropic.Tool = {
  name: "provide_briefing",
  description:
    "Liefert das strukturierte Briefing und einen Antwortentwurf für eine eingehende abteilungsübergreifende Anfrage.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "Ein Satz, der die Anfrage auf den Punkt bringt.",
      },
      briefing: {
        type: "string",
        description:
          "Kurzes internes Briefing für die ausführende Abteilung (Markdown). Ziel, Kontext, konkrete Schritte/Annahmen, benötigte Inputs.",
      },
      suggested_response: {
        type: "string",
        description:
          "Höflicher Antwortentwurf an die anfragende Abteilung (Deutsch, 'Sie'-Form). Bestätigt Verständnis, nennt Aufwand/Zeitrahmen und offene Punkte.",
      },
      estimated_hours: {
        type: ["number", "null"],
        description:
          "Realistische Aufwandsschätzung in Stunden basierend auf dem Abteilungswissen. null wenn nicht seriös schätzbar.",
      },
      open_questions: {
        type: "array",
        items: { type: "string" },
        description: "Offene Fragen, die vor Start geklärt werden müssen.",
      },
      reasoning: {
        type: "string",
        description:
          "Kurze Begründung der Schätzung und des Vorgehens (Transparenz für den Menschen).",
      },
    },
    required: ["summary", "briefing", "suggested_response", "open_questions", "reasoning"],
  },
};

function buildSystemPrompt(owner: PmDepartment): string {
  return [
    `Du bist der KI-Agent der Abteilung „${owner.name}" in einem internen`,
    "Projektmanagement-Tool. Eine andere Abteilung hat eine Anfrage in den",
    "Posteingang dieser Abteilung gelegt. Deine Aufgabe: auf Basis des",
    "Abteilungswissens ein erstes Briefing erstellen und einen Antwortentwurf",
    "formulieren, damit das Team schnell und fundiert reagieren kann.",
    "",
    "Regeln:",
    "- Antworte ausschließlich über das Tool `provide_briefing`.",
    "- Schreibe auf Deutsch, höflich, in der Sie-Form. Korrekte Umlaute (ä, ö, ü, ß).",
    "- Keine langen Gedankenstriche in der Antwort an die andere Abteilung.",
    "- Erfinde keine Fakten. Wenn Wissen fehlt, formuliere es als offene Frage.",
    "- Sei konkret bei Aufwand und nächsten Schritten, aber ehrlich über Unsicherheit.",
  ].join("\n");
}

function buildUserPrompt(
  task: PmTask,
  requester: PmDepartment | null,
  knowledge: string,
): string {
  const lines = [
    `Anfragende Abteilung: ${requester?.name ?? "Unbekannt"}`,
    `Titel: ${task.title}`,
    task.description ? `Beschreibung:\n${task.description}` : "Beschreibung: (keine)",
    task.effort_estimate_hours != null
      ? `Vom Anfragenden geschätzter Aufwand: ${task.effort_estimate_hours} h`
      : "Vom Anfragenden geschätzter Aufwand: (keiner)",
    task.due_date ? `Gewünschtes Datum: ${task.due_date}` : "Gewünschtes Datum: (keines)",
    `Priorität: ${task.priority}`,
    "",
    "## Wissen der ausführenden Abteilung",
    knowledge.trim() ? knowledge : "(Noch kein hinterlegtes Abteilungswissen.)",
  ];
  return lines.join("\n");
}

export async function generateBriefing(opts: {
  task: PmTask;
  ownerDepartment: PmDepartment;
  requesterDepartment: PmDepartment | null;
  knowledge: string;
  apiKey?: string | null;
}): Promise<{ briefing: GeneratedBriefing; model: string }> {
  const { task, ownerDepartment, requesterDepartment, knowledge, apiKey } = opts;
  const client = new Anthropic({
    apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY!,
  });

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system: buildSystemPrompt(ownerDepartment),
    tools: [BRIEFING_TOOL],
    tool_choice: { type: "tool", name: "provide_briefing" },
    messages: [
      {
        role: "user",
        content: buildUserPrompt(task, requesterDepartment, knowledge),
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === "provide_briefing",
  );
  if (!toolUse) {
    throw new Error("KI hat kein strukturiertes Briefing geliefert.");
  }

  const input = toolUse.input as Record<string, unknown>;
  const briefing: GeneratedBriefing = {
    summary: String(input.summary ?? ""),
    briefing: String(input.briefing ?? ""),
    suggested_response: String(input.suggested_response ?? ""),
    estimated_hours:
      typeof input.estimated_hours === "number" ? input.estimated_hours : null,
    open_questions: Array.isArray(input.open_questions)
      ? input.open_questions.map((q) => String(q))
      : [],
    reasoning: String(input.reasoning ?? ""),
  };

  return { briefing, model: CLAUDE_MODEL };
}

// Orchestrates a full briefing run for an inbox task: loads context, calls
// the model, and persists a PENDING suggestion plus an audit comment.
// Shared by the API route and the in-app server action. Throws on any
// failure (caller maps to an HTTP status / UI error). RLS scopes every
// read and write to the caller's workspace.
export async function runBriefingForTask(
  taskId: string,
): Promise<{ briefingId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet");

  const task = await getTask(taskId);
  if (!task) throw new Error("Aufgabe nicht gefunden");
  if (task.source !== "cross_dept") {
    throw new Error("Briefings gibt es nur für abteilungsübergreifende Anfragen.");
  }

  const ownerDepartment = await getDepartmentById(task.owner_department_id);
  if (!ownerDepartment) throw new Error("Abteilung nicht gefunden");
  const requesterDepartment = task.requester_department_id
    ? await getDepartmentById(task.requester_department_id)
    : null;

  const knowledge = await buildDepartmentKnowledge(
    ownerDepartment.id,
    ownerDepartment.ai_context,
  );

  const { briefing, model } = await generateBriefing({
    task,
    ownerDepartment,
    requesterDepartment,
    knowledge,
  });

  const { data: inserted, error } = await supabase
    .from("pm_task_briefings")
    .insert({
      task_id: task.id,
      workspace_id: task.workspace_id,
      summary: briefing.summary,
      briefing: briefing.briefing,
      suggested_response: briefing.suggested_response,
      estimated_hours: briefing.estimated_hours,
      open_questions: briefing.open_questions,
      reasoning: briefing.reasoning,
      model,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !inserted) {
    throw new Error(error?.message ?? "Briefing konnte nicht gespeichert werden");
  }

  await supabase.from("pm_task_comments").insert({
    task_id: task.id,
    workspace_id: task.workspace_id,
    user_id: user.id,
    body: "KI-Briefing erstellt (wartet auf Bestätigung).",
    is_system: true,
  });

  return { briefingId: inserted.id };
}
