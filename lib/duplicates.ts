import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/user-context";
import type { EmailEntry, PhoneEntry, Person, Organization } from "@/lib/types";

// Duplicate detection for people + organizations.
//
// Strategy: pull the (small) full set of records once, then run a
// pairwise scoring pass in JavaScript. Personal CRM datasets are
// typically <5k rows, so an O(n²) compare with cheap operations is
// fine (and avoids fragile Postgres-side similarity SQL). For
// >100k rows we'd switch to pg_trgm-based candidate filtering first.
//
// Each pair has a confidence score 0–100. Anything over 60 surfaces
// in the UI; users can also click "show low-confidence" to review the
// 40–60 band.

const HIGH_CONFIDENCE = 90;
const MED_CONFIDENCE = 70;
const LOW_CONFIDENCE = 50;

export interface DuplicatePair<T> {
  primary: T;
  secondary: T;
  score: number;
  reasons: string[];
}

export interface PeopleDuplicateRow {
  pair_id: string;
  primary_id: string;
  primary_name: string;
  primary_company: string | null;
  primary_role: string | null;
  primary_avatar_url: string | null;
  secondary_id: string;
  secondary_name: string;
  secondary_company: string | null;
  secondary_role: string | null;
  secondary_avatar_url: string | null;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
}

export interface OrgDuplicateRow {
  pair_id: string;
  primary_id: string;
  primary_name: string;
  primary_domain: string | null;
  primary_industry: string | null;
  secondary_id: string;
  secondary_name: string;
  secondary_domain: string | null;
  secondary_industry: string | null;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
}

// Normalise a string for case-insensitive, whitespace-collapsed
// comparison. NFD removes diacritics so "Müller" matches "Muller".
function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhone(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function normalizeEmail(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

// Cheap Levenshtein-ratio approximation via prefix overlap. Good
// enough to catch "Lukas Maier" / "Lukas Maeir" — we don't need
// full Levenshtein for this UX.
function similarityRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.length === 0) return 1;
  // Trigram-overlap sketch. Small strings get exact match boost.
  const trigrams = (s: string) => {
    const padded = `  ${s}  `;
    const out = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
    return out;
  };
  const A = trigrams(longer);
  const B = trigrams(shorter);
  let shared = 0;
  for (const t of B) if (A.has(t)) shared += 1;
  return shared / Math.max(A.size, B.size);
}

function bandFor(score: number): "high" | "medium" | "low" {
  if (score >= HIGH_CONFIDENCE) return "high";
  if (score >= MED_CONFIDENCE) return "medium";
  return "low";
}

function pairId(a: string, b: string): string {
  return [a, b].sort().join(":");
}

// Pick which side becomes the primary in the merge UI. Older record
// wins when scores tie because old ids tend to have richer history
// linked to them (interactions, notes). User can flip in the UI.
function pickPrimary<T extends { id: string; created_at: string }>(
  a: T,
  b: T,
): { primary: T; secondary: T } {
  if (a.created_at < b.created_at) return { primary: a, secondary: b };
  if (a.created_at > b.created_at) return { primary: b, secondary: a };
  return a.id < b.id ? { primary: a, secondary: b } : { primary: b, secondary: a };
}

export async function listPeopleDuplicates(): Promise<PeopleDuplicateRow[]> {
  const ctx = await getUserContext();
  if (!ctx) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .is("deleted_at", null)
    .eq("is_self", false);
  if (error || !data) return [];
  const people = data as Person[];

  const seen = new Set<string>();
  const pairs: PeopleDuplicateRow[] = [];

  // Build flat arrays of contact handles per person to make the inner
  // loop cheap.
  const sketches = people.map((p) => ({
    person: p,
    name: normalize(p.name),
    company: normalize(p.company),
    phones: new Set(
      ((p.phones ?? []) as PhoneEntry[])
        .map((x) => normalizePhone(x.value))
        .filter((x) => x && x.length >= 5),
    ),
    emails: new Set(
      ((p.emails ?? []) as EmailEntry[])
        .map((x) => normalizeEmail(x.value))
        .filter((x) => x.length > 3),
    ),
  }));

  for (let i = 0; i < sketches.length; i++) {
    for (let j = i + 1; j < sketches.length; j++) {
      const a = sketches[i];
      const b = sketches[j];

      let score = 0;
      const reasons: string[] = [];

      // Name match — strongest single signal.
      if (a.name && a.name === b.name) {
        score += 70;
        reasons.push("Gleicher Name");
      } else if (a.name && b.name) {
        const ratio = similarityRatio(a.name, b.name);
        if (ratio >= 0.85) {
          score += 50;
          reasons.push(`Ähnlicher Name (${Math.round(ratio * 100)}%)`);
        } else if (ratio >= 0.7) {
          score += 30;
          reasons.push(`Ähnlicher Name (${Math.round(ratio * 100)}%)`);
        }
      }

      // Email overlap.
      const emailHits = [...a.emails].filter((e) => b.emails.has(e));
      if (emailHits.length > 0) {
        score += 40;
        reasons.push(`Gleiche Email: ${emailHits[0]}`);
      }

      // Phone overlap.
      const phoneHits = [...a.phones].filter((p) => b.phones.has(p));
      if (phoneHits.length > 0) {
        score += 35;
        reasons.push(`Gleiche Telefon: ${phoneHits[0]}`);
      }

      // Company match nudges name-only matches up. By itself it's not
      // enough — same name + same company is the gold standard.
      if (a.company && b.company && a.company === b.company) {
        if (score > 0) {
          score += 10;
          reasons.push("Gleiche Firma");
        }
      }

      score = Math.min(100, score);
      if (score < LOW_CONFIDENCE) continue;

      const id = pairId(a.person.id, b.person.id);
      if (seen.has(id)) continue;
      seen.add(id);

      const { primary, secondary } = pickPrimary(a.person, b.person);
      pairs.push({
        pair_id: id,
        primary_id: primary.id,
        primary_name: primary.name,
        primary_company: primary.company,
        primary_role: primary.role,
        primary_avatar_url: primary.photo_url,
        secondary_id: secondary.id,
        secondary_name: secondary.name,
        secondary_company: secondary.company,
        secondary_role: secondary.role,
        secondary_avatar_url: secondary.photo_url,
        score,
        confidence: bandFor(score),
        reasons,
      });
    }
  }

  // Highest-confidence pairs first.
  pairs.sort((a, b) => b.score - a.score);
  return pairs;
}

export async function listOrganizationDuplicates(): Promise<OrgDuplicateRow[]> {
  const ctx = await getUserContext();
  if (!ctx) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .is("deleted_at", null);
  if (error || !data) return [];
  const orgs = data as Organization[];

  const seen = new Set<string>();
  const pairs: OrgDuplicateRow[] = [];

  const sketches = orgs.map((o) => ({
    org: o,
    name: normalize(o.name),
    domain: (o.domain ?? "")
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .trim(),
  }));

  for (let i = 0; i < sketches.length; i++) {
    for (let j = i + 1; j < sketches.length; j++) {
      const a = sketches[i];
      const b = sketches[j];

      let score = 0;
      const reasons: string[] = [];

      if (a.name && a.name === b.name) {
        score += 80;
        reasons.push("Gleicher Name");
      } else if (a.name && b.name) {
        const ratio = similarityRatio(a.name, b.name);
        if (ratio >= 0.85) {
          score += 55;
          reasons.push(`Ähnlicher Name (${Math.round(ratio * 100)}%)`);
        } else if (ratio >= 0.7) {
          score += 35;
          reasons.push(`Ähnlicher Name (${Math.round(ratio * 100)}%)`);
        }
      }

      if (a.domain && b.domain && a.domain === b.domain) {
        score += 50;
        reasons.push(`Gleiche Domain: ${a.domain}`);
      }

      score = Math.min(100, score);
      if (score < LOW_CONFIDENCE) continue;

      const id = pairId(a.org.id, b.org.id);
      if (seen.has(id)) continue;
      seen.add(id);

      const { primary, secondary } = pickPrimary(a.org, b.org);
      pairs.push({
        pair_id: id,
        primary_id: primary.id,
        primary_name: primary.name,
        primary_domain: primary.domain,
        primary_industry: primary.industry,
        secondary_id: secondary.id,
        secondary_name: secondary.name,
        secondary_domain: secondary.domain,
        secondary_industry: secondary.industry,
        score,
        confidence: bandFor(score),
        reasons,
      });
    }
  }

  pairs.sort((a, b) => b.score - a.score);
  return pairs;
}

export async function mergePeople(
  primaryId: string,
  secondaryId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_people", {
    primary_id: primaryId,
    secondary_id: secondaryId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function mergeOrganizations(
  primaryId: string,
  secondaryId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_organizations", {
    primary_id: primaryId,
    secondary_id: secondaryId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
