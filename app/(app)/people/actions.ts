"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Scope } from "@/lib/types";

const SCOPES: Scope[] = ["work", "personal", "both"];

interface PersonInput {
  name: string;
  company: string | null;
  role: string | null;
  scope: Scope;
  tags: string[];
  expected_cadence_days: number | null;
  birthday: string | null;
  phone: string | null;
  email: string | null;
}

function parseFormData(formData: FormData): PersonInput | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name ist Pflicht" };

  const scopeRaw = String(formData.get("scope") ?? "both");
  const scope: Scope = (SCOPES as string[]).includes(scopeRaw)
    ? (scopeRaw as Scope)
    : "both";

  const tagsRaw = String(formData.get("tags") ?? "");
  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const cadenceRaw = String(formData.get("expected_cadence_days") ?? "");
  const expected_cadence_days = cadenceRaw ? parseInt(cadenceRaw, 10) : null;
  if (cadenceRaw && Number.isNaN(expected_cadence_days)) {
    return { error: "Cadence muss eine Zahl sein" };
  }

  const trimOrNull = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return v ? v : null;
  };

  return {
    name,
    company: trimOrNull("company"),
    role: trimOrNull("role"),
    scope,
    tags,
    expected_cadence_days,
    birthday: trimOrNull("birthday"),
    phone: trimOrNull("phone"),
    email: trimOrNull("email"),
  };
}

export async function createPerson(formData: FormData) {
  const parsed = parseFormData(formData);
  if ("error" in parsed) {
    redirect(`/people/new?error=${encodeURIComponent(parsed.error)}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("people")
    .insert({ ...parsed, user_id: user.id })
    .select("id")
    .single();

  if (error) {
    redirect(`/people/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/people");
  redirect(`/people/${data!.id}`);
}

export async function updatePerson(id: string, formData: FormData) {
  const parsed = parseFormData(formData);
  if ("error" in parsed) {
    redirect(`/people/${id}/edit?error=${encodeURIComponent(parsed.error)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update(parsed)
    .eq("id", id);

  if (error) {
    redirect(`/people/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/people");
  revalidatePath(`/people/${id}`);
  redirect(`/people/${id}`);
}

export async function deletePerson(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("people")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    redirect(`/people/${id}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/people");
  redirect("/people");
}
