import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArchiveRestore, FolderArchive } from 'lucide-react';
import { CrudSection } from '../components/CrudPage';
import type { Values } from '../components/EntityForm';
import { Badge, Button, IconButton, PageHeader, Select, useConfirm } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useRefs } from '../hooks/data';
import { db } from '../db/db';
import { logActivity } from '../db/repo';
import type { DocumentRecord } from '../db/types';
import { formatDate, formatSize } from '../lib/utils';
import { DocActions, FilePicker, documentDefaults, saveDocument, useDocumentFields } from './Documents';

export function ArchivePage() {
  const { settings, run } = useApp();
  const confirm = useConfirm();
  const refs = useRefs();
  const fields = useDocumentFields();
  const rows = useLiveQuery(() => db.documents.reverse().sortBy('date'), []);
  const [year, setYear] = useState('');
  const [category, setCategory] = useState('');
  const [classId, setClassId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [state, setState] = useState('archived');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const years = useMemo(() => [...new Set([settings.schoolYear, ...(rows ?? []).map((d) => d.schoolYear).filter(Boolean)])].sort().reverse(), [rows, settings.schoolYear]);

  const toggle = (d: DocumentRecord) =>
    run(async () => {
      await db.documents.update(d.id!, { archived: !d.archived, updatedAt: new Date().toISOString() });
      await logActivity('تعديل', 'وثيقة', `${d.title} (${d.archived ? 'استرجاع من الأرشيف' : 'أرشفة'})`);
    }, d.archived ? 'تم استرجاع الوثيقة إلى المكتبة.' : 'تمت أرشفة الوثيقة.');

  const archiveYear = async () => {
    const target = year || settings.schoolYear;
    const count = (rows ?? []).filter((d) => d.schoolYear === target && !d.archived).length;
    if (!count) return run(async () => undefined, 'لا توجد وثائق غير مؤرشفة لهذه السنة.');
    if (await confirm({ title: 'أرشفة سنة دراسية', message: `نقل ${count} وثيقة من السنة ${target} إلى الأرشيف؟`, confirmLabel: 'أرشفة', danger: false })) {
      await run(async () => {
        await db.documents.where('schoolYear').equals(target).modify({ archived: true });
        await logActivity('تعديل', 'أرشيف', `أرشفة وثائق السنة ${target}`);
      }, `تمت أرشفة ${count} وثيقة.`);
    }
  };

  return (
    <div>
      <PageHeader
        title="الأرشيف الرقمي"
        subtitle="بحث سريع واسترجاع حسب السنة والنوع والقسم والمعلم والتاريخ"
        icon={<Archive />}
        actions={
          <Button variant="secondary" onClick={archiveYear}>
            <FolderArchive className="h-4 w-4" /> أرشفة وثائق سنة {year || settings.schoolYear}
          </Button>
        }
      />
      <CrudSection<DocumentRecord>
        table="documents"
        entityName="وثيقة"
        addLabel="إضافة إلى الأرشيف"
        rows={rows}
        fields={fields}
        quickAdd={false}
        defaults={() => ({ ...documentDefaults(year || settings.schoolYear, category || settings.documentCategories[0]), archived: true })}
        saveFn={(r) => saveDocument(r as unknown as Values)}
        formExtra={(values, set) => <FilePicker values={values} set={set} />}
        labelOf={(d) => d.title}
        searchOf={(d) => [d.title, d.reference, d.sender, d.description, d.fileName, d.category, d.schoolYear]}
        filterFn={(d) =>
          (state === 'all' || (state === 'archived' ? d.archived : !d.archived)) &&
          (!year || d.schoolYear === year) &&
          (!category || d.category === category) &&
          (!classId || String(d.classId) === classId) &&
          (!teacherId || String(d.teacherId) === teacherId) &&
          (!from || d.date >= from) &&
          (!to || d.date <= to)
        }
        filters={
          <>
            <Select value={state} onChange={setState} options={[{ value: 'archived', label: 'المؤرشفة' }, { value: 'active', label: 'غير المؤرشفة' }, { value: 'all', label: 'كل الوثائق' }]} />
            <Select value={year} onChange={setYear} placeholder="كل السنوات" options={years.map((y) => ({ value: y, label: y }))} />
            <Select value={category} onChange={setCategory} placeholder="كل الأنواع" options={settings.documentCategories.map((c) => ({ value: c, label: c }))} />
            <Select value={classId} onChange={setClassId} placeholder="كل الأقسام" options={refs.classOptions.map((o) => ({ value: String(o.value), label: o.label }))} />
            <Select value={teacherId} onChange={setTeacherId} placeholder="كل المعلمين" options={refs.teacherOptions.map((o) => ({ value: String(o.value), label: o.label }))} />
            <input type="date" title="من تاريخ" className="rounded-lg border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" title="إلى تاريخ" className="rounded-lg border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        }
        extraActions={(d) => (
          <>
            <DocActions doc={d} />
            <IconButton title={d.archived ? 'استرجاع إلى المكتبة' : 'أرشفة'} onClick={() => toggle(d)}>
              {d.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            </IconButton>
          </>
        )}
        exportName="الأرشيف"
        exportColumns={[
          { header: 'العنوان', value: (d) => d.title },
          { header: 'السنة', value: (d) => d.schoolYear },
          { header: 'النوع', value: (d) => d.category },
          { header: 'التاريخ', value: (d) => d.date },
          { header: 'القسم', value: (d) => (d.classId ? refs.className(d.classId) : '') },
          { header: 'المعلم', value: (d) => (d.teacherId ? refs.teacherName(d.teacherId) : '') },
          { header: 'الملف', value: (d) => d.fileName },
        ]}
        columns={[
          { header: 'الوثيقة', render: (d) => <span className="font-semibold">{d.title}</span>, sortValue: (d) => d.title },
          { header: 'السنة', render: (d) => d.schoolYear, sortValue: (d) => d.schoolYear },
          { header: 'النوع', render: (d) => <Badge tone="blue">{d.category}</Badge>, sortValue: (d) => d.category },
          { header: 'التاريخ', render: (d) => formatDate(d.date), sortValue: (d) => d.date },
          { header: 'القسم / المعلم', render: (d) => [d.classId ? refs.className(d.classId) : '', d.teacherId ? refs.teacherName(d.teacherId) : ''].filter(Boolean).join('، ') || '—' },
          { header: 'الملف', render: (d) => (d.fileId ? formatSize(d.fileSize) : '—') },
          { header: 'الحالة', render: (d) => (d.archived ? <Badge>مؤرشفة</Badge> : <Badge tone="green">نشطة</Badge>) },
        ]}
      />
    </div>
  );
}
