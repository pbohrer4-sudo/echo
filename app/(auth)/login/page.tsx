import { signIn } from "./actions";

type Search = { sent?: string; error?: string };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0d10] px-6 text-neutral-100">
      <div className="w-full max-w-sm space-y-8">
        <header className="space-y-2">
          <h1 className="font-serif text-3xl tracking-tight">ECHO</h1>
          <p className="text-sm text-neutral-400">
            Beziehungs-Intelligenz für deinen Tag.
          </p>
        </header>

        <form action={signIn} className="space-y-4">
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-wider text-neutral-500">
              Email
            </span>
            <input
              type="email"
              name="email"
              required
              autoFocus
              autoComplete="email"
              className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-[#c8ff3e]"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-[#c8ff3e] px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-[#b6eb2c]"
          >
            Magic Link senden
          </button>
        </form>

        {sent ? (
          <p className="text-sm text-[#c8ff3e]">
            Check deine Inbox — der Link landet in wenigen Sekunden.
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-400">Fehler: {decodeURIComponent(error)}</p>
        ) : null}
      </div>
    </main>
  );
}
