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

export async function listDepartments(
  workspaceId: string,
): Promise<PmDepartment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_departments")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  return (data ?? []) as PmDepartment[];
}

export async function getDepartmentBySlug(
  workspaceId: string,
  slug: string,
): Promise<PmDepartment | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pm_departments")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as PmDepartment) ?? null;
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

// Builds an id → department map for cheap label lookups in lists.
export async function getDepartmentMap(
  workspaceId: string,
): Promise<Record<string, PmDepartment>> {
  const departments = await listDepartments(workspaceId);
  const map: Record<string, PmDepartment> = {};
  for (const d of departments) map[d.id] = d;
  return map;
}
