const LEVELS = Array.from({ length: 11 }, (_, i) => i);

export function painTone(n: number): 'low' | 'mid' | 'high' {
  return n <= 2 ? 'low' : n <= 3 ? 'mid' : 'high';
}

/** 0–10 pain picker in one row. Tapping the chosen value again clears it. */
export function PainStrip({
  value,
  onChange,
  label = 'Pain',
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  label?: string;
}) {
  return (
    <div className="pain">
      <div className="pain-label">
        <span>{label}</span>
        <span className="pain-scale">0 none · 10 worst</span>
      </div>
      <div className="pain-row" role="radiogroup" aria-label={label}>
        {LEVELS.map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={value === n}
            className={'pain-btn' + (value === n ? ` on ${painTone(n)}` : '')}
            onClick={() => onChange(value === n ? undefined : n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
