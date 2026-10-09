import { useMemo, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /** Return a comparable value to make the column sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  width?: string;
  minWidth?: string;
  className?: string;
}

interface Props<T> {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  /** Row-level actions rendered in the last column (inline actions, no modal needed to see them). */
  actions?: (row: T) => ReactNode;
  caption: string;
  footer?: ReactNode;
  pageSize?: number;
}

/** The table every list uses: sortable headers, clickable rows, inline actions, client paging. */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, selectedKey, actions, caption, footer, pageSize = 25 }: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" style={{ width: c.width, minWidth: c.minWidth }} className={`${c.sortValue ? 'th--sort' : ''} ${c.align === 'right' ? 'th--num' : ''}`}
                    aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
                    onClick={c.sortValue ? () => setSort(active && sort!.dir === -1 ? null : { key: c.key, dir: active ? -1 : 1 }) : undefined}>
                    {c.header}{active && <Icon name={sort!.dir === 1 ? 'chevron-up' : 'chevron-down'} size={12} />}
                  </th>
                );
              })}
              {actions && <th scope="col"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const key = rowKey(row);
              return (
                <tr key={key} className={`${onRowClick ? 'tr--clickable' : ''} ${selectedKey === key ? 'tr--selected' : ''}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row); } : undefined}
                  tabIndex={onRowClick ? 0 : undefined}>
                  {columns.map((c) => <td key={c.key} style={{ minWidth: c.minWidth }} className={`${c.align === 'right' ? 'td--num' : ''} ${c.className ?? ''}`}>{c.render(row)}</td>)}
                  {actions && <td className="td--actions" onClick={(e) => e.stopPropagation()}>{actions(row)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span>{sorted.length === 0 ? 'No rows' : `Showing ${safePage * pageSize + 1}–${Math.min(sorted.length, (safePage + 1) * pageSize)} of ${sorted.length}`}</span>
        {footer}
        {pages > 1 && (
          <span className="row">
            <button type="button" className="btn btn--secondary btn--sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
            <span className="num">Page {safePage + 1} / {pages}</span>
            <button type="button" className="btn btn--secondary btn--sm" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>Next</button>
          </span>
        )}
      </div>
    </>
  );
}
