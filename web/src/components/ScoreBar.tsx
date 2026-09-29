type Tone = 'accent' | 'ai' | 'good' | 'warn' | 'crit' | 'auto';

function autoTone(v: number): Exclude<Tone, 'auto' | 'ai'> {
  if (v >= 70) return 'good';
  if (v >= 50) return 'warn';
  return 'crit';
}

/** Horizontal 0–100 bar with its number. `max` rescales (e.g. confidence 0–1). */
export function ScoreBar({
  value,
  max = 100,
  label,
  tone = 'accent',
  showValue = true,
  suffix = '',
}: {
  value: number;
  max?: number;
  label: string;
  tone?: Tone;
  showValue?: boolean;
  suffix?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const t = tone === 'auto' ? autoTone(pct) : tone;
  const display = max === 1 ? Math.round(value * 100) : Math.round(value);
  return (
    <div className="scorebar">
      <div
        className="scorebar__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className={`scorebar__fill${t === 'accent' ? '' : ` scorebar__fill--${t}`}`} style={{ width: `${pct}%` }} />
      </div>
      {showValue && (
        <span className="scorebar__value">
          {display}
          {suffix}
        </span>
      )}
    </div>
  );
}
