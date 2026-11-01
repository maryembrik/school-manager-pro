import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Phone } from 'lucide-react';
import { CrudSection } from '../components/CrudPage';
import { opts, type FieldDef } from '../components/EntityForm';
import { Badge, PageHeader, Select } from '../components/ui';
import { useRefs } from '../hooks/data';
import { db } from '../db/db';
import type { ParentContact } from '../db/types';
import { formatDate, todayISO } from '../lib/utils';

export function ParentsPage() {
  const refs = useRefs();
  const rows = useLiveQuery(() => db.parentContacts.orderBy('date').reverse().toArray(), []);
  const [state, setState] = useState('');
  const today = todayISO();

  const fields: FieldDef[] = [
    { name: 'studentId', label: 'التلميذ المرتبط', type: 'select', numeric: true, options: refs.studentOptions, help: 'يملأ اسم الولي وهاتفه تلقائيًا إن تركتهما فارغين.' },
    { name: 'guardianName', label: 'اسم الولي', type: 'text', required: true },
    { name: 'phone', label: 'رقم الهاتف', type: 'tel' },
    { name: 'date', label: 'تاريخ الاتصال', type: 'date', required: true },
    { name: 'channel', label: 'وسيلة الاتصال', type: 'select', options: opts(['هاتف', 'حضوري', 'رسالة مكتوبة', 'رسالة نصية', 'بريد إلكتروني', 'مجموعة تواصل']) },
    { name: 'initiatedBy', label: 'بمبادرة من', type: 'select', options: opts(['الإدارة', 'الولي', 'المعلم']) },
    { name: 'subject', label: 'موضوع الاتصال', type: 'text', required: true, full: true },
    { name: 'notes', label: 'الملاحظات', type: 'textarea' },
    { name: 'actions', label: 'الإجراءات المتخذة', type: 'textarea' },
    { name: 'outcome', label: 'نتيجة المتابعة', type: 'textarea' },
    { name: 'followUpDate', label: 'تاريخ المتابعة القادمة', type: 'date' },
    { name: 'closed', label: 'تم غلق الملف', type: 'checkbox' },
  ];

  return (
    <div>
      <PageHeader title="متابعة الأولياء" subtitle="سجل التواصل مع الأولياء والإجراءات المتخذة" icon={<Phone />} />
      <CrudSection<ParentContact>
        table="parentContacts"
        entityName="اتصال"
        addLabel="تسجيل اتصال"
        rows={rows}
        fields={fields}
        defaults={() => ({ studentId: undefined, guardianName: '', phone: '', date: today, channel: 'هاتف', initiatedBy: 'الإدارة', subject: '', notes: '', actions: '', outcome: '', followUpDate: '', closed: false })}
        beforeSave={(v) => {
          const s = v.studentId ? refs.studentMap.get(v.studentId as number) : undefined;
          return { ...v, guardianName: v.guardianName || s?.guardianName || '', phone: v.phone || s?.guardianPhone || '' };
        }}
        extraValidate={(v) => {
          const s = v.studentId ? refs.studentMap.get(v.studentId as number) : undefined;
          return !v.guardianName && !s?.guardianName ? { guardianName: 'هذا الحقل إلزامي.' } : {};
        }}
        labelOf={(c) => `${c.guardianName} — ${c.subject}`}
        searchOf={(c) => [c.guardianName, c.phone, c.subject, refs.studentName(c.studentId), c.notes]}
        filterFn={(c) => !state || (state === 'open' ? !c.closed : state === 'due' ? !c.closed && !!c.followUpDate && c.followUpDate <= today : c.closed)}
        filters={<Select value={state} onChange={setState} placeholder="كل الملفات" options={[{ value: 'open', label: 'المفتوحة' }, { value: 'due', label: 'متابعة مستحقة' }, { value: 'closed', label: 'المغلقة' }]} />}
        exportName="متابعة-الأولياء"
        exportColumns={[
          { header: 'الولي', value: (c) => c.guardianName },
          { header: 'التلميذ', value: (c) => refs.studentName(c.studentId) },
          { header: 'الهاتف', value: (c) => c.phone },
          { header: 'التاريخ', value: (c) => c.date },
          { header: 'الوسيلة', value: (c) => c.channel },
          { header: 'الموضوع', value: (c) => c.subject },
          { header: 'الملاحظات', value: (c) => c.notes },
          { header: 'الإجراءات', value: (c) => c.actions },
          { header: 'النتيجة', value: (c) => c.outcome },
          { header: 'الحالة', value: (c) => (c.closed ? 'مغلق' : 'مفتوح') },
        ]}
        columns={[
          { header: 'الولي', render: (c) => <span className="font-semibold">{c.guardianName}</span>, sortValue: (c) => c.guardianName },
          { header: 'التلميذ', render: (c) => refs.studentName(c.studentId), sortValue: (c) => refs.studentName(c.studentId) },
          { header: 'الهاتف', render: (c) => <span dir="ltr">{c.phone || '—'}</span> },
          { header: 'التاريخ', render: (c) => formatDate(c.date), sortValue: (c) => c.date },
          { header: 'الموضوع', render: (c) => c.subject },
          {
            header: 'المتابعة',
            render: (c) =>
              c.closed ? (
                <Badge tone="green">مغلق</Badge>
              ) : c.followUpDate && c.followUpDate <= today ? (
                <Badge tone="red">مستحقة {formatDate(c.followUpDate)}</Badge>
              ) : (
                <Badge tone="orange">{c.followUpDate ? `في ${formatDate(c.followUpDate)}` : 'مفتوح'}</Badge>
              ),
          },
        ]}
      />
    </div>
  );
}
