"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

interface OrgInput {
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  size: string | null;
  hq: string | null;
  description: string | null;
  notes: string | null;
  tags: string[];
  enriched: boolean;
}

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function parseFormData(formData: FormData): OrgInput | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name ist Pflicht" };

  const tagsRaw = String(formData.get("tags") ?? "");
  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    name,
    domain: trimOrNull(formData.get("domain")),
    website: trimOrNull(formData.get("website")),
    industry: trimOrNull(formData.get("industry")),
    size: trimOrNull(formData.get("size")),
    hq: trimOrNull(formData.get("hq")),
    description: trimOrNull(formData.get("description")),
    notes: trimOrNull(formData.get("notes")),
    tags,
    enriched: formData.get("enriched") === "1",
  };
}

export async function createOrganization(formData: FormData) {
  const parsed = parseFormData(formData);
  if ("error" in parsed) {
    redirect(
      `/organizations/new?error=${encodeURIComponent(parsed.error)}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { enriched, ...rest } = parsed;
  const { data, error } = await supabase
    .from("organizations")
    .insert({
      ...rest,
      user_id: user.id,
      enriched_at: enriched ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) {
    redirect(
      `/organizations/new?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/organizations");
  redirect(`/organizations/${data!.id}`);
}

export async function updateOrganization(id: string, formData: FormData) {
  const parsed = parseFormData(formData);
  if ("error" in parsed) {
    redirect(
      `/organizations/${id}/edit?error=${encodeURIComponent(parsed.error)}`,
    );
  }

  const supabase = await createClient();
  const { enriched, ...rest } = parsed;
  const update: Record<string, unknown> = { ...rest };
  if (enriched) update.enriched_at = new Date().toISOString();

  const { error } = await supabase
    .from("organizations")
    .update(update)
    .eq("id", id);

  if (error) {
    redirect(
      `/organizations/${id}/edit?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Keep people.company in sync if name changed (best-effort, no failure
  // path: a stale cached name is a minor cosmetic issue).
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (org?.name) {
    await supabase
      .from("people")
      .update({ company: org.name })
      .eq("organization_id", id);
  }

  revalidatePath("/organizations");
  revalidatePath(`/organizations/${id}`);
  revalidatePath("/people");
  redirect(`/organizations/${id}`);
}

// Inline-edit endpoint: replaces the tag array in one call. Used by
// the org list's tag chip editor — no need to push the user into
// the full edit form just to add or remove a single tag.
export async function updateOrganizationTags(id: string, tags: string[]) {
  "use server";
  const cleaned = Array.from(
    new Set(
      tags
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter((t) => t.length > 0),
    ),
  );

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ tags: cleaned })
    .eq("id", id);
  if (error) throw error;

  revalidatePath("/organizations");
  revalidatePath(`/organizations/${id}`);
}

export async function deleteOrganization(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    redirect(`/organizations/${id}?error=${encodeURIComponent(error.message)}`);
  }

  // Unlink people but keep their company text — they don't disappear.
  await supabase
    .from("people")
    .update({ organization_id: null })
    .eq("organization_id", id);

  revalidatePath("/organizations");
  revalidatePath("/people");
  redirect("/organizations");
}
