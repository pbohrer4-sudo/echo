import { NextResponse } from "next/server";
import { findProvider } from "@/lib/connections-catalog";
import { getUserContext } from "@/lib/user-context";
import { issueOAuthState } from "@/lib/oauth-state";
import {
  buildAuthorizeUrl,
  isRealOAuthProvider,
  redirectUriFor,
} from "@/lib/oauth-providers";

export const runtime = "nodejs";

// Two-tier behavior:
//   - Real providers (google_calendar, gmail): redirect to Google's
//     authorize URL with our client_id + scopes + state.
//   - Everyone else: keep the V1 stub that loops straight to the
//     callback. Catalog defines the providers, this route branches
//     on which ones actually have a real implementation wired.
//
// The state cookie issued here is verified in the callback so the
// callback can't be reached via a crafted link or CSRF.
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

  const state = await issueOAuthState(provider);

  if (isRealOAuthProvider(provider)) {
    try {
      const { url } = buildAuthorizeUrl({
        provider,
        state,
        redirectUri: redirectUriFor(request.url, provider),
      });
      return NextResponse.redirect(url);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "OAuth setup incomplete";
      return NextResponse.redirect(
        new URL(
          `/connections/${provider}?error=${encodeURIComponent(message)}`,
          request.url,
        ),
      );
    }
  }

  // Stub fallback for providers we haven't wired yet — preserves the
  // V1 click-to-fake-connect UX so the rest of the catalog stays
  // exercisable in the UI.
  const callbackUrl = new URL(
    `/api/oauth/${provider}/callback`,
    request.url,
  );
  callbackUrl.searchParams.set("state", state);
  callbackUrl.searchParams.set("code", "stub");
  return NextResponse.redirect(callbackUrl);
}
