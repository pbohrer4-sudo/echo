import { PulseRunner } from "@/components/pulse-runner";

export default function PulsePage() {
  return (
    <div className="px-8 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <p className="t-label">Sonntags-Puls</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink-1">
            Wochenrhythmus
          </h1>
          <p className="text-sm text-ink-3">
            Wer war länger nicht auf dem Schirm, welche Versprechen sind
            offen, welche Geburtstage stehen an.
          </p>
        </header>

        <PulseRunner />
      </div>
    </div>
  );
}
