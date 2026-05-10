import { NextResponse } from "next/server";
import {
  listSmartSuggestions,
  commitSmartSuggestion,
} from "@/lib/smart-reminders";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const suggestions = await listSmartSuggestions();
  return NextResponse.json({ suggestions });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const result = await commitSmartSuggestion(body);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "commit failed" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
