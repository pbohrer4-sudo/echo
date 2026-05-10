import { getAdminUsersList } from "@/lib/admin-stats";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export default async function AdminUsersPage() {
  const users = await getAdminUsersList();

  return (
    <div className="space-y-6">
      <div>
        <p className="t-label">Admin</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-1">
          Users
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          {users.length.toLocaleString("de-DE")} registrierte Nutzer.
          Sortiert nach Anmeldedatum (neueste zuerst).
        </p>
      </div>

      <div className="overflow-x-auto rounded border border-rule bg-paper">
        <div className="grid min-w-max grid-cols-[minmax(200px,1.5fr)_120px_120px_80px_80px_80px_80px] gap-4 border-b border-rule bg-paper-2 px-4 py-2.5">
          <span className="t-label">Email</span>
          <span className="t-label">Registriert</span>
          <span className="t-label">Letzter Login</span>
          <span className="t-label text-right">Personen</span>
          <span className="t-label text-right">Interakt.</span>
          <span className="t-label text-right">Debriefs</span>
          <span className="t-label text-right">Status</span>
        </div>
        {users.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-ink-3">
            Noch keine Nutzer.
          </p>
        ) : (
          users.map((u) => (
            <div
              key={u.id}
              className="grid min-w-max grid-cols-[minmax(200px,1.5fr)_120px_120px_80px_80px_80px_80px] gap-4 border-b border-rule-soft px-4 py-2.5 text-sm last:border-b-0"
            >
              <span className="truncate text-ink-1" title={u.email}>
                {u.email}
              </span>
              <span className="font-mono text-xs text-ink-3">
                {formatDate(u.created_at)}
              </span>
              <span className="font-mono text-xs text-ink-3">
                {formatDate(u.last_sign_in_at)}
              </span>
              <span className="text-right font-mono text-xs text-ink-2 tabular-nums">
                {u.people_count}
              </span>
              <span className="text-right font-mono text-xs text-ink-2 tabular-nums">
                {u.interactions_count}
              </span>
              <span className="text-right font-mono text-xs text-ink-2 tabular-nums">
                {u.debriefs_count}
              </span>
              <span className="text-right">
                {u.onboarded ? (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-good">
                    ✓ aktiv
                  </span>
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
                    leer
                  </span>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
