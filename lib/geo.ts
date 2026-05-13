// OpenStreetMap Nominatim Client.
//
// Server-side Wrapper für die öffentliche Nominatim-Instanz. Drei
// Constraints aus der OSM-Usage-Policy die wir hier einhalten:
//
//   1. Max 1 Request pro Sekunde (global, nicht pro User)
//   2. Identifying User-Agent muss gesetzt sein
//   3. Caching ist Pflicht — wiederholte Queries dürfen nicht raus
//
// Genutzt wird das nur vom /api/geo/search Route-Handler — Browser
// nie direkt anfragen, sonst CORS + IP-Ban-Risiko.

import { APP_CONFIG } from "@/lib/config";
import type { LocationGeo } from "@/lib/types";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

// In-Memory Cache. Im Multi-Process-Deploy (Vercel-Lambda) verteilt
// sich das, aber als Best-Effort-Schutz reicht's. Bei Bedarf später
// per Supabase oder Upstash zentralisieren.
const cache = new Map<string, { value: LocationGeo[]; ts: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const CACHE_MAX_ENTRIES = 500;

// Globaler Sequenzer — Nominatim erlaubt 1 req/sec. Kein Burst, kein
// Buffer. Jeder Aufrufer muss sich anstellen.
let lastFetchAt = 0;
const MIN_GAP_MS = 1100; // kleine Reserve damit clock-skew nicht ban-fähig ist
let pendingChain: Promise<unknown> = Promise.resolve();

function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  // Hänge das fn an die laufende Kette dran damit Aufrufe seriell
  // durchlaufen — kein Parallelismus auf Nominatim erlaubt.
  const next = pendingChain.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, lastFetchAt + MIN_GAP_MS - now);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastFetchAt = Date.now();
    return fn();
  });
  // pendingChain rollt weiter, aber Fehler im Aufrufer-fn bleiben dort.
  pendingChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next as Promise<T>;
}

function cachePut(key: string, value: LocationGeo[]): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Simplest eviction — drop oldest entry by insertion order.
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { value, ts: Date.now() });
}

function cacheGet(key: string): LocationGeo[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

interface NominatimResult {
  place_id: number;
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  display_name: string;
}

/**
 * Suche Orte über Nominatim. Liefert max `limit` strukturierte Treffer.
 * Cache-Hit kostet 0 ms, Cache-Miss kostet bis zu 1.1s Rate-Limit-Wait.
 */
export async function searchPlaces(
  query: string,
  limit = 5,
): Promise<LocationGeo[]> {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return [];

  const cacheKey = `${normalized}::${limit}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("accept-language", "de,en");

  const results = await rateLimited(async () => {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": `${APP_CONFIG.PUBLIC_NAME} Personal CRM (echo-crm)`,
        Accept: "application/json",
      },
      // Next.js fetch-cache deaktivieren — wir cachen selbst.
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[geo] nominatim failed", res.status, await res.text());
      return [];
    }
    return (await res.json()) as NominatimResult[];
  });

  const mapped: LocationGeo[] = results.map((r) => ({
    display_name: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
    place_id: String(r.place_id),
    osm_type: r.osm_type,
    osm_id: r.osm_id !== undefined ? String(r.osm_id) : undefined,
  }));

  cachePut(cacheKey, mapped);
  return mapped;
}
