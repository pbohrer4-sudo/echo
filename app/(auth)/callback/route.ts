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
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url),
      );
    }
  }

  return NextResponse.redirect(new URL(next, url));
}
