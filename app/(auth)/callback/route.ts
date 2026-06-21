import { NextResponse } from "next/server";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Persist the Microsoft Graph token returned by an Azure SSO login into
// service_connections (provider 'microsoft'), so the department hub can call
// SharePoint / Graph on the user's behalf. No-op for non-OAuth exchanges
// (e.g. password recovery) which carry no provider_token. Best-effort:
// failures here never block login.
async function persistMicrosoftToken(
  supabase: SupabaseClient,
  session: Session | null | undefined,
): Promise<void> {
  if (!session?.provider_token || !session.user) return;
  const now = new Date().toISOString();
  try {
    await supabase.from("service_connections").upsert(
      {
        user_id: session.user.id,
        provider: "microsoft",
        status: "connected",
        account_label: session.user.email ?? "Microsoft",
        access_token: session.provider_token,
        refresh_token: session.provider_refresh_token ?? null,
        // Graph access tokens last ~1h; refreshed on next login.
        token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
        scopes: ["Files.ReadWrite.All", "Sites.ReadWrite.All", "Mail.Send"],
        last_error: null,
        connected_at: now,
        updated_at: now,
        deleted_at: null,
      },
      { onConflict: "user_id,provider" },
    );
  } catch (err) {
    console.error("[callback] persistMicrosoftToken failed:", err);
  }
}

// Only same-origin relative paths are allowed as `next` targets.
// Reject anything that could be interpreted as an external URL —
// "//evil.com/x" would otherwise concat to "{origin}//evil.com/x"
// which browsers treat as protocol-relative and follow off-domain.
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  if (raw.startsWith("/\\")) return "/";
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        await persistMicrosoftToken(supabase, data?.session);
      }
      if (error) {
        // Expired / already-used link, or a code from another browser
        // (PKCE verifier cookie missing) — send back to a graceful entry
        // point instead of 500-ing.
        const dest = next === "/reset-password" ? "/forgot-password" : "/login";
        return NextResponse.redirect(
          new URL(`${dest}?error=${encodeURIComponent(error.message)}`, url),
        );
      }
    } catch (err) {
      // exchangeCodeForSession can THROW (e.g. missing PKCE code verifier)
      // rather than returning { error }. Log the real cause and degrade
      // gracefully so the user never hits an Internal Server Error.
      console.error("[callback] exchangeCodeForSession threw:", err);
      const message =
        err instanceof Error ? err.message : "Link ungültig oder abgelaufen";
      const dest = next === "/reset-password" ? "/forgot-password" : "/login";
      return NextResponse.redirect(
        new URL(`${dest}?error=${encodeURIComponent(message)}`, url),
      );
    }
  }

  return NextResponse.redirect(new URL(next, url));
}
