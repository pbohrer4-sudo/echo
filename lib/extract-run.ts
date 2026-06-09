import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CLAUDE_MODEL,
  chatToolResultFollowup,
  chatWithTools,
  type ChatMessage,
} from "@/lib/claude";
import { buildExtractionSystemPrompt } from "@/lib/prompts";
import {
  loadOrganizationsContext,
  loadPeopleContext,
} from "@/lib/llm-people-context";
import { EXTRACTION_TOOLS, type ToolCall } from "@/lib/tools";
import { logAnthropic } from "@/lib/llm-usage";
import { executeQueryPeople } from "@/lib/people-query";
import type { PeopleFilterSpec } from "@/lib/people-filter";

// Shared extraction core for the voice pipeline. Turns a raw transcript
// into Claude tool calls + a spoken reply, loading the user's CRM context
// so the model can resolve names to ids and answer count questions.
//
// Both entry points run this identical logic:
//   - app/api/extract       → cookie session (getUserContext)
//   - app/api/siri/capture   → API token (getUserContextById)
// They differ only in how `supabase`, `userId`, `displayName` and
// `claudeKey` are resolved before calling in.

const PEOPLE_PROMPT_LIMIT = 500;
const ORGS_PROMPT_LIMIT = 200;

export interface ExtractionResult {
  text: string;
  toolCalls: ToolCall[];
}

export async function runExtraction(args: {
  supabase: SupabaseClient;
  userId: string;
  displayName: string;
  claudeKey: string | null;
  transcript: string;
  history?: ChatMessage[];
  // Endpoint label for usage logging ("/api/extract" | "/api/siri/capture").
  endpoint: string;
  // Cookie callers leave this false: RLS scopes the context loaders and the
  // query_people roundtrip works through the session client. Service-role
  // callers (Siri) set it: we pass userId into the loaders to replace RLS,
  // and skip query_people (executeQueryPeople resolves its own cookie
  // client and can't see the user without a session).
  serviceRole?: boolean;
}): Promise<ExtractionResult> {
  const { supabase, userId, displayName, claudeKey, endpoint } = args;
  const scopeUserId = args.serviceRole ? userId : undefined;

  const [people, organizations] = await Promise.all([
    loadPeopleContext(supabase, PEOPLE_PROMPT_LIMIT, scopeUserId),
    loadOrganizationsContext(supabase, ORGS_PROMPT_LIMIT, scopeUserId),
  ]);

  const system = buildExtractionSystemPrompt({
    displayName,
    people,
    organizations,
    now: new Date(),
  });

  const messages: ChatMessage[] = [
    ...(args.history ?? []),
    { role: "user", content: args.transcript },
  ];

  const startMs = Date.now();
  const initial = await chatWithTools({
    messages,
    system,
    tools: EXTRACTION_TOOLS,
    apiKey: claudeKey,
  });
  let { text } = initial;
  const { toolCalls, rawContent, usage } = initial;
  void logAnthropic({
    supabase,
    userId,
    endpoint,
    model: CLAUDE_MODEL,
    usage,
    latencyMs: Date.now() - startMs,
  });

  // query_people roundtrip: run the filter server-side and feed the counts
  // back so Claude can phrase a concrete spoken answer. Skipped for
  // service-role callers since executeQueryPeople needs a session client.
  const queryCalls = args.serviceRole
    ? []
    : toolCalls.filter((c) => c.name === "query_people");
  if (queryCalls.length > 0) {
    const results = await Promise.all(
      queryCalls.map(async (c) => {
        const spec = c.input as PeopleFilterSpec;
        const res = await executeQueryPeople(spec);
        return {
          tool_use_id: c.id,
          content: JSON.stringify({
            count: res.count,
            sample_names: res.sample,
            total_people: res.total_people,
            filter_summary: res.filter_summary,
            instruction:
              "Antworte in EINEM kurzen deutschen Satz mit Zahl + bis zu 2-3 Sample-Namen. Beispiel: '47 Personen in München, darunter Mara und Tobias.' Wenn count=0: 'Keine Treffer für [filter_summary].'",
          }),
        };
      }),
    );
    const followupStart = Date.now();
    const followup = await chatToolResultFollowup({
      messages,
      system,
      assistantContent: rawContent,
      toolResults: results,
      tools: EXTRACTION_TOOLS,
      apiKey: claudeKey,
    });
    void logAnthropic({
      supabase,
      userId,
      endpoint: `${endpoint}:followup`,
      model: CLAUDE_MODEL,
      usage: followup.usage,
      latencyMs: Date.now() - followupStart,
    });
    text = followup.text || text;
  }

  // Enrich update_person calls with the resolved person name so the
  // confirmation UI / spoken summary can name who's being updated.
  const peopleMap = new Map<string, string>(people.map((p) => [p.id, p.name]));
  const enrichedCalls = toolCalls.map((c) => {
    if (c.name !== "update_person") return c;
    const id = (c.input as { id?: unknown }).id;
    if (typeof id !== "string") return c;
    const name = peopleMap.get(id);
    if (!name) return c;
    return { ...c, input: { ...c.input, _person_name: name } };
  });

  return { text, toolCalls: enrichedCalls };
}
