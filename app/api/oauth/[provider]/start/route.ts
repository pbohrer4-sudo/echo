import { NextResponse } from "next/server";
import { findProvider } from "@/lib/connections-catalog";
import { getUserContext } from "@/lib/user-context";

export const runtime = "nodejs";

// V1 stub: instead of redirecting to the provider's authorize URL,
// we hop straight to our own callback with a synthetic code. The
// callback then upserts a "connected" record with a fake token. This
// keeps the UX exercisable end-to-end without OAuth client creds.
//
// V2: build the real authorize URL per provider, store a state token
// in the DB, redirect to the provider, handle the redirect back at
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

  const callbackUrl = new URL(
    `/api/oauth/${provider}/callback`,
    request.url,
  );
  callbackUrl.searchParams.set("code", `stub_${Math.random().toString(36).slice(2, 10)}`);
  callbackUrl.searchParams.set("state", "stub_state");
  return NextResponse.redirect(callbackUrl);
}
