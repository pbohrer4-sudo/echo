import { NextResponse } from "next/server";
import { search } from "@/lib/search";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const results = await search(q);
  return NextResponse.json(results);
}
