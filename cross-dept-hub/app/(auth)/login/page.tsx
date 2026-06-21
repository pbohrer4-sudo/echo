import Link from "next/link";
import { signIn, signInWithMicrosoft } from "./actions";
import { APP_CONFIG } from "@/lib/config";

type Search = { error?: string };

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-ink-1">
      <div className="w-full max-w-sm space-y-10">
        <header className="space-y-3">
          <p className="t-label">Abteilungs-Hub</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {APP_CONFIG.PUBLIC_NAME} <span className="text-ink-4">Hub</span>
          </h1>
          <p className="text-sm text-ink-3">{APP_CONFIG.PUBLIC_TAGLINE}</p>
        </header>

        <form action={signIn} className="space-y-5">
          <label className="block space-y-2">
            <span className="t-label">Email</span>
            <input
              type="email"
              name="email"
              required
              autoFocus
              autoComplete="email"
              className="h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
            />
          </label>
          <label className="block space-y-2">
            <span className="t-label">Passwort</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
            />
          </label>
          <button
            type="submit"
            className="h-9 w-full rounded border border-action bg-action px-4 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
          >
            Einloggen
          </button>
        </form>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-rule" />
          <span className="t-label">oder</span>
          <span className="h-px flex-1 bg-rule" />
        </div>

        <form action={signInWithMicrosoft}>
          <button
            type="submit"
            className="flex h-9 w-full items-center justify-center gap-2.5 rounded border border-rule bg-paper px-4 text-sm font-medium text-ink-1 transition hover:border-action hover:bg-paper-2"
          >
            <MicrosoftLogo />
            Mit Microsoft anmelden
          </button>
        </form>

        <p className="text-center text-sm text-ink-3">
          Noch kein Konto?{" "}
          <Link href="/register" className="text-action hover:underline">
            Registrieren
          </Link>
        </p>

        {error ? (
          <p className="text-sm text-bad">Fehler: {decodeURIComponent(error)}</p>
        ) : null}
      </div>
    </main>
  );
}
