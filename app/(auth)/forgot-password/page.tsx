import Link from "next/link";
import { requestPasswordReset } from "./actions";
import { APP_CONFIG } from "@/lib/config";

type Search = { error?: string; sent?: string };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { error, sent } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-ink-1">
      <div className="w-full max-w-sm space-y-10">
        <header className="space-y-3">
          <p className="t-label">Personal CRM</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {APP_CONFIG.PUBLIC_NAME}
          </h1>
          <p className="text-sm text-ink-3">
            Passwort zurücksetzen — wir schicken dir einen Link.
          </p>
        </header>

        {sent ? (
          <div className="space-y-4">
            <p className="rounded border border-action/30 bg-action-soft px-4 py-3 text-sm text-ink-1">
              Falls ein Konto mit dieser Email existiert, haben wir dir einen
              Link zum Zurücksetzen geschickt. Prüfe dein Postfach (und den
              Spam-Ordner).
            </p>
            <Link
              href="/login"
              className="text-sm text-ink-3 transition hover:text-action"
            >
              ← Zurück zum Login
            </Link>
          </div>
        ) : (
          <>
            <form action={requestPasswordReset} className="space-y-5">
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
              <button
                type="submit"
                className="h-9 w-full rounded border border-action bg-action px-4 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
              >
                Link senden
              </button>
            </form>

            {error ? (
              <p className="text-sm text-bad">
                Fehler: {decodeURIComponent(error)}
              </p>
            ) : null}

            <Link
              href="/login"
              className="block text-sm text-ink-3 transition hover:text-action"
            >
              ← Zurück zum Login
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
