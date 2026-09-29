import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabDef {
  id: string;
  label: ReactNode;
  count?: number;
}

/** WAI-ARIA tabs with roving focus (arrow keys, Home/End). Panels use `tabPanelProps`. */
export function Tabs({
  tabs,
  active,
  onChange,
  label,
  idPrefix = 'tab',
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  label: string;
  idPrefix?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(tabs[next].id);
      refs.current[next]?.focus();
    }
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`${idPrefix}-${t.id}`}
          aria-selected={t.id === active}
          aria-controls={`${idPrefix}-panel-${t.id}`}
          tabIndex={t.id === active ? 0 : -1}
          className="tab"
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
          {t.count !== undefined && <span className="tab__count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const tabPanelProps = (idPrefix: string, id: string) => ({
  role: 'tabpanel' as const,
  id: `${idPrefix}-panel-${id}`,
  'aria-labelledby': `${idPrefix}-${id}`,
  tabIndex: 0,
});
