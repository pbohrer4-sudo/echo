import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/user-context";

// Global search across the four content types Patrick reaches for
// most often. Uses ILIKE backed by pg_trgm GIN indexes from migration
// 0010 — handles partial matches and German compound words better
// than tsvector-based FTS for a personal CRM dataset.

export interface SearchHit {
  kind: "person" | "organization" | "note" | "interaction";
  id: string;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  href: string;
  score: number; // simple relevance: 100 = exact-prefix on title field
}

export interface SearchResults {
  query: string;
  total: number;
  hits: SearchHit[];
}

const PER_KIND_LIMIT = 8;

// Naive scorer that prefers exact-prefix matches on the primary field
// then case-insensitive substring. Good enough for "type a few chars
// and find the obvious match" — the search bar's main job.
function score(haystack: string | null | undefined, needle: string): number {
  if (!haystack) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (h === n) return 100;
  if (h.startsWith(n)) return 80;
  if (h.includes(` ${n}`)) return 60;
  if (h.includes(n)) return 40;
  return 0;
}

export async function search(query: string): Promise<SearchResults> {
  const q = query.trim();
  if (q.length < 2) return { query, total: 0, hits: [] };

  const ctx = await getUserContext();
  if (!ctx) return { query, total: 0, hits: [] };

  const supabase = await createClient();
  const pattern = `%${q}%`;

  // Each query is small + indexed. Run in parallel.
  const [peopleRes, orgsRes, notesRes, intsRes] = await Promise.all([
    supabase
      .from("people")
      .select("id, name, company, role, notes")
      .or(
        `name.ilike.${pattern},company.ilike.${pattern},role.ilike.${pattern},notes.ilike.${pattern}`,
      )
      .limit(PER_KIND_LIMIT),
    supabase
      .from("organizations")
      .select("id, name, description, notes")
      .or(
        `name.ilike.${pattern},description.ilike.${pattern},notes.ilike.${pattern}`,
      )
      .limit(PER_KIND_LIMIT),
    supabase
      .from("notes")
      .select("id, title, body, person_id")
      .or(`title.ilike.${pattern},body.ilike.${pattern}`)
      .limit(PER_KIND_LIMIT),
    supabase
      .from("interactions")
      .select("id, summary, type, person_id, occurred_at")
      .ilike("summary", pattern)
      .limit(PER_KIND_LIMIT),
  ]);

  const hits: SearchHit[] = [];

  for (const p of peopleRes.data ?? []) {
    const s = Math.max(
      score(p.name, q),
      score(p.company, q) - 10,
      score(p.role, q) - 15,
      score(p.notes, q) - 30,
    );
    hits.push({
      kind: "person",
      id: p.id,
      title: p.name,
      subtitle: [p.company, p.role].filter(Boolean).join(" · ") || null,
      snippet: extractSnippet(p.notes, q),
      href: `/people/${p.id}`,
      score: s,
    });
  }
  for (const o of orgsRes.data ?? []) {
    hits.push({
      kind: "organization",
      id: o.id,
      title: o.name,
      subtitle: o.description?.slice(0, 80) ?? null,
      snippet: extractSnippet(o.notes, q),
      href: `/organizations/${o.id}`,
      score: Math.max(score(o.name, q), score(o.description, q) - 20),
    });
  }
  for (const n of notesRes.data ?? []) {
    hits.push({
      kind: "note",
      id: n.id,
      title: n.title || "Notiz",
      subtitle: null,
      snippet: extractSnippet(n.body, q),
      href: n.person_id ? `/people/${n.person_id}` : `/inbox`,
      score: Math.max(score(n.title, q), score(n.body, q) - 10),
    });
  }
  for (const i of intsRes.data ?? []) {
    hits.push({
      kind: "interaction",
      id: i.id,
      title: i.type ?? "Interaktion",
      subtitle: i.occurred_at
        ? new Date(i.occurred_at).toLocaleDateString("de-DE", {
            day: "2-digit",
            month: "short",
            year: "2-digit",
          })
        : null,
      snippet: extractSnippet(i.summary, q),
      href: i.person_id ? `/people/${i.person_id}` : `/inbox`,
      score: score(i.summary, q),
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return { query, total: hits.length, hits: hits.slice(0, 30) };
}

// Returns ~120 chars of context around the match, so the user can
// recognize the hit without clicking through.
function extractSnippet(haystack: string | null, q: string): string | null {
  if (!haystack) return null;
  const idx = haystack.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return haystack.slice(0, 120) + (haystack.length > 120 ? "…" : "");
  const start = Math.max(0, idx - 50);
  const end = Math.min(haystack.length, idx + q.length + 70);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < haystack.length ? "…" : "";
  return prefix + haystack.slice(start, end) + suffix;
}
