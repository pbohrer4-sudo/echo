import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";

// CSRF state for the OAuth roundtrip. The start route generates a
// random state, stores its SHA-256 hash in an HttpOnly cookie scoped
// to /api/oauth, and forwards the raw state to the provider. The
// callback compares the returned state against the cookie's hash.
//
// The cookie is per-provider and expires after 10 minutes — long
// enough for a normal authorize flow, short enough that a stale cookie
// can't be replayed days later.

const COOKIE_PREFIX = "echo_oauth_state_";
const COOKIE_MAX_AGE_SEC = 10 * 60;

function cookieName(provider: string): string {
  return `${COOKIE_PREFIX}${provider}`;
}

function hashState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export async function issueOAuthState(provider: string): Promise<string> {
  const state = randomBytes(24).toString("base64url");
  const jar = await cookies();
  jar.set(cookieName(provider), hashState(state), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/oauth",
    maxAge: COOKIE_MAX_AGE_SEC,
  });
  return state;
}

export async function consumeOAuthState(
  provider: string,
  presented: string | null,
): Promise<boolean> {
  if (!presented) return false;
  const jar = await cookies();
  const expected = jar.get(cookieName(provider))?.value;
  jar.delete(cookieName(provider));
  if (!expected) return false;
  return expected === hashState(presented);
}
