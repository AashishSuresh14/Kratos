import { useId, type ReactNode } from 'react';

/** First server message for a field; keys from the API may differ in case ("Title" vs "title"). */
export function pickError(errors: Record<string, string[]> | undefined, field: string): string | undefined {
  if (!errors) return undefined;
  const want = field.toLowerCase();
  const key = Object.keys(errors).find((k) => k.toLowerCase() === want || k.toLowerCase().endsWith(`.${want}`));
  return key ? errors[key]?.[0] : undefined;
}

/** Label + control + hint/error, wired with ids for assistive tech. */
export function Field({
  label,
  hint,
  error,
  extra,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  extra?: ReactNode;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <div className="field__label">
        <label htmlFor={id}>{label}</label>
        {extra}
      </div>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <span id={hintId} className="field__hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errId} className="field__error">
          {error}
        </span>
      )}
    </div>
  );
}

/** 1–5 rating as a radio group of segmented buttons. */
export function RatingInput({
  value,
  onChange,
  label,
  disabled,
  allowClear,
}: {
  value: number | null;
  onChange: (v: 1 | 2 | 3 | 4 | 5 | null) => void;
  label: string;
  disabled?: boolean;
  allowClear?: boolean;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          className="seg__btn"
          disabled={disabled}
          onClick={() => onChange(allowClear && value === n ? null : n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/** Toggle chips for picking several options. */
export function ChipMultiSelect({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: { id: string; name: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            className="chip-toggle"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
          >
            {o.name}
          </button>
        );
      })}
    </div>
  );
}
