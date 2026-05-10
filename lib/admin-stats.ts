import { createAdminClient } from "@/lib/supabase/admin";

// Typed wrappers für die SECURITY-DEFINER-Funktionen aus
// supabase/migrations/0018_admin_stats_functions.sql. Aufruf
// IMMER mit dem Service-Role-Client — das DB-EXECUTE-Privileg ist
// auf authenticated/anon revoked, daher würde ein normaler Client
// failen. Routes-Side bleibt mit lib/admin.requireAdmin gegated.

export interface WeeklySignup {
  week: string; // ISO date for week start
  count: number;
}

export interface RecentSignup {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  onboarded: boolean;
}

export interface OverviewStats {
  total_users: number;
  active_7d: number;
  active_30d: number;
  onboarded: number;
  people_total: number;
  interactions_total: number;
  debriefs_total: number;
  signups_weekly: WeeklySignup[];
  recent_signups: RecentSignup[];
}

export interface AdminUserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  people_count: number;
  interactions_count: number;
  debriefs_count: number;
  onboarded: boolean;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_overview_stats");
  if (error) throw error;
  return data as OverviewStats;
}

export async function getAdminUsersList(): Promise<AdminUserRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_users_list");
  if (error) throw error;
  return (data ?? []) as AdminUserRow[];
}
