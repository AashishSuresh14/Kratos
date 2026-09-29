import { useId } from 'react';
import type { RiskLevel } from '../api/types';

const LABEL: Record<RiskLevel, string> = { Low: 'Low risk', Medium: 'Medium risk', High: 'High risk' };

/** Shape encodes the level too, so risk is never communicated by colour alone. */
function RiskShape({ level }: { level: RiskLevel }) {
  return (
    <svg className="pill__icon" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      {level === 'Low' && <circle cx="5" cy="5" r="4" fill="currentColor" />}
      {level === 'Medium' && <path d="M5 1 L9.2 8.6 H0.8 Z" fill="currentColor" />}
      {level === 'High' && <path d="M5 0.6 L9.4 5 L5 9.4 L0.6 5 Z" fill="currentColor" />}
    </svg>
  );
}

export function RiskPill({ level, reasons, compact }: { level: RiskLevel; reasons?: string[]; compact?: boolean }) {
  const id = useId();
  const label = compact ? level : LABEL[level];
  if (!reasons || reasons.length === 0) {
    return (
      <span className={`pill pill--${level}`} data-testid="risk-pill">
        <RiskShape level={level} />
        {label}
      </span>
    );
  }
  return (
    <span className="tip">
      <button
        type="button"
        className={`pill pill--${level} pill--button`}
        aria-describedby={id}
        data-testid="risk-pill"
        aria-label={`${LABEL[level]}: ${reasons.length} reason${reasons.length > 1 ? 's' : ''}`}
      >
        <RiskShape level={level} />
        {label}
      </button>
      <span role="tooltip" id={id} className="tip__bubble">
        <strong>Why {LABEL[level].toLowerCase()}</strong>
        <ul>
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </span>
    </span>
  );
}
