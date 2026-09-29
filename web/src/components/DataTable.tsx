import { useMemo, useState, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Provide to make the column sortable. */
  sortValue?: (row: T) => string | number | null;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  /** Plain-text header for aria when `header` is not a string. */
  label?: string;
}

type Dir = 'asc' | 'desc';

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  initialSort,
  empty,
  compact,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  initialSort?: { key: string; dir: Dir };
  empty?: ReactNode;
  compact?: boolean;
  rowClassName?: (row: T) => string | undefined;
}) {
  const [sort, setSort] = useState<{ key: string; dir: Dir } | null>(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.dir === 'asc' ? r : -r;
    });
  }, [rows, sort, columns]);

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <div className="table-wrap">
      <table className={`table${compact ? ' table--compact' : ''}`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={c.sortValue ? (ariaSort ?? 'none') : undefined}
                  className={c.align === 'right' ? 'is-right' : c.align === 'center' ? 'is-center' : undefined}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.sortValue ? (
                    <button type="button" className="sort-btn" onClick={() => toggle(c.key)}>
                      {c.header}
                      <SortIcon dir={active ? sort.dir : null} />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{empty ?? <span className="muted">Nothing to show.</span>}</td>
            </tr>
          ) : (
            sorted.map((r) => (
              <tr key={rowKey(r)} className={rowClassName?.(r)}>
                {columns.map((c) => (
                  <td key={c.key} className={c.align === 'right' ? 'is-right' : c.align === 'center' ? 'is-center' : undefined}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SortIcon({ dir }: { dir: Dir | null }) {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path d="M5 1 L8 4 H2 Z" fill="currentColor" opacity={dir === 'asc' ? 1 : 0.3} />
      <path d="M5 9 L2 6 H8 Z" fill="currentColor" opacity={dir === 'desc' ? 1 : 0.3} />
    </svg>
  );
}

