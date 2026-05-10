import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { findProvider } from "@/lib/connections-catalog";
import { getUserContext } from "@/lib/user-context";
import { consumeOAuthState } from "@/lib/oauth-state";
import {
  exchangeCode,
  isRealOAuthProvider,
  redirectUriFor,
} from "@/lib/oauth-providers";

export const runtime = "nodejs";

// Two-tier callback matching the start route:
//   - Real providers (google_calendar, gmail): exchange the returned
//     `code` at the provider's token endpoint, persist real tokens.
//   - Stub providers: generate a synthetic token so the rest of the
//     catalog stays clickable end-to-end.
//
// State CSRF check runs before either branch so this URL can't be
// reached via a crafted link with someone else's `code`.
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

  // Surface user-denied authorization — Google returns ?error=access_denied
  // when the user clicks "Cancel" on the consent screen.
  const upstreamError = url.searchParams.get("error");
  if (upstreamError) {
    return NextResponse.redirect(
      new URL(
        `/connections/${provider}?error=${encodeURIComponent(upstreamError)}`,
        request.url,
      ),
    );
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      new URL(
        `/connections/${provider}?error=missing_code`,
        request.url,
      ),
    );
  }

  const supabase = await createClient();
  const now = new Date().toISOString();

  let accessToken: string;
  let refreshToken: string | null;
  let expiresAt: string;
  let scopes: string[];
  let accountLabel: string | null;
  const config: Record<string, unknown> = {};

  if (isRealOAuthProvider(provider)) {
    try {
      const reply = await exchangeCode({
        provider,
        code,
        redirectUri: redirectUriFor(request.url, provider),
      });
      accessToken = reply.access_token;
      refreshToken = reply.refresh_token;
      expiresAt = new Date(
        Date.now() + reply.expires_in * 1000,
      ).toISOString();
      scopes = reply.scope.split(" ").filter(Boolean);
      accountLabel = reply.email ?? ctx.email ?? "Google";
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Token-Exchange fehlgeschlagen";
      return NextResponse.redirect(
        new URL(
          `/connections/${provider}?error=${encodeURIComponent(message)}`,
          request.url,
        ),
      );
    }
  } else {
    // V1 stub for non-wired providers.
    accessToken = `stub_${randomBytes(24).toString("base64url")}`;
    refreshToken = `stub_${randomBytes(24).toString("base64url")}`;
    expiresAt = new Date(Date.now() + 3600_000).toISOString();
    scopes = def.default_scopes;
    accountLabel = ctx.email ?? "Stub";
    config.stub = true;
  }

  const { error } = await supabase.from("service_connections").upsert(
    {
      user_id: ctx.user_id,
      provider,
      status: "connected",
      account_label: accountLabel,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: expiresAt,
      scopes,
      config,
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
