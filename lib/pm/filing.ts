import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL } from "@/lib/claude";
import { createClient } from "@/lib/supabase/server";
import { getDepartmentById } from "./departments";
import { isAiEnabledForDocument } from "./projects";
import { listFolders, type SharePointFolder } from "./sharepoint";

// AI agent that files a new document into the SharePoint structure: given
// the document's content and the existing folder tree, it proposes the best
// destination folder and a clean, context-derived file name. The result is
// stored as a SUGGESTION on the document — the user confirms before
// anything is filed (CLAUDE.md AI rule #1).

export interface FilingSuggestion {
  folder_path: string;
  file_name: string;
  reasoning: string;
  alternatives: string[];
}

const FILING_TOOL: Anthropic.Tool = {
  name: "suggest_filing",
  description:
    "Schlägt den passenden SharePoint-Ordner und einen sauberen Dateinamen für ein neues Dokument vor.",
  input_schema: {
    type: "object",
    properties: {
      folder_path: {
        type: "string",
        description:
          "Exakter Pfad eines EXISTIERENDEN Ordners aus der Liste, in den die Datei am besten passt.",
      },
      file_name: {
        type: "string",
        description:
          "Sauberer, sprechender Dateiname inkl. Datum falls sinnvoll (z.B. '2026-06-18 Kampagnenbriefing Messe Koeln'). Ohne Dateiendung. Korrekte Umlaute.",
      },
      reasoning: {
        type: "string",
        description: "Kurze Begründung, warum dieser Ordner und Name passen.",
      },
      alternatives: {
        type: "array",
        items: { type: "string" },
        description:
          "Bis zu zwei alternative Ordnerpfade aus der Liste, falls die Wahl unsicher ist.",
      },
    },
    required: ["folder_path", "file_name", "reasoning", "alternatives"],
  },
};

function buildPrompt(
  doc: { title: string; kind: string; source: string | null; content: string | null },
  folders: SharePointFolder[],
): string {
  const folderList = folders.map((f) => `- ${f.path}`).join("\n");
  return [
    "Neues Dokument, das in die SharePoint-Struktur der Abteilung einsortiert werden soll.",
    "",
    `Titel: ${doc.title}`,
    `Typ: ${doc.kind}`,
    doc.source ? `Quelle: ${doc.source}` : "Quelle: (keine)",
    "",
    "Inhalt (Auszug):",
    doc.content ? doc.content.slice(0, 3000) : "(kein Inhalt)",
    "",
    "Vorhandene Ordner (wähle den Zielordner ausschließlich aus dieser Liste):",
    folderList || "(keine Ordner vorhanden)",
  ].join("\n");
}

export async function suggestFiling(opts: {
  title: string;
  kind: string;
  source: string | null;
  content: string | null;
  folders: SharePointFolder[];
  apiKey?: string | null;
}): Promise<FilingSuggestion> {
  const client = new Anthropic({
    apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY!,
  });

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 600,
    system:
      "Du bist ein Dokumenten-Ablage-Assistent. Du ordnest Dokumente in eine bestehende SharePoint-Ordnerstruktur ein und vergibst sprechende Dateinamen. Wähle den Zielordner immer aus der vorgegebenen Liste. Antworte ausschließlich über das Tool. Deutsch, korrekte Umlaute.",
    tools: [FILING_TOOL],
    tool_choice: { type: "tool", name: "suggest_filing" },
    messages: [
      {
        role: "user",
        content: buildPrompt(
          { title: opts.title, kind: opts.kind, source: opts.source, content: opts.content },
          opts.folders,
        ),
      },
    ],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === "suggest_filing",
  );
  if (!toolUse) throw new Error("KI hat keinen Ablagevorschlag geliefert.");

  const input = toolUse.input as Record<string, unknown>;
  return {
    folder_path: String(input.folder_path ?? ""),
    file_name: String(input.file_name ?? opts.title),
    reasoning: String(input.reasoning ?? ""),
    alternatives: Array.isArray(input.alternatives)
      ? input.alternatives.map((a) => String(a))
      : [],
  };
}

// Orchestrator: load the document + its department's folder tree, ask the
// model, and persist the suggestion (filing_status → 'suggested'). Shared by
// the document-create action and any re-run trigger. Best-effort caller
// should swallow errors so document creation never fails on the AI step.
export async function suggestFilingForDocument(documentId: string): Promise<void> {
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("pm_documents")
    .select("id, department_id, project_id, ai_mode, title, kind, source, content")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return;

  // Respect the per-document / per-project / workspace AI override.
  if (!(await isAiEnabledForDocument(doc))) return;

  const department = await getDepartmentById(doc.department_id);
  if (!department) return;

  const folders = await listFolders(doc.department_id);
  if (folders.length === 0) return; // nothing to file into yet

  const suggestion = await suggestFiling({
    title: doc.title,
    kind: doc.kind,
    source: doc.source,
    content: doc.content,
    folders,
  });

  await supabase
    .from("pm_documents")
    .update({
      suggested_folder_path: suggestion.folder_path,
      suggested_name: suggestion.file_name,
      filing_reasoning: suggestion.reasoning,
      filing_status: "suggested",
    })
    .eq("id", documentId);
}
