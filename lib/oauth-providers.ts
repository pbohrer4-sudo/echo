// Provider-specific OAuth endpoints + scope mapping. The /start +
// /callback routes consult this to know which providers have a real
// implementation versus which still run the V1 stub.
//
// We don't store secrets here — only public endpoints + scopes.
// Client IDs / Secrets come from env vars and are consumed at flow
// time, never imported into client bundles.

export type RealOAuthProvider = "google_calendar" | "gmail";

interface OAuthConfig {
  authorize_url: string;
  token_url: string;
  // The scopes we ask Google for on this provider. Different from
  // the catalog's `default_scopes` which describes intent — these
  // are the exact OAuth scope strings Google expects.
  scopes: string[];
  client_id_env: string;
  client_secret_env: string;
}

const GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

// Both Calendar + Gmail share Google identity but ask for different
// scope subsets. The user can grant just one without granting the
// other.
const CONFIG: Record<RealOAuthProvider, OAuthConfig> = {
  google_calendar: {
    authorize_url: GOOGLE_AUTHORIZE,
    token_url: GOOGLE_TOKEN,
    scopes: [
      "https://www.googleapis.com/auth/calendar.events.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    client_id_env: "GOOGLE_CLIENT_ID",
    client_secret_env: "GOOGLE_CLIENT_SECRET",
  },
  gmail: {
    authorize_url: GOOGLE_AUTHORIZE,
    token_url: GOOGLE_TOKEN,
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    client_id_env: "GOOGLE_CLIENT_ID",
    client_secret_env: "GOOGLE_CLIENT_SECRET",
  },
};

export function isRealOAuthProvider(
  provider: string,
): provider is RealOAuthProvider {
  return provider in CONFIG;
}

export interface AuthorizeResult {
  url: string;
}

export function buildAuthorizeUrl({
  provider,
  state,
  redirectUri,
}: {
  provider: RealOAuthProvider;
  state: string;
  redirectUri: string;
}): AuthorizeResult {
  const cfg = CONFIG[provider];
  const clientId = process.env[cfg.client_id_env];
  if (!clientId) {
    throw new Error(
      `${cfg.client_id_env} missing — add to .env.local before connecting ${provider}.`,
    );
  }
  const url = new URL(cfg.authorize_url);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", cfg.scopes.join(" "));
  // access_type=offline + prompt=consent ensures we get a refresh
  // token on every authorize, not just the first. Without it,
  // re-authorizing a previously-granted scope returns an access token
  // only and we lose the ability to refresh it server-side.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return { url: url.toString() };
}

export interface TokenExchangeResult {
  access_token: string;
  refresh_token: string | null;
  expires_in: number; // seconds
  scope: string;
  token_type: string;
  // Pulled from the id_token if returned, else null. Lets the
  // callback stamp a user-friendly account_label.
  email?: string | null;
}

interface GoogleTokenReply {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

interface GoogleIdTokenPayload {
  email?: string;
  email_verified?: boolean;
  sub?: string;
}

function decodeIdTokenEmail(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json) as GoogleIdTokenPayload;
    return payload.email ?? null;
  } catch {
    return null;
  }
}

export async function exchangeCode({
  provider,
  code,
  redirectUri,
}: {
  provider: RealOAuthProvider;
  code: string;
  redirectUri: string;
}): Promise<TokenExchangeResult> {
  const cfg = CONFIG[provider];
  const clientId = process.env[cfg.client_id_env];
  const clientSecret = process.env[cfg.client_secret_env];
  if (!clientId || !clientSecret) {
    throw new Error(
      `${cfg.client_id_env} / ${cfg.client_secret_env} missing — cannot exchange code.`,
    );
  }
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(cfg.token_url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Token exchange ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as GoogleTokenReply;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    expires_in: data.expires_in,
    scope: data.scope,
    token_type: data.token_type,
    email: decodeIdTokenEmail(data.id_token),
  };
}

// Compose the canonical redirect URI we register with the provider.
// MUST match exactly what's configured in Google Cloud Console.
export function redirectUriFor(
  requestUrl: string,
  provider: string,
): string {
  return new URL(`/api/oauth/${provider}/callback`, requestUrl).toString();
}
