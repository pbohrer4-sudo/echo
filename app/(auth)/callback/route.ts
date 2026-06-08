import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      const { error } = await supabase.auth.exchangeCodeForSession(code);
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
