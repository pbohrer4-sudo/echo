import { createClient } from "@/lib/supabase/server";
import type { PmDepartment } from "./types";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// Lists shared departments plus the caller's OWN personal space. Other
// users' personal spaces are filtered out (Wrike: a Personal Space is only
// visible to its owner and cannot be shared). Note this is a product-level
// filter on top of workspace RLS, mirroring Wrike's semantics.
export async function listDepartments(
  workspaceId: string,
): Promise<PmDepartment[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("pm_departments")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .or(`personal_owner_id.is.null,personal_owner_id.eq.${user?.id}`)
    .order("name", { ascending: true });
  return (data ?? []) as PmDepartment[];
}

// The caller's private Personal Space — auto-created on first access, like
// Wrike creates one per user when they join an account.
export async function getOrCreatePersonalSpace(
  workspaceId: string,
): Promise<PmDepartment | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from("pm_departments")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("personal_owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return existing as PmDepartment;

  const { data: created } = await supabase
    .from("pm_departments")
    .insert({
      workspace_id: workspaceId,
      name: "Persönlich",
      slug: `personal-${user.id.slice(0, 8)}`,
      description: "Dein privater Bereich - nur für dich sichtbar.",
      color: "#15803d",
      personal_owner_id: user.id,
      created_by: user.id,
    })
    .select("*")
    .maybeSingle();
  return (created as PmDepartment) ?? null;
}

export async function getDepartmentBySlug(
  workspaceId: string,
  slug: string,
): Promise<PmDepartment | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("pm_departments")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  const dept = (data as PmDepartment) ?? null;
  // Someone else's personal space is invisible, even by direct URL.
  if (dept?.personal_owner_id && dept.personal_owner_id !== user?.id) {
    return null;
  }
  return dept;
}

export async function getDepartmentById(
  id: string,
): Promise<PmDepartment | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_departments")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as PmDepartment) ?? null;
}

export interface DepartmentMember {
  user_id: string;
  role: string;
}

export async function listDepartmentMembers(
  departmentId: string,
): Promise<DepartmentMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_department_members")
    .select("user_id, role")
    .eq("department_id", departmentId)
    .order("created_at", { ascending: true });
  return (data ?? []) as DepartmentMember[];
}

// Builds an id → department map for cheap label lookups in lists.
export async function getDepartmentMap(
  workspaceId: string,
): Promise<Record<string, PmDepartment>> {
  const departments = await listDepartments(workspaceId);
  const map: Record<string, PmDepartment> = {};
  for (const d of departments) map[d.id] = d;
  return map;
}
