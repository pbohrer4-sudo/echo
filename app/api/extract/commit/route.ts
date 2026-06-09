import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ToolCall } from "@/lib/tools";
import { CommitError, commitToolCalls } from "@/lib/extract-commit";

export const runtime = "nodejs";

// Browser voice flow: the user has confirmed the extracted tool calls in
// the UI, we persist them. Auth is the Supabase session cookie. The actual
// write logic lives in lib/extract-commit.ts so the cookie-less Siri
// capture endpoint (app/api/siri/capture) can share it verbatim.

interface CommitRequest {
  toolCalls: ToolCall[];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: CommitRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const { commits, created_person_ids } = await commitToolCalls({
      supabase,
      userId: user.id,
      toolCalls: body.toolCalls,
    });
    revalidatePath("/people");
    revalidatePath("/inbox");
    return NextResponse.json({ ok: true, commits, created_person_ids });
  } catch (err) {
    if (err instanceof CommitError) {
      return NextResponse.json(
        { error: err.message, commits: err.commits },
        { status: 500 },
      );
    }
    const message = err instanceof Error ? err.message : "commit failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
