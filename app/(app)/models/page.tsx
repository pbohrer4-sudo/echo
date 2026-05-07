import { getUserContext } from "@/lib/user-context";
import {
  CAPABILITY_LABEL,
  MODELS,
  PROVIDERS,
  TASKS,
  modelsByProvider,
  type CatalogModel,
  type ProviderId,
} from "@/lib/model-catalog";
import { TaskPreferenceRow } from "./task-preference-row";

const USD_PER_EUR_HINT = 0.92;

function fmtPrice(usd: number | null): string {
  if (usd === null) return "—";
  const eur = usd * USD_PER_EUR_HINT;
  return `~€${eur.toFixed(2)} / 1M`;
}

function fmtCharsPrice(usd: number | null): string {
  if (usd === null) return "—";
  const eur = usd * USD_PER_EUR_HINT;
  return `~€${eur.toFixed(2)} / 1M Zeichen`;
}

export default async function ModelsPage() {
  const ctx = await getUserContext();
  const grouped = modelsByProvider();
  const providerOrder: ProviderId[] = [
    "anthropic",
    "openai",
    "google",
    "mistral",
    "meta",
    "elevenlabs",
    "deepgram",
  ];

  const totalCount = MODELS.length;
  const activeCount = MODELS.filter((m) => m.available).length;

  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-6xl space-y-12">
        <header className="space-y-2">
          <p className="t-label">Modelle & KI</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Modelle
          </h1>
          <p className="max-w-2xl text-sm text-ink-3">
            Agnostische KI-Schicht. Pro Aufgabe wählst du ein bevorzugtes
            Modell — die Plattform wächst mit der Technologie. Aktiv heißt
            in ECHO bereits verdrahtet, geplant heißt im Katalog gelistet
            und wartet auf den Provider-Adapter.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <span className="rounded border border-action/40 bg-action-soft px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-action">
              {activeCount} aktiv
            </span>
            <span className="rounded border border-rule bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-3">
              {totalCount - activeCount} geplant
            </span>
            <span className="rounded border border-rule-soft bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-4">
              {totalCount} insgesamt
            </span>
          </div>
        </header>

        {/* Per-task preference editor */}
        <section className="space-y-4">
          <div className="section-head">
            <span className="t-label">Aktive Zuordnung</span>
            <span className="rule" />
          </div>
          <p className="text-xs text-ink-4">
            Welches Modell soll ECHO für welche Aufgabe nutzen. Override
            zeigt sich als Action-Chip — „Default" rechts setzt zurück.
          </p>
          <ul className="overflow-hidden rounded border border-rule bg-paper">
            {TASKS.map((t) => (
              <TaskPreferenceRow
                key={t.id}
                taskId={t.id}
                taskLabel={t.label}
                taskDescription={t.description}
                taskRequires={t.requires}
                defaultModelId={t.default_model}
                currentModelId={ctx?.model_preferences?.[t.id] ?? ""}
              />
            ))}
          </ul>
        </section>

        {/* Catalog table grouped by provider */}
        <section className="space-y-4">
          <div className="section-head">
            <span className="t-label">Katalog</span>
            <span className="rule" />
          </div>

          <div className="overflow-hidden rounded border border-rule bg-paper">
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-4 border-b border-rule bg-paper-2 px-4 py-2.5">
              <span className="t-label">Modell</span>
              <span className="t-label">Input</span>
              <span className="t-label">Output</span>
              <span className="t-label">Capabilities</span>
              <span className="t-label text-right">Status</span>
            </div>

            {providerOrder.map((pid) => {
              const provider = PROVIDERS[pid];
              const list = grouped[pid] ?? [];
              if (list.length === 0) return null;
              return (
                <div key={pid}>
                  <ProviderHeading provider={provider} count={list.length} />
                  {list.map((m) => (
                    <ModelRow key={m.id} model={m} />
                  ))}
                </div>
              );
            })}
          </div>

          <p className="text-xs text-ink-4">
            Preise indikativ in Euro (USD × {USD_PER_EUR_HINT.toFixed(2)})
            ohne Mehrwertsteuer. ECHO selbst legt keinen Aufschlag drauf —
            BYO-Keys gehen direkt zum Provider.
          </p>
        </section>
      </div>
    </div>
  );
}

function ProviderHeading({
  provider,
  count,
}: {
  provider: { id: string; name: string; glyph: string; color: string };
  count: number;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-rule-soft bg-paper-2/50 px-4 py-2">
      <span
        className="flex h-6 w-6 items-center justify-center rounded font-mono text-[10px] font-semibold uppercase"
        style={{
          background: `#${provider.color}20`,
          color: `#${provider.color}`,
          border: `1px solid #${provider.color}60`,
        }}
        aria-hidden
      >
        {provider.glyph}
      </span>
      <span className="text-sm font-medium text-ink-1">{provider.name}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
        {count} {count === 1 ? "Modell" : "Modelle"}
      </span>
    </div>
  );
}

function ModelRow({ model }: { model: CatalogModel }) {
  const provider = PROVIDERS[model.provider];
  const priceInput = model.per_chars_usd
    ? fmtCharsPrice(model.per_chars_usd)
    : fmtPrice(model.input_usd);
  const priceOutput = model.per_chars_usd ? "—" : fmtPrice(model.output_usd);

  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-4 border-b border-rule-soft px-4 py-3 last:border-0 hover:bg-paper-2">
      <div className="flex items-center gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold uppercase"
          style={{
            background: `#${provider.color}15`,
            color: `#${provider.color}`,
            border: `1px solid #${provider.color}50`,
          }}
          aria-hidden
        >
          {provider.glyph}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-1">
            {model.name}
          </p>
          {model.blurb && (
            <p className="truncate text-xs text-ink-4">{model.blurb}</p>
          )}
          {model.context_window_k && (
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4">
              {model.context_window_k}k Context
            </p>
          )}
        </div>
      </div>
      <span className="font-mono text-xs text-ink-2">{priceInput}</span>
      <span className="font-mono text-xs text-ink-2">{priceOutput}</span>
      <div className="flex flex-wrap gap-1">
        {model.capabilities.map((c) => (
          <span
            key={c}
            className="rounded border border-rule-soft bg-paper px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-3"
          >
            {CAPABILITY_LABEL[c]}
          </span>
        ))}
      </div>
      <span
        className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
          model.available
            ? "border-action/40 bg-action-soft text-action"
            : "border-rule-soft bg-paper text-ink-4"
        }`}
      >
        {model.available ? "Aktiv" : "Geplant"}
      </span>
    </div>
  );
}
