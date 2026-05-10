import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { findProvider } from "@/lib/connections-catalog";
import { getUserContext } from "@/lib/user-context";
import { consumeOAuthState } from "@/lib/oauth-state";

export const runtime = "nodejs";

// V1 stub: the actual OAuth roundtrip is faked. We still validate the
// state cookie set by /start so this URL can't be reached via a CSRF
// link or a crafted `?code=` from outside our flow. The token written
// is generated server-side rather than echoing the user-supplied code.
//
// V2: exchange the real code at the provider's token endpoint and
// store the resulting tokens (encrypted at rest — see issue tracker).
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
  const presentedState = url.searchParams.get("state");
  const stateOk = await consumeOAuthState(provider, presentedState);
  if (!stateOk) {
    return NextResponse.redirect(
      new URL("/connections?error=invalid_state", request.url),
    );
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  const stubToken = `stub_${randomBytes(24).toString("base64url")}`;
  const stubRefresh = `stub_${randomBytes(24).toString("base64url")}`;

  // Upsert by (user_id, provider). RLS scopes everything to ctx.user_id.
  const { error } = await supabase.from("service_connections").upsert(
    {
      user_id: ctx.user_id,
      provider,
      status: "connected",
      account_label: ctx.email,
      access_token: stubToken,
      refresh_token: stubRefresh,
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
