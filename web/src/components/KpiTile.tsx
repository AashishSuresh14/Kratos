import type { ReactNode } from 'react';

export function KpiTile({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: 'crit' | 'warn';
}) {
  return (
    <div className={`kpi${tone ? ` kpi--${tone}` : ''}`}>
      <span className="kpi__label">{label}</span>
      <span className="kpi__value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {hint && <span className="kpi__hint">{hint}</span>}
    </div>
  );
}
