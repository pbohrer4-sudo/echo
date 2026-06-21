import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { mapAnthropicError } from "@/lib/anthropic-error";
import { runBriefingForTask } from "@/lib/pm/briefing";

export const runtime = "nodejs";
export const maxDuration = 30;

interface BriefingRequest {
  taskId: string;
}

// POST /api/pm/briefing — runs the AI agent over an inbox request and
// stores a PENDING briefing suggestion. Never mutates the task itself; a
// human accepts the suggested response from the UI. Usable by external
// automation (e.g. a webhook that fires when a request lands).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const limit = await rateLimit({
    userId: user.id,
    key: "ai_pm_briefing",
    ...LIMITS.ai_pm_briefing,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Zu viele Anfragen, bitte kurz warten." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: BriefingRequest;
  try {
    body = (await req.json()) as BriefingRequest;
  } catch {
    return NextResponse.json({ error: "Ungültiger Body" }, { status: 400 });
  }
  if (!body.taskId) {
    return NextResponse.json({ error: "taskId fehlt" }, { status: 400 });
  }

  try {
    const { briefingId } = await runBriefingForTask(body.taskId);
    return NextResponse.json({ ok: true, briefingId });
  } catch (err) {
    const mapped = mapAnthropicError(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
