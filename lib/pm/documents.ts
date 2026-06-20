import { createClient } from "@/lib/supabase/server";
import type { PmDocument } from "./types";

export async function listDocuments(
  departmentId: string,
): Promise<PmDocument[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_documents")
    .select("*")
    .eq("department_id", departmentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as PmDocument[];
}

// Knowledge fed to the AI briefing agent: the department charter plus the
// most recent documents/transcripts, trimmed so we never blow the context
// budget. Returns a single plain-text block.
export async function buildDepartmentKnowledge(
  departmentId: string,
  aiContext: string | null,
  maxDocs = 8,
  maxCharsPerDoc = 1500,
): Promise<string> {
  const docs = await listDocuments(departmentId);
  const parts: string[] = [];
  if (aiContext && aiContext.trim()) {
    parts.push(`# Abteilungs-Kontext\n${aiContext.trim()}`);
  }
  for (const doc of docs.slice(0, maxDocs)) {
    if (!doc.content) continue;
    const body =
      doc.content.length > maxCharsPerDoc
        ? `${doc.content.slice(0, maxCharsPerDoc)}…`
        : doc.content;
    parts.push(`# ${doc.title} (${doc.kind})\n${body}`);
  }
  return parts.join("\n\n---\n\n");
}
