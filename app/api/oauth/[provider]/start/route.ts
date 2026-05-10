import { NextResponse } from "next/server";
import { findProvider } from "@/lib/connections-catalog";
import { getUserContext } from "@/lib/user-context";
import { issueOAuthState } from "@/lib/oauth-state";

export const runtime = "nodejs";

// V1 stub: instead of redirecting to the provider's authorize URL,
// we hop straight to our own callback. The state cookie issued here
// is verified in the callback so the callback can't be reached via a
// crafted link or CSRF.
//
// V2: build the real authorize URL per provider, forward the same
// `state`, redirect to the provider, handle the redirect back at
// /api/oauth/[provider]/callback.
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

  const callbackUrl = new URL(
    `/api/oauth/${provider}/callback`,
    request.url,
  );
  callbackUrl.searchParams.set("state", state);
  // The stub still emits a `code` so the URL shape matches what V2
  // will get from a real provider. The callback ignores its value.
  callbackUrl.searchParams.set("code", "stub");
  return NextResponse.redirect(callbackUrl);
}
