import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findProvider } from "@/lib/connections-catalog";
import { getUserContext } from "@/lib/user-context";

export const runtime = "nodejs";

// V1 stub: accepts any `code` query param and writes a "connected"
// row with a fake token. V2 will exchange the code for a real token
// against each provider's token endpoint.
export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const ctx = await getUserContext();
  if (!ctx) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { provider } = await context.params;
  const def = findProvider(provider);
  if (!def) {
    return NextResponse.redirect(
      new URL("/connections?error=unknown_provider", request.url),
    );
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL(`/connections?error=no_code`, request.url),
    );
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  // Upsert by (user_id, provider). RLS scopes everything to ctx.user_id.
  const { error } = await supabase.from("service_connections").upsert(
    {
      user_id: ctx.user_id,
      provider,
      status: "connected",
      account_label: ctx.email,
      access_token: `stub_token_${code}`,
      refresh_token: `stub_refresh_${code}`,
      token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      scopes: def.default_scopes,
      config: { stub: true },
      last_error: null,
      connected_at: now,
      updated_at: now,
      deleted_at: null,
    },
    { onConflict: "user_id,provider" },
  );

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/connections?error=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    );
  }

  return NextResponse.redirect(
    new URL(`/connections/${provider}?connected=1`, request.url),
  );
}
