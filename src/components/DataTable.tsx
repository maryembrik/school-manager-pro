import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDownUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState, Loading } from './ui';

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  sortValue?: (row: T) => string | number;
  className?: string;
}

export function DataTable<T extends { id?: number }>({
  rows,
  columns,
  actions,
  emptyMessage,
  pageSize = 25,
  onRowClick,
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  actions?: (row: T) => ReactNode;
  emptyMessage?: string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
}) {
  const [sort, setSort] = useState<{ index: number; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!rows) return undefined;
    if (!sort) return rows;
    const get = columns[sort.index].sortValue!;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ar')) * sort.dir;
    });
  }, [rows, sort, columns]);

  if (!sorted) return <Loading />;
  if (!sorted.length) return <EmptyState message={emptyMessage} />;

  const pages = Math.ceil(sorted.length / pageSize);
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            <tr>
              {columns.map((c, i) => (
                <th key={c.header} className={`px-3 py-2 text-right font-semibold ${c.className ?? ''}`}>
                  {c.sortValue ? (
                    <button
                      className="inline-flex items-center gap-1 hover:text-primary-700"
                      onClick={() => setSort((s) => (s?.index === i ? { index: i, dir: (s.dir * -1) as 1 | -1 } : { index: i, dir: 1 }))}
                    >
                      {c.header}
                      <ArrowDownUp className={`h-3 w-3 ${sort?.index === i ? 'text-primary-700' : 'opacity-40'}`} />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
              {actions && <th className="px-3 py-2 text-right font-semibold">إجراءات</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {visible.map((row, idx) => (
              <tr
                key={row.id ?? idx}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60 ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((c) => (
                  <td key={c.header} className={`px-3 py-2 align-middle ${c.className ?? ''}`}>
                    {c.render(row)}
                  </td>
                ))}
                {actions && (
                  <td className="px-3 py-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">{actions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>العدد: {sorted.length}</span>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <button disabled={current === 0} onClick={() => setPage(current - 1)} className="rounded p-1 disabled:opacity-30" aria-label="السابق">
              <ChevronRight className="h-4 w-4" />
            </button>
            <span>
              {current + 1} / {pages}
            </span>
            <button disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className="rounded p-1 disabled:opacity-30" aria-label="التالي">
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
