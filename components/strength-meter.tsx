"use client";

const LABELS: Record<number, string> = {
  0: "Unbewertet",
  1: "Lose Bekanntschaft",
  2: "Bekannt",
  3: "Vertraut",
  4: "Nah",
  5: "Inner Circle",
};

// Display-only renderer: 5 bars rising in height, lit up to `value`.
// 0 = unrated (all dim, label "Unbewertet").
export function StrengthMeter({
  value,
  showLabel = true,
}: {
  value: number;
  showLabel?: boolean;
}) {
  const v = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <div className="inline-flex items-center gap-2">
      <div className="meter-bars">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`meter-bar${i <= v ? " on" : ""}`}
            aria-hidden
          />
        ))}
      </div>
      {showLabel && (
        <span className="t-label" style={{ letterSpacing: "0.12em" }}>
          {LABELS[v]}
        </span>
      )}
    </div>
  );
}

// Input variant: clickable bars. value=0 means unrated; click bar N to
// set strength to N. Click again on the same bar to clear (useful when
// you misclicked and want unrated again).
export function StrengthMeterInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const v = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <div className="inline-flex items-center gap-3">
      <div className="meter-bars" role="radiogroup" aria-label="Beziehungsstärke">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={v === i}
            onClick={() => onChange(v === i ? 0 : i)}
            title={LABELS[i]}
            className={`meter-bar${i <= v ? " on" : ""} cursor-pointer transition-colors hover:opacity-80`}
            style={{ minWidth: 6, padding: 0, border: 0 }}
          />
        ))}
      </div>
      <span className="t-label" style={{ letterSpacing: "0.12em" }}>
        {LABELS[v]}
      </span>
      {v > 0 && (
        <button
          type="button"
          onClick={() => onChange(0)}
          className="text-[10px] text-ink-4 transition hover:text-bad"
        >
          ×
        </button>
      )}
    </div>
  );
}
