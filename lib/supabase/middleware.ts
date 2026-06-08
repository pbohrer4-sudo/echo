import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Exact paths or known prefixes only — `startsWith` here is intentional
// for `/auth/`, but the trailing slash matters: bare `/auth` would also
// match a hypothetical future `/authentication` or `/auth-debug` route
// and silently bypass the gate.
const PUBLIC_EXACT = new Set([
  "/login",
  "/callback",
  "/forgot-password",
  "/reset-password",
]);
const PUBLIC_PREFIXES = ["/auth/"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const path = request.nextUrl.pathname;

  // Auth code-exchange safety net. Supabase sometimes delivers the
  // `?code=` (e.g. a password-recovery link) to the Site URL root
  // instead of our configured redirectTo. The root page can't handle a
  // code → 500. Route any stray code through /callback, which exchanges
  // it. A bare code at the root is treated as a recovery flow → land on
  // /reset-password; otherwise return to the originating path.
  const code = request.nextUrl.searchParams.get("code");
  if (code && path !== "/callback") {
    const url = request.nextUrl.clone();
    url.pathname = "/callback";
    url.searchParams.set("next", path === "/" ? "/reset-password" : path);
    return NextResponse.redirect(url);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isPublic =
    PUBLIC_EXACT.has(path) ||
    PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
