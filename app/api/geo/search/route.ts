// Geo-Search-Proxy für die Location-Autocomplete.
//
// Wir gehen NIE direkt aus dem Browser nach Nominatim:
//   - CORS-Schutz (Nominatim sendet kein Access-Control-Allow-Origin)
//   - User-Agent-Verantwortung beim Server, einheitlich identifizierbar
//   - Rate-Limit (1 req/sec) wird zentral durchgesetzt, nicht pro Client
//   - Caching wirkt nur wenn alle Anfragen durch den gleichen Server gehen
//
// Auth-Check stellt sicher, dass das Proxy nicht von Unauthenticated
// abgerufen werden kann (sonst hätten wir freien IP-Bypass für Bots).

import { NextResponse } from "next/server";
import { searchPlaces } from "@/lib/geo";
import { getUserContext } from "@/lib/user-context";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Per-User Rate-Limit auf das Proxy selbst. Verhindert dass ein Browser
  // mit kaputtem Debounce hunderte Anfragen sendet.
  const rl = await rateLimit({
    userId: ctx.user_id,
    key: "geo_search",
    ...LIMITS.address_search, // 60/min reicht für tippe-debounced UI
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Zu viele Anfragen" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(
    Math.max(Number(limitRaw) > 0 ? Number(limitRaw) : 5, 1),
    10,
  );

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchPlaces(q, limit);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[geo-proxy] failed", err);
    return NextResponse.json({ error: "geo lookup failed" }, { status: 500 });
  }
}
