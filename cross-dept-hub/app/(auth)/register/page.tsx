import Link from "next/link";
import { register } from "../login/actions";
import { APP_CONFIG } from "@/lib/config";

type Search = { error?: string };

export default async function RegisterPage({
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
            Konto erstellen
          </h1>
          <p className="text-sm text-ink-3">{APP_CONFIG.PUBLIC_TAGLINE}</p>
        </header>

        <form action={register} className="space-y-5">
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
            <span className="t-label">Passwort (mind. 8 Zeichen)</span>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
            />
          </label>
          <button
            type="submit"
            className="h-9 w-full rounded border border-action bg-action px-4 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
          >
            Registrieren
          </button>
        </form>

        <p className="text-center text-sm text-ink-3">
          Schon ein Konto?{" "}
          <Link href="/login" className="text-action hover:underline">
            Einloggen
          </Link>
        </p>

        {error ? (
          <p className="text-sm text-bad">Fehler: {decodeURIComponent(error)}</p>
        ) : null}
      </div>
    </main>
  );
}
