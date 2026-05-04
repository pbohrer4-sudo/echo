import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/user-context";

export const runtime = "nodejs";

interface NominatimAddress {
  road?: string;
  house_number?: string;
  postcode?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  state?: string;
  country?: string;
}

interface NominatimResult {
  display_name: string;
  address?: NominatimAddress;
}

// Proxies OpenStreetMap Nominatim. Free, no API key, but requires a
// proper User-Agent and ≤1 request/sec. We auth-gate so the route can't
// be hammered by anonymous traffic.
export async function GET(request: Request) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 4) return NextResponse.json({ results: [] });

  const params = new URLSearchParams({
    q,
    format: "json",
    addressdetails: "1",
    limit: "5",
    "accept-language": "de,en",
  });

  try {
    const upstream = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      {
        headers: {
          "User-Agent": "ECHO-Personal-CRM (github.com/pbohrer4-sudo/echo)",
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Nominatim ${upstream.status}` },
        { status: 502 },
      );
    }

    const data = (await upstream.json()) as NominatimResult[];

    const results = data.map((r) => {
      const a = r.address ?? {};
      const street = [a.road, a.house_number].filter(Boolean).join(" ").trim();
      const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? null;
      return {
        display: r.display_name,
        street: street || null,
        postal_code: a.postcode ?? null,
        city,
        country: a.country ?? null,
      };
    });

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
