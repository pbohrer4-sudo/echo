import Link from "next/link";
import { updatePassword } from "./actions";
import { APP_CONFIG } from "@/lib/config";

type Search = { error?: string };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-ink-1">
      <div className="w-full max-w-sm space-y-10">
        <header className="space-y-3">
          <p className="t-label">Personal CRM</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {APP_CONFIG.PUBLIC_NAME}
          </h1>
          <p className="text-sm text-ink-3">Neues Passwort festlegen.</p>
        </header>

        <form action={updatePassword} className="space-y-5">
          <label className="block space-y-2">
            <span className="t-label">Neues Passwort</span>
            <input
              type="password"
              name="password"
              required
              autoFocus
              minLength={8}
              autoComplete="new-password"
              className="h-9 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
            />
          </label>
          <label className="block space-y-2">
            <span className="t-label">Passwort bestätigen</span>
            <input
              type="password"
              name="confirm"
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
            Passwort speichern
          </button>
        </form>

        {error ? (
          <p className="text-sm text-bad">Fehler: {decodeURIComponent(error)}</p>
        ) : null}

        <Link
          href="/login"
          className="block text-sm text-ink-3 transition hover:text-action"
        >
          ← Zurück zum Login
        </Link>
      </div>
    </main>
  );
}
