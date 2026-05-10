import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Admin-Gate via Env-Variable ADMIN_EMAILS (Komma-getrennte Liste).
// Bewusst KEIN DB-Flag damit man Admins ohne Migration vergeben kann
// und sich nicht versehentlich aus der App aussperrt. Wenn ein DB-
// basiertes Modell später nötig wird (Teams, mehrere Tenants), wandert
// es nach profiles.is_admin oder eine eigene admin_users-Tabelle.
//
// Setup: in .env.local
//   ADMIN_EMAILS=patrick@example.com,other@example.com

function adminEmailSet(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmailSet().has(email.toLowerCase());
}

// Server-side check — nutzbar in Layouts / Server-Components. Falls
// nicht-Admin: redirect zur Home statt 404 damit die Route ihre
// Existenz nicht verrät.
export async function requireAdmin(): Promise<{
  userId: string;
  email: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/");
  return { userId: user.id, email: user.email! };
}

// Soft-Check (kein Redirect) — für Nav-Links die conditional sichtbar
// sein sollen.
export async function isCurrentUserAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdminEmail(user?.email);
}
