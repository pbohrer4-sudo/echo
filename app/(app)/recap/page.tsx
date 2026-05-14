import { RecapRunner } from "@/components/recap-runner";
import { APP_CONFIG } from "@/lib/config";

export default function RecapPage() {
  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Rückblick</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Was war
          </h1>
          <p className="text-sm text-ink-3">
            Monats- oder Jahresrückblick — Zahlen plus eine ruhige
            Zusammenfassung von {APP_CONFIG.PUBLIC_NAME}.
          </p>
        </header>

        <RecapRunner />
      </div>
    </div>
  );
}
