"use server";

// Server-Action: nimmt das Enrich-Result (was die Client-Komponente
// von /api/enrich-organization holt) und merged es defensiv in die
// Organisation — nur Felder die aktuell leer sind werden überschrieben.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface EnrichmentData {
  industry: string | null;
  website: string | null;
  domain: string | null;
  size: string | null;
  hq: string | null;
  description: string | null;
  tags: string[];
  confidence?: "high" | "medium" | "low";
}

export async function applyEnrichmentAction(
  orgId: string,
  data: EnrichmentData,
): Promise<{ ok: boolean; error?: string; filled: string[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauth", filled: [] };

  const { data: org, error: fetchErr } = await supabase
    .from("organizations")
    .select("industry, website, domain, size, hq, description, tags")
    .eq("id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchErr || !org) {
    return { ok: false, error: "Org nicht gefunden", filled: [] };
  }

  const update: Record<string, unknown> = {};
  const filled: string[] = [];

  if (data.industry && !org.industry) {
    update.industry = data.industry;
    filled.push("Branche");
  }
  if (data.website && !org.website) {
    update.website = data.website;
    filled.push("Website");
  }
  if (data.domain && !org.domain) {
    update.domain = data.domain;
    filled.push("Domain");
  }
  if (data.size && !org.size) {
    update.size = data.size;
    filled.push("Größe");
  }
  if (data.hq && !org.hq) {
    update.hq = data.hq;
    filled.push("HQ");
  }
  if (data.description && !org.description) {
    update.description = data.description;
    filled.push("Beschreibung");
  }
  if (Array.isArray(data.tags) && data.tags.length > 0) {
    const existing = (org.tags ?? []) as string[];
    const merged = [...existing];
    const lower = new Set(existing.map((t) => t.toLowerCase()));
    let added = 0;
    for (const t of data.tags) {
      if (!t || lower.has(t.toLowerCase())) continue;
      merged.push(t);
      added += 1;
    }
    if (added > 0) {
      update.tags = merged;
      filled.push(`${added} Tags`);
    }
  }

  // enriched_at immer setzen damit das "Auto-Enrich {date}"-Badge auf
  // der Detail-Page aktualisiert wird, selbst wenn nichts neues kam.
  update.enriched_at = new Date().toISOString();
  update.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("organizations")
    .update(update)
    .eq("id", orgId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message, filled: [] };

  revalidatePath(`/organizations/${orgId}`);
  revalidatePath("/organizations");
  return { ok: true, filled };
}
