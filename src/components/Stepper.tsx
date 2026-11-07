import { useEffect, useState } from 'react';

interface Props {
  value: number | undefined;
  step: number;
  min?: number;
  unit: string;
  onChange: (v: number) => void;
  label: string;
  decimals?: boolean;
}

function fmt(v: number | undefined) {
  if (v === undefined || Number.isNaN(v)) return '';
  return String(Math.round(v * 100) / 100);
}

export function Stepper({ value, step, min = 0, unit, onChange, label, decimals }: Props) {
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]);

  const commit = (raw: string) => {
    const n = parseFloat(raw.replace(',', '.'));
    if (Number.isNaN(n)) setText(fmt(value));
    else onChange(Math.max(min, n));
  };
  const bump = (d: number) => {
    const next = Math.max(min, Math.round(((value ?? 0) + d) * 100) / 100);
    onChange(next);
  };

  return (
    <div className="stepper">
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => bump(-step)}>
        −
      </button>
      <label>
        <input
          aria-label={label}
          inputMode={decimals ? 'decimal' : 'numeric'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span className="unit">{unit}</span>
      </label>
      <button type="button" aria-label={`Increase ${label}`} onClick={() => bump(step)}>
        +
      </button>
    </div>
  );
}

/** A number you tap to edit (opens the number keyboard), for values that rarely change. */
export function NumInput({
  value,
  min = 0,
  unit,
  onChange,
  label,
  decimals,
}: {
  value: number | undefined;
  min?: number;
  unit?: string;
  onChange: (v: number) => void;
  label: string;
  decimals?: boolean;
}) {
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]);
  const commit = (raw: string) => {
    const n = parseFloat(raw.replace(',', '.'));
    if (Number.isNaN(n)) setText(fmt(value));
    else onChange(Math.max(min, decimals ? n : Math.round(n)));
  };
  return (
    <label className="numin">
      <input
        aria-label={label}
        inputMode={decimals ? 'decimal' : 'numeric'}
        value={text}
        placeholder="0"
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {unit && <span className="unit">{unit}</span>}
    </label>
  );
}
