import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, ExternalLink, FileText, Paperclip } from 'lucide-react';
import { CrudSection } from '../components/CrudPage';
import { opts, type FieldDef, type Values } from '../components/EntityForm';
import { Badge, IconButton, Label, PageHeader, Select } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useRefs } from '../hooks/data';
import { db } from '../db/db';
import { saveWithAttachment, type Attachable } from '../db/repo';
import type { DocumentRecord } from '../db/types';
import { downloadBlob } from '../lib/backup';
import { formatDate, formatSize, todayISO } from '../lib/utils';

export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const ACCEPTED = '.pdf,.doc,.docx,.odt,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp';
const ACCEPTED_RE = /\.(pdf|docx?|odt|xlsx?|png|jpe?g|gif|webp)$/i;

export async function openDocument(doc: Attachable) {
  if (!doc.fileId) throw new Error('لا يوجد ملف مرفق بهذه الوثيقة.');
  const f = await db.files.get(doc.fileId);
  if (!f) throw new Error('الملف المرفق غير موجود في التخزين المحلي.');
  // Only formats the browser renders safely inline are opened; others are downloaded.
  if (/^(application\/pdf|image\/(png|jpeg|gif|webp))$/.test(f.type)) {
    const url = URL.createObjectURL(f.blob);
    const w = window.open(url, '_blank');
    if (!w) downloadBlob(f.blob, f.name);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    downloadBlob(f.blob, f.name);
  }
}

export async function downloadDocument(doc: Attachable) {
  if (!doc.fileId) throw new Error('لا يوجد ملف مرفق بهذه الوثيقة.');
  const f = await db.files.get(doc.fileId);
  if (!f) throw new Error('الملف المرفق غير موجود في التخزين المحلي.');
  downloadBlob(f.blob, f.name);
}

/** Persist a document with an optional new attachment (replacing the previous one). */
export async function saveDocument(values: Values) {
  const { _file, ...rest } = values;
  const record = rest as unknown as DocumentRecord;
  await saveWithAttachment('documents', record, _file as File | undefined, record.title);
}

export function useDocumentFields(): FieldDef[] {
  const { settings } = useApp();
  const refs = useRefs();
  return [
    { name: 'title', label: 'عنوان الوثيقة', type: 'text', required: true, full: true },
    { name: 'category', label: 'التصنيف', type: 'select', required: true, options: opts(settings.documentCategories) },
    { name: 'reference', label: 'المرجع / العدد', type: 'text' },
    { name: 'date', label: 'التاريخ', type: 'date', required: true },
    { name: 'schoolYear', label: 'السنة الدراسية', type: 'text', required: true },
    { name: 'sender', label: 'المرسل / الجهة', type: 'text' },
    { name: 'classId', label: 'القسم المعني', type: 'select', numeric: true, options: refs.classOptions },
    { name: 'teacherId', label: 'المعلم المعني', type: 'select', numeric: true, options: refs.teacherOptions },
    { name: 'description', label: 'ملخص / ملاحظات', type: 'textarea' },
    { name: 'archived', label: 'نقل إلى الأرشيف', type: 'checkbox' },
  ];
}

export function FilePicker({
  values,
  set,
  label = 'الملف المرفق (PDF، Word، صور…)',
  autoTitle = true,
}: {
  values: Values;
  set: (n: string, v: unknown) => void;
  label?: string;
  autoTitle?: boolean;
}) {
  const [error, setError] = useState('');
  const pending = values._file as File | undefined;
  return (
    <div className="md:col-span-2">
      <Label>{label}</Label>
      <input
        type="file"
        accept={ACCEPTED}
        className="block w-full text-sm file:ml-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:font-semibold file:text-primary-700"
        onChange={(e) => {
          const f = e.target.files?.[0];
          setError('');
          if (!f) return;
          if (!ACCEPTED_RE.test(f.name)) return setError('صيغة الملف غير مدعومة.');
          if (f.size > MAX_FILE_SIZE) return setError(`حجم الملف يتجاوز ${formatSize(MAX_FILE_SIZE)}.`);
          set('_file', f);
          if (autoTitle && !values.title) set('title', f.name.replace(/\.[^.]+$/, ''));
        }}
      />
      {pending ? (
        <p className="mt-1 text-xs text-green-700">سيتم حفظ: {pending.name} ({formatSize(pending.size)})</p>
      ) : values.fileName ? (
        <p className="mt-1 text-xs text-slate-500">الملف الحالي: {String(values.fileName)} — اختر ملفًا جديدًا لاستبداله.</p>
      ) : null}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function documentDefaults(schoolYear: string, category = ''): Values {
  return { title: '', category, reference: '', date: todayISO(), schoolYear, sender: '', classId: undefined, teacherId: undefined, description: '', fileName: '', fileType: '', fileSize: 0, archived: false };
}

export function DocActions({ doc }: { doc: Attachable }) {
  const { run } = useApp();
  if (!doc.fileId) return null;
  return (
    <>
      <IconButton title="عرض الوثيقة" onClick={() => run(() => openDocument(doc))}>
        <ExternalLink className="h-4 w-4" />
      </IconButton>
      <IconButton title="تحميل الوثيقة" onClick={() => run(() => downloadDocument(doc))}>
        <Download className="h-4 w-4" />
      </IconButton>
    </>
  );
}

export function DocumentsPage() {
  const { settings } = useApp();
  const refs = useRefs();
  const fields = useDocumentFields();
  const rows = useLiveQuery(() => db.documents.filter((d) => !d.archived).reverse().sortBy('date'), []);
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  return (
    <div>
      <PageHeader title="المراسلات والوثائق" subtitle="مكتبة الوثائق الإدارية الرقمية (الوثائق المؤرشفة في صفحة الأرشيف)" icon={<FileText />} />
      <div className="mb-3 flex flex-wrap gap-1">
        <button onClick={() => setCategory('')} className={`rounded-full px-3 py-1 text-xs font-semibold ${!category ? 'bg-primary-700 text-white' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
          الكل ({rows?.length ?? 0})
        </button>
        {settings.documentCategories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${category === c ? 'bg-primary-700 text-white' : 'bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
          >
            {c} ({rows?.filter((d) => d.category === c).length ?? 0})
          </button>
        ))}
      </div>
      <CrudSection<DocumentRecord>
        table="documents"
        entityName="وثيقة"
        rows={rows}
        fields={fields}
        defaults={() => documentDefaults(settings.schoolYear, category || settings.documentCategories[0])}
        saveFn={(r) => saveDocument(r as unknown as Values)}
        formExtra={(values, set) => <FilePicker values={values} set={set} />}
        labelOf={(d) => d.title}
        searchOf={(d) => [d.title, d.reference, d.sender, d.description, d.fileName, d.category]}
        filterFn={(d) => (!category || d.category === category) && (!from || d.date >= from) && (!to || d.date <= to)}
        filters={
          <>
            <input type="date" title="من تاريخ" className="rounded-lg border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" title="إلى تاريخ" className="rounded-lg border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={to} onChange={(e) => setTo(e.target.value)} />
            <Select value={category} onChange={setCategory} placeholder="كل الأنواع" options={settings.documentCategories.map((c) => ({ value: c, label: c }))} />
          </>
        }
        extraActions={(d) => <DocActions doc={d} />}
        exportName="الوثائق"
        exportColumns={[
          { header: 'العنوان', value: (d) => d.title },
          { header: 'التصنيف', value: (d) => d.category },
          { header: 'المرجع', value: (d) => d.reference },
          { header: 'التاريخ', value: (d) => d.date },
          { header: 'الجهة', value: (d) => d.sender },
          { header: 'الملف', value: (d) => d.fileName },
        ]}
        columns={[
          {
            header: 'الوثيقة',
            sortValue: (d) => d.title,
            render: (d) => (
              <div>
                <div className="font-semibold">{d.title}</div>
                {d.reference && <div className="text-xs text-slate-500">مرجع: {d.reference}</div>}
              </div>
            ),
          },
          { header: 'التصنيف', render: (d) => <Badge tone="blue">{d.category}</Badge>, sortValue: (d) => d.category },
          { header: 'التاريخ', render: (d) => formatDate(d.date), sortValue: (d) => d.date },
          { header: 'الجهة', render: (d) => d.sender || '—' },
          { header: 'المعني', render: (d) => [d.classId ? refs.className(d.classId) : '', d.teacherId ? refs.teacherName(d.teacherId) : ''].filter(Boolean).join('، ') || '—' },
          {
            header: 'الملف',
            render: (d) =>
              d.fileId ? (
                <span className="flex items-center gap-1 text-xs">
                  <Paperclip className="h-3 w-3" />
                  {formatSize(d.fileSize)}
                </span>
              ) : (
                '—'
              ),
          },
        ]}
      />
    </div>
  );
}
