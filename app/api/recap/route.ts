import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/user-context";
import { generateRecap } from "@/lib/recap";

export const runtime = "nodejs";
export const maxDuration = 30;

interface RecapBody {
  period: "month" | "year";
  // 1-12 for month, 4-digit year
  year?: number;
  month?: number;
}

export async function POST(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: RecapBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const now = new Date();
  let from: Date;
  let to: Date;
  let periodLabel: string;

  if (body.period === "year") {
    const year = body.year ?? now.getFullYear();
    from = new Date(year, 0, 1, 0, 0, 0);
    to = new Date(year, 11, 31, 23, 59, 59);
    periodLabel = `Jahr ${year}`;
  } else {
    const year = body.year ?? now.getFullYear();
    const month = body.month ?? now.getMonth() + 1;
    from = new Date(year, month - 1, 1, 0, 0, 0);
    to = new Date(year, month, 0, 23, 59, 59);
    periodLabel = from.toLocaleDateString("de-DE", {
      month: "long",
      year: "numeric",
    });
  }

  try {
    const result = await generateRecap({ ctx, from, to, periodLabel });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "recap failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
