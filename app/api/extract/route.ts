import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { chatWithTools, type ChatMessage } from "@/lib/claude";
import { buildExtractionSystemPrompt } from "@/lib/prompts";
import { EXTRACTION_TOOLS } from "@/lib/tools";

export const runtime = "nodejs";

interface ExtractRequest {
  transcript: string;
  history?: ChatMessage[];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: ExtractRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const transcript = body.transcript?.trim();
  if (!transcript) {
    return NextResponse.json({ error: "transcript required" }, { status: 400 });
  }

  const { data: peopleData, error: peopleError } = await supabase
    .from("people")
    .select("id, name, company")
    .is("deleted_at", null);

  if (peopleError) {
    return NextResponse.json(
      { error: `people fetch: ${peopleError.message}` },
      { status: 500 },
    );
  }

  const displayName =
    user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "Patrick";

  const system = buildExtractionSystemPrompt({
    displayName,
    people: peopleData ?? [],
    now: new Date(),
  });

  const messages: ChatMessage[] = [
    ...(body.history ?? []),
    { role: "user", content: transcript },
  ];

  try {
    const { text, toolCalls } = await chatWithTools({
      messages,
      system,
      tools: EXTRACTION_TOOLS,
    });

    // Enrich update_person calls with the resolved person_name so the
    // confirmation card can render "Update Marvin: …" without an extra
    // round-trip from the client.
    const peopleMap = new Map<string, string>(
      (peopleData ?? []).map((p) => [p.id as string, p.name as string]),
    );
    const enrichedCalls = toolCalls.map((c) => {
      if (c.name !== "update_person") return c;
      const id = (c.input as { id?: unknown }).id;
      if (typeof id !== "string") return c;
      const name = peopleMap.get(id);
      if (!name) return c;
      return {
        ...c,
        input: { ...c.input, _person_name: name },
      };
    });

    return NextResponse.json({ text, toolCalls: enrichedCalls });
  } catch (err) {
    const message = err instanceof Error ? err.message : "extract failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
