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

// ─── Subscriptions ───────────────────────────────────────────────────

export interface SubscriptionStats {
  active_count: number;
  trialing_count: number;
  past_due_count: number;
  canceled_count: number;
  mrr_cents: number;
  by_tier: Record<string, number>;
  churned_last_30d: number;
  new_last_30d: number;
}

export async function getSubscriptionStats(): Promise<SubscriptionStats | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_subscription_stats");
  if (error) {
    // Wenn die Migration noch nicht durchgelaufen ist, gibt's die
    // Function nicht — Caller behandelt null als "noch nicht
    // konfiguriert" und zeigt einen Setup-Hinweis.
    if (
      typeof error.message === "string" &&
      error.message.toLowerCase().includes("admin_subscription_stats")
    ) {
      return null;
    }
    throw error;
  }
  return data as SubscriptionStats;
}

// ─── LLM Usage ───────────────────────────────────────────────────────

export interface EndpointUsage {
  endpoint: string;
  requests: number;
  cost_cents: number;
}

export interface DailyUsage {
  day: string;
  requests: number;
  cost_cents: number;
}

export interface LlmUsageStats {
  total_requests_30d: number;
  total_cost_cents_30d: number;
  total_input_tokens_30d: number;
  total_output_tokens_30d: number;
  error_rate_30d: number;
  by_endpoint_30d: EndpointUsage[];
  daily_7d: DailyUsage[];
}

export async function getLlmUsageStats(): Promise<LlmUsageStats | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_llm_usage_stats");
  if (error) {
    if (
      typeof error.message === "string" &&
      error.message.toLowerCase().includes("admin_llm_usage_stats")
    ) {
      return null;
    }
    throw error;
  }
  return data as LlmUsageStats;
}
