import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, GraduationCap, Printer } from 'lucide-react';
import { CrudSection } from '../components/CrudPage';
import { ExcelImportButtons } from '../components/ExcelImport';
import { normalizeDate } from '../lib/importers';
import { opts, type FieldDef, type Values } from '../components/EntityForm';
import { Badge, Button, Card, EmptyState, Loading, PageHeader, Select, Tabs } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { useApp } from '../context/AppContext';
import { useRefs } from '../hooks/data';
import { db } from '../db/db';
import { logActivity, statusLabel } from '../db/repo';
import type { Student } from '../db/types';
import { escapeHtml, exportExcel, printHtml, readSpreadsheet, type ExportColumn } from '../lib/exporters';
import { formatDate, formatDateTime, fullName, round } from '../lib/utils';
import { normalizedScore, studentAverage } from '../lib/stats';

export function studentDefaults(level = ''): Values {
  return {
    firstName: '',
    lastName: '',
    gender: '',
    birthDate: '',
    level,
    classId: undefined,
    registrationNumber: '',
    guardianName: '',
    guardianRelation: '',
    guardianPhone: '',
    guardianPhone2: '',
    guardianEmail: '',
    address: '',
    healthNotes: '',
    notes: '',
    needsFollowUp: false,
  };
}

const IMPORT_HEADERS: [keyof Student | 'className', string][] = [
  ['firstName', 'الاسم'],
  ['lastName', 'اللقب'],
  ['gender', 'الجنس'],
  ['birthDate', 'تاريخ الولادة'],
  ['level', 'المستوى'],
  ['className', 'القسم'],
  ['registrationNumber', 'رقم التسجيل'],
  ['guardianName', 'اسم الولي'],
  ['guardianRelation', 'صلة القرابة'],
  ['guardianPhone', 'هاتف الولي'],
  ['guardianEmail', 'البريد الإلكتروني'],
  ['address', 'العنوان'],
  ['notes', 'ملاحظات'],
];

export function StudentsPage() {
  const { settings, run, toast } = useApp();
  const refs = useRefs();
  const navigate = useNavigate();
  const [level, setLevel] = useState('');
  const [classId, setClassId] = useState('');

  const fields: FieldDef[] = useMemo(
    () => [
      { name: 'firstName', label: 'الاسم', type: 'text', required: true },
      { name: 'lastName', label: 'اللقب', type: 'text', required: true },
      { name: 'gender', label: 'الجنس', type: 'select', options: opts(['ذكر', 'أنثى']) },
      { name: 'birthDate', label: 'تاريخ الولادة', type: 'date' },
      { name: 'level', label: 'المستوى', type: 'select', required: true, options: opts(settings.levels) },
      { name: 'classId', label: 'القسم', type: 'select', numeric: true, options: refs.classOptions },
      { name: 'registrationNumber', label: 'رقم التسجيل', type: 'text' },
      { name: 'guardianName', label: 'اسم الولي', type: 'text' },
      { name: 'guardianRelation', label: 'صلة القرابة', type: 'select', options: opts(['الأب', 'الأم', 'الجد', 'الجدة', 'الأخ', 'الأخت', 'كفيل']) },
      { name: 'guardianPhone', label: 'هاتف الولي', type: 'tel' },
      { name: 'guardianPhone2', label: 'هاتف ثانٍ', type: 'tel' },
      { name: 'guardianEmail', label: 'البريد الإلكتروني', type: 'email' },
      { name: 'address', label: 'العنوان', type: 'text', full: true },
      { name: 'healthNotes', label: 'ملاحظات صحية', type: 'textarea' },
      { name: 'notes', label: 'ملاحظات إدارية', type: 'textarea' },
      { name: 'needsFollowUp', label: 'ملف يستوجب المتابعة', type: 'checkbox' },
    ],
    [settings.levels, refs.classOptions],
  );

  const exportColumns: ExportColumn<Student>[] = [
    { header: 'الاسم', value: (s) => s.firstName },
    { header: 'اللقب', value: (s) => s.lastName },
    { header: 'الجنس', value: (s) => s.gender },
    { header: 'تاريخ الولادة', value: (s) => s.birthDate },
    { header: 'المستوى', value: (s) => s.level },
    { header: 'القسم', value: (s) => refs.className(s.classId) },
    { header: 'رقم التسجيل', value: (s) => s.registrationNumber },
    { header: 'اسم الولي', value: (s) => s.guardianName },
    { header: 'صلة القرابة', value: (s) => s.guardianRelation },
    { header: 'هاتف الولي', value: (s) => s.guardianPhone },
    { header: 'البريد الإلكتروني', value: (s) => s.guardianEmail },
    { header: 'العنوان', value: (s) => s.address },
    { header: 'ملاحظات', value: (s) => s.notes },
  ];

  const importFile = async (file: File) => {
    await run(async () => {
      const rows = await readSpreadsheet(file);
      if (!rows.length) throw new Error('الملف فارغ.');
      const classByName = new Map((refs.classes ?? []).map((c) => [c.name.trim(), c]));
      const valid: Student[] = [];
      const skipped: number[] = [];
      const now = new Date().toISOString();
      rows.forEach((r, i) => {
        const get = (h: string) => String(r[h] ?? '').trim();
        const firstName = get('الاسم');
        const lastName = get('اللقب');
        if (!firstName || !lastName) {
          skipped.push(i + 2);
          return;
        }
        const cls = classByName.get(get('القسم'));
        const gender = get('الجنس');
        valid.push({
          ...(studentDefaults() as unknown as Student),
          firstName,
          lastName,
          gender: gender === 'ذكر' || gender === 'أنثى' ? gender : '',
          birthDate: normalizeDate(r['تاريخ الولادة']),
          level: get('المستوى') || cls?.level || '',
          classId: cls?.id,
          registrationNumber: get('رقم التسجيل'),
          guardianName: get('اسم الولي'),
          guardianRelation: get('صلة القرابة'),
          guardianPhone: get('هاتف الولي'),
          guardianEmail: get('البريد الإلكتروني'),
          address: get('العنوان'),
          notes: get('ملاحظات'),
          createdAt: now,
          updatedAt: now,
        });
      });
      if (!valid.length) throw new Error('لم يتم العثور على أي سطر صالح. تأكد من وجود عمودي "الاسم" و"اللقب".');
      await db.students.bulkAdd(valid);
      await logActivity('استيراد', 'تلاميذ', `${valid.length} تلميذ من ${file.name}`);
      toast(`تم استيراد ${valid.length} تلميذ.${skipped.length ? `\nتم تجاهل الأسطر: ${skipped.slice(0, 15).join('، ')} (الاسم أو اللقب مفقود).` : ''}`, skipped.length ? 'warning' : 'success');
    });
  };

  const downloadTemplate = () => {
    exportExcel<null>([], IMPORT_HEADERS.map(([, h]) => ({ header: h, value: () => '' })), 'نموذج-استيراد-التلاميذ.xlsx');
  };

  return (
    <div>
      <PageHeader title="إدارة التلاميذ" subtitle="قاعدة بيانات التلاميذ وملفاتهم الرقمية" icon={<GraduationCap />} />
      <CrudSection<Student>
        table="students"
        entityName="تلميذ"
        title="قائمة التلاميذ"
        rows={refs.students}
        fields={fields}
        defaults={() => studentDefaults(level)}
        labelOf={(s) => fullName(s)}
        searchOf={(s) => [s.firstName, s.lastName, `${s.firstName} ${s.lastName}`, s.registrationNumber, s.guardianName, s.guardianPhone]}
        filterFn={(s) => (!level || s.level === level) && (!classId || String(s.classId) === classId)}
        beforeSave={(v) => {
          // Keep level consistent with the chosen class.
          const cls = v.classId ? refs.classMap.get(v.classId as number) : undefined;
          return cls && !v.level ? { ...v, level: cls.level } : v;
        }}
        extraValidate={(v) => {
          const cls = v.classId ? refs.classMap.get(v.classId as number) : undefined;
          return cls && v.level && cls.level !== v.level ? { classId: `هذا القسم تابع لمستوى "${cls.level}".` } : {};
        }}
        filters={
          <>
            <Select value={level} onChange={setLevel} placeholder="كل المستويات" options={settings.levels.map((l) => ({ value: l, label: l }))} />
            <Select
              value={classId}
              onChange={setClassId}
              placeholder="كل الأقسام"
              options={(refs.classes ?? []).filter((c) => !level || c.level === level).map((c) => ({ value: String(c.id), label: c.name }))}
            />
          </>
        }
        toolbar={<ExcelImportButtons onFile={importFile} onTemplate={downloadTemplate} />}
        exportColumns={exportColumns}
        exportName="قائمة-التلاميذ"
        onView={(s) => navigate(`/students/${s.id}`)}
        columns={[
          { header: 'الاسم واللقب', render: (s) => <span className="font-semibold">{fullName(s)}</span>, sortValue: (s) => `${s.lastName} ${s.firstName}` },
          { header: 'المستوى', render: (s) => s.level, sortValue: (s) => s.level },
          { header: 'القسم', render: (s) => refs.className(s.classId), sortValue: (s) => refs.className(s.classId) },
          { header: 'الولي', render: (s) => s.guardianName || '—' },
          { header: 'الهاتف', render: (s) => <span dir="ltr">{s.guardianPhone || '—'}</span> },
          { header: 'متابعة', render: (s) => (s.needsFollowUp ? <Badge tone="orange">يستوجب المتابعة</Badge> : null) },
        ]}
      />
    </div>
  );
}

export function StudentProfile() {
  const { id } = useParams();
  const sid = Number(id);
  const navigate = useNavigate();
  const { settings, printHeader, run } = useApp();
  const refs = useRefs();
  const [tab, setTab] = useState<'info' | 'attendance' | 'grades' | 'contacts' | 'pedagogy'>('info');
  const data = useLiveQuery(async () => {
    const student = await db.students.get(sid);
    if (!student) return { student: null };
    const [attendance, grades, contacts, pedagogy] = await Promise.all([
      db.studentAttendance.where('studentId').equals(sid).reverse().sortBy('date'),
      db.grades.where('studentId').equals(sid).toArray(),
      db.parentContacts.where('studentId').equals(sid).reverse().sortBy('date'),
      db.pedagogy.where('studentId').equals(sid).toArray(),
    ]);
    const exams = await db.exams.bulkGet([...new Set(grades.map((g) => g.examId))]);
    return { student, attendance, grades, contacts, pedagogy, exams: exams.filter(Boolean) as NonNullable<(typeof exams)[number]>[] };
  }, [sid]);

  if (!data) return <Loading />;
  if (!data.student) return <EmptyState message="التلميذ غير موجود." action={<Button onClick={() => navigate('/students')}>العودة إلى القائمة</Button>} />;
  const s = data.student;
  const absences = data.attendance!.filter((a) => a.status === 'absent');
  const lates = data.attendance!.filter((a) => a.status === 'late');
  const avg = studentAverage(sid, data.exams!, data.grades!, settings.maxGrade);

  const info: [string, string][] = [
    ['الاسم واللقب', fullName(s)],
    ['الجنس', s.gender || '—'],
    ['تاريخ الولادة', formatDate(s.birthDate)],
    ['المستوى', s.level || '—'],
    ['القسم', refs.className(s.classId)],
    ['رقم التسجيل', s.registrationNumber || '—'],
    ['اسم الولي', s.guardianName || '—'],
    ['صلة القرابة', s.guardianRelation || '—'],
    ['هاتف الولي', s.guardianPhone || '—'],
    ['هاتف ثانٍ', s.guardianPhone2 || '—'],
    ['البريد الإلكتروني', s.guardianEmail || '—'],
    ['العنوان', s.address || '—'],
    ['ملاحظات صحية', s.healthNotes || '—'],
    ['ملاحظات إدارية', s.notes || '—'],
  ];

  const printCard = () =>
    run(async () => {
      const rows = info.map(([k, v]) => `<tr><th style="width:30%">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('');
      const gradesRows = data
        .exams!.map((e) => {
          const g = data.grades!.find((x) => x.examId === e.id);
          return `<tr><td>${escapeHtml(e.title)}</td><td>${escapeHtml(e.subject)}</td><td>${escapeHtml(formatDate(e.date))}</td><td>${g?.absent ? 'غائب' : g?.score ?? '—'} / ${e.maxScore}</td></tr>`;
        })
        .join('');
      printHtml(
        `البطاقة الرقمية للتلميذ: ${fullName(s)}`,
        `<table>${rows}</table>
         <h2>السجل المدرسي</h2>
         <table><tr><th>عدد الغيابات</th><td>${absences.length} (${absences.filter((a) => !a.justified).length} غير مبرر)</td><th>عدد التأخرات</th><td>${lates.length}</td><th>المعدل العام</th><td>${avg ?? '—'} / ${settings.maxGrade}</td></tr></table>
         <h2>النتائج</h2><table><thead><tr><th>الامتحان</th><th>المادة</th><th>التاريخ</th><th>العدد</th></tr></thead><tbody>${gradesRows || '<tr><td colspan="4">لا توجد نتائج</td></tr>'}</tbody></table>`,
        printHeader,
      );
    });

  return (
    <div>
      <PageHeader
        title={fullName(s)}
        subtitle={`${s.level} — ${refs.className(s.classId)}`}
        icon={<GraduationCap />}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/students')}>
              <ArrowRight className="h-4 w-4" /> القائمة
            </Button>
            <Button variant="secondary" onClick={printCard}>
              <Printer className="h-4 w-4" /> طباعة البطاقة
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <div className="text-2xl font-bold text-red-600">{absences.length}</div>
          <div className="text-sm text-slate-500">غيابات ({absences.filter((a) => !a.justified).length} غير مبررة)</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold text-orange-500">{lates.length}</div>
          <div className="text-sm text-slate-500">تأخرات</div>
        </Card>
        <Card>
          <div className={`text-2xl font-bold ${avg === null ? '' : avg >= settings.passMark ? 'text-green-600' : 'text-red-600'}`}>{avg ?? '—'}</div>
          <div className="text-sm text-slate-500">المعدل العام / {settings.maxGrade}</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold text-primary-700">{data.contacts!.length}</div>
          <div className="text-sm text-slate-500">اتصالات مع الولي</div>
        </Card>
      </div>
      <Card>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'info', label: 'البيانات الشخصية' },
            { id: 'attendance', label: 'الغياب والتأخر' },
            { id: 'grades', label: 'النتائج والتقييمات' },
            { id: 'contacts', label: 'التواصل مع الولي' },
            { id: 'pedagogy', label: 'التعثرات والدعم' },
          ]}
        />
        {tab === 'info' && (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
            {info.map(([k, v]) => (
              <div key={k} className="border-b border-slate-100 pb-2 dark:border-slate-700">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="whitespace-pre-line font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {tab === 'attendance' && (
          <DataTable
            rows={data.attendance}
            emptyMessage="لا توجد غيابات أو تأخرات مسجلة."
            columns={[
              { header: 'التاريخ', render: (a) => formatDate(a.date), sortValue: (a) => a.date },
              { header: 'الحالة', render: (a) => <Badge tone={a.status === 'absent' ? 'red' : a.status === 'late' ? 'orange' : 'green'}>{statusLabel(a.status)}</Badge> },
              { header: 'السبب', render: (a) => a.reason || '—' },
              { header: 'مبرر', render: (a) => (a.status === 'present' ? '' : a.justified ? 'نعم' : 'لا') },
              { header: 'آخر تعديل', render: (a) => (a.history?.length ? formatDateTime(a.updatedAt) : '—') },
            ]}
          />
        )}
        {tab === 'grades' && (
          <DataTable
            rows={data.exams}
            emptyMessage="لم تُسجَّل أعداد لهذا التلميذ."
            columns={[
              { header: 'الامتحان', render: (e) => e.title },
              { header: 'المادة', render: (e) => e.subject, sortValue: (e) => e.subject },
              { header: 'التاريخ', render: (e) => formatDate(e.date), sortValue: (e) => e.date },
              {
                header: 'العدد',
                render: (e) => {
                  const g = data.grades!.find((x) => x.examId === e.id);
                  return g?.absent ? <Badge tone="red">غائب</Badge> : `${g?.score ?? '—'} / ${e.maxScore}`;
                },
              },
              {
                header: `على ${settings.maxGrade}`,
                render: (e) => {
                  const n = normalizedScore(data.grades!.find((x) => x.examId === e.id), e, settings.maxGrade);
                  return n === null ? '—' : <span className={n >= settings.passMark ? 'text-green-600' : 'text-red-600'}>{round(n)}</span>;
                },
              },
            ]}
          />
        )}
        {tab === 'contacts' && (
          <DataTable
            rows={data.contacts}
            emptyMessage="لا توجد اتصالات مسجلة. أضفها من صفحة متابعة الأولياء."
            columns={[
              { header: 'التاريخ', render: (c) => formatDate(c.date) },
              { header: 'الموضوع', render: (c) => c.subject },
              { header: 'الإجراءات', render: (c) => c.actions || '—' },
              { header: 'النتيجة', render: (c) => c.outcome || '—' },
              { header: 'الحالة', render: (c) => (c.closed ? <Badge tone="green">مغلق</Badge> : <Badge tone="orange">مفتوح</Badge>) },
            ]}
          />
        )}
        {tab === 'pedagogy' && (
          <DataTable
            rows={data.pedagogy}
            emptyMessage="لا توجد تعثرات أو خطط دعم مرتبطة بهذا التلميذ."
            columns={[
              { header: 'النوع', render: (p) => (p.kind === 'difficulties' ? 'رصد تعثر' : p.kind === 'remediation' ? 'خطة دعم' : p.kind) },
              { header: 'العنوان', render: (p) => p.title },
              { header: 'المادة', render: (p) => p.subject || '—' },
              { header: 'التاريخ', render: (p) => formatDate(p.date) },
              { header: 'الحالة', render: (p) => p.status || '—' },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
