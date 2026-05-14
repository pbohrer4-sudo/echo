import { StepIndicator } from "../step-indicator";
import { completeFirstPerson, skipFirstPerson } from "../actions";

export default async function FirstPersonStep() {
  return (
    <div className="space-y-8">
      <StepIndicator current="first_person" />
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
          Lege deine erste Person an.
        </h1>
        <p className="text-sm leading-relaxed text-ink-3">
          Wer fällt dir spontan ein, wenn du an einen wichtigen Menschen
          denkst? Nur Name reicht — Tiefe, Zweck und Kontaktdaten kannst du
          später ergänzen, oder per Voice einsprechen.
        </p>
      </div>

      <form action={completeFirstPerson} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="t-label">Name</span>
          <input
            type="text"
            name="name"
            required
            placeholder="z.B. Marvin Schmidt"
            className="h-11 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="t-label">Firma (optional)</span>
            <input
              type="text"
              name="company"
              placeholder="z.B. Stripe"
              className="h-11 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="t-label">Rolle (optional)</span>
            <input
              type="text"
              name="role"
              placeholder="z.B. Head of Sales"
              className="h-11 w-full rounded border border-rule bg-paper px-3 text-sm text-ink-1 outline-none transition focus:border-action focus:ring-2 focus:ring-action/20"
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="submit"
            formAction={skipFirstPerson}
            className="text-xs text-ink-3 transition hover:text-ink-1"
          >
            Überspringen
          </button>
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded border border-action bg-action px-5 text-sm font-medium text-paper transition hover:shadow-[0_0_0_3px_var(--action-ring)]"
          >
            Anlegen →
          </button>
        </div>
      </form>
    </div>
  );
}
