import Link from "next/link";
import { signIn, signInWithMagicLink } from "./actions";
import { APP_CONFIG } from "@/lib/config";

type Search = { error?: string; magic?: string };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { error, magic } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-ink-1">
      <div className="w-full max-w-sm space-y-10">
        <header className="space-y-3">
          <p className="t-label">Personal CRM</p>
          <h1 className="text-3xl font-semibold tracking-tight">{APP_CONFIG.PUBLIC_NAME}</h1>
          <p className="text-sm text-ink-3">
            Beziehungs-Intelligenz für deinen Tag.
          </p>
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
          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-xs text-ink-3 transition hover:text-action"
            >
              Passwort vergessen?
            </Link>
          </div>
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

        <form action={signInWithMagicLink} className="space-y-3">
          <label className="block space-y-2">
            <span className="t-label">Login-Link per E-Mail</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="deine@email.de"
              className="h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
            />
          </label>
          <button
            type="submit"
            className="h-9 w-full rounded border border-rule bg-paper px-4 text-sm font-medium text-ink-1 transition hover:border-action hover:text-action"
          >
            Login-Link senden
          </button>
        </form>

        {magic === "sent" ? (
          <p className="text-sm text-good">
            Falls ein Konto existiert, ist ein Login-Link unterwegs. Prüfe dein
            Postfach und klicke den Link in dieser Session.
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-bad">Fehler: {decodeURIComponent(error)}</p>
        ) : null}
      </div>
    </main>
  );
}
