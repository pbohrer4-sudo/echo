// Placeholder for the Payments tab on the self profile. Will later
// host subscription state, invoice history, and saved payment
// methods. Kept as a simple coming-soon card for now so the tab is
// real (clickable, hash-stable) without misleading content.
export function PaymentsTab() {
  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-dashed border-rule bg-paper-2 px-6 py-10 text-center">
        <p className="t-label mb-2">In Arbeit</p>
        <h2 className="text-lg font-semibold tracking-tight text-ink-1">
          Payments
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-3">
          Hier landen demnächst dein Abonnement-Status, vergangene
          Rechnungen und hinterlegte Zahlungsmethoden — sobald ECHO
          eine bezahlte Stufe hat.
        </p>
      </div>

      {/* Skeleton-Cards für die spätere Struktur — damit der Tab
          schon jetzt eine sinnvolle Form hat. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-rule bg-paper p-4 opacity-60">
          <p className="t-label mb-1">Plan</p>
          <p className="text-sm text-ink-3">Kein aktiver Plan</p>
        </div>
        <div className="rounded-xl border border-rule bg-paper p-4 opacity-60">
          <p className="t-label mb-1">Nächste Rechnung</p>
          <p className="text-sm text-ink-3">—</p>
        </div>
        <div className="rounded-xl border border-rule bg-paper p-4 opacity-60 sm:col-span-2">
          <p className="t-label mb-1">Zahlungsmethoden</p>
          <p className="text-sm text-ink-3">Noch nichts hinterlegt.</p>
        </div>
      </div>
    </section>
  );
}
