import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, Pencil, Plus, Printer, Trash2, Eye } from 'lucide-react';
import { DataTable, type Column } from './DataTable';
import { EntityFormModal, type FieldDef, type Values } from './EntityForm';
import { Button, Card, IconButton, SearchInput, useConfirm } from './ui';
import { useApp } from '../context/AppContext';
import type { DataTableName } from '../db/db';
import { deleteRecord, saveRecord } from '../db/repo';
import { exportExcel, htmlTable, printHtml, type ExportColumn } from '../lib/exporters';
import { matches } from '../lib/utils';
import type { BaseRecord } from '../db/types';

/**
 * Generic list + add/edit/delete screen for a table. Each module supplies its fields,
 * columns and labels; persistence, validation, confirmation, toasts and export are shared.
 */
export function CrudSection<T extends BaseRecord>({
  table,
  rows,
  fields,
  columns,
  defaults,
  labelOf,
  searchOf,
  entityName,
  exportColumns,
  exportName,
  filters,
  filterFn,
  onView,
  extraActions,
  toolbar,
  beforeSave,
  extraValidate,
  formExtra,
  title,
  emptyMessage,
  addLabel,
  quickAdd = true,
  saveFn,
}: {
  quickAdd?: boolean;
  saveFn?: (record: T) => Promise<unknown>;
  table: DataTableName;
  rows: T[] | undefined;
  fields: FieldDef[];
  columns: Column<T>[];
  defaults: () => Values;
  labelOf: (r: T) => string;
  searchOf: (r: T) => (string | number | undefined)[];
  entityName: string;
  exportColumns?: ExportColumn<T>[];
  exportName?: string;
  filters?: ReactNode;
  filterFn?: (r: T) => boolean;
  onView?: (r: T) => void;
  extraActions?: (r: T) => ReactNode;
  toolbar?: ReactNode;
  beforeSave?: (v: Values) => Values;
  extraValidate?: (v: Values) => Record<string, string | undefined>;
  formExtra?: (values: Values, set: (name: string, v: unknown) => void) => ReactNode;
  title?: string;
  emptyMessage?: string;
  addLabel?: string;
}) {
  const { run, printHeader } = useApp();
  const confirm = useConfirm();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Values | null>(null);
  const [params, setParams] = useSearchParams();

  // Quick-add from the header opens the form directly (`?new=1`).
  useEffect(() => {
    if (quickAdd && params.get('new') === '1') {
      setEditing(defaults());
      params.delete('new');
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const filtered = useMemo(
    () => rows?.filter((r) => (filterFn ? filterFn(r) : true) && matches(searchOf(r), query)),
    [rows, filterFn, searchOf, query],
  );

  const save = (values: Values) => {
    const v = beforeSave ? beforeSave(values) : values;
    return run(() => (saveFn ? saveFn(v as T) : saveRecord(table, v as T, labelOf(v as T))), values.id ? `تم تعديل ${entityName} بنجاح.` : `تمت إضافة ${entityName} بنجاح.`);
  };

  const remove = async (r: T) => {
    const ok = await confirm({ message: `هل تريد حذف ${entityName} "${labelOf(r)}"؟\nلا يمكن التراجع عن هذه العملية.` });
    if (ok) await run(() => deleteRecord(table, r.id!, labelOf(r)), `تم حذف ${entityName}.`);
  };

  const doExport = () => {
    if (!exportColumns || !filtered) return;
    exportExcel(filtered, exportColumns, `${exportName ?? table}.xlsx`);
  };

  const doPrint = () => {
    if (!exportColumns || !filtered) return;
    run(async () => printHtml(title ?? exportName ?? entityName, htmlTable(filtered, exportColumns), printHeader));
  };

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} />
        {filters}
        <div className="flex-1" />
        {toolbar}
        {exportColumns && (
          <>
            <Button variant="secondary" onClick={doExport} title="تصدير Excel">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button variant="secondary" onClick={doPrint} title="طباعة أو حفظ PDF">
              <Printer className="h-4 w-4" /> PDF
            </Button>
          </>
        )}
        <Button onClick={() => setEditing(defaults())}>
          <Plus className="h-4 w-4" /> {addLabel ?? `إضافة ${entityName}`}
        </Button>
      </div>
      <DataTable
        rows={filtered}
        columns={columns}
        emptyMessage={emptyMessage ?? (query ? 'لا توجد نتائج مطابقة للبحث.' : `لم تتم إضافة أي ${entityName} بعد.`)}
        onRowClick={onView}
        actions={(r) => (
          <>
            {onView && (
              <IconButton title="عرض" onClick={() => onView(r)}>
                <Eye className="h-4 w-4" />
              </IconButton>
            )}
            {extraActions?.(r)}
            <IconButton title="تعديل" onClick={() => setEditing({ ...(r as Values) })}>
              <Pencil className="h-4 w-4" />
            </IconButton>
            <IconButton title="حذف" tone="danger" onClick={() => remove(r)}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </>
        )}
      />
      <EntityFormModal
        open={!!editing}
        title={editing?.id ? `تعديل ${entityName}` : `إضافة ${entityName}`}
        fields={fields}
        initial={editing ?? {}}
        onClose={() => setEditing(null)}
        onSubmit={save}
        extraValidate={extraValidate}
      >
        {formExtra}
      </EntityFormModal>
    </Card>
  );
}
