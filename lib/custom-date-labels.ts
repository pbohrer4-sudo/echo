import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { DATE_LABELS } from "@/lib/types";

// Reusable custom occasion labels (profiles.custom_date_labels). The
// "Wichtige Daten" form auto-remembers a user's custom occasion the
// first time they use it, so it appears in the dropdown thereafter.
//
// Defaults (DATE_LABELS) live in code and are merged in at render time;
// only the user's own additions are persisted.

const DEFAULTS_LOWER = new Set(
  DATE_LABELS.map((d) => d.toLowerCase()),
);

function parse(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function getCustomDateLabels(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("profiles")
    .select("custom_date_labels")
    .eq("id", user.id)
    .maybeSingle();
  return parse(data?.custom_date_labels);
}

// Auto-remember a custom occasion. No-op when the label is a built-in
// default, the special "andere" sentinel, or already saved. Best-effort
// — failures don't break the date-save flow that calls this.
export async function rememberCustomDateLabel(
  supabase: SupabaseClient,
  userId: string,
  label: string,
): Promise<void> {
  const trimmed = label.trim();
  if (!trimmed) return;
  const lower = trimmed.toLowerCase();
  if (lower === "andere" || DEFAULTS_LOWER.has(lower)) return;

  try {
    const { data } = await supabase
      .from("profiles")
      .select("custom_date_labels")
      .eq("id", userId)
      .maybeSingle();
    const current = parse(data?.custom_date_labels);
    if (current.some((l) => l.toLowerCase() === lower)) return;
    await supabase
      .from("profiles")
      .update({ custom_date_labels: [...current, trimmed] })
      .eq("id", userId);
  } catch {
    // best-effort
  }
}
