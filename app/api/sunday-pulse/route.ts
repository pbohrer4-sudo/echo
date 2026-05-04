import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/user-context";
import { generatePulse } from "@/lib/pulse";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const text = await generatePulse(ctx);
    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "pulse failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
