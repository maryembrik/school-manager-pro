import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Printer, School, UserPlus, X } from 'lucide-react';
import { CrudSection } from '../components/CrudPage';
import { ExcelImportButtons } from '../components/ExcelImport';
import { opts, type FieldDef } from '../components/EntityForm';
import { Badge, Button, Card, EmptyState, Loading, PageHeader, Select, Tabs, inputClass } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { useApp } from '../context/AppContext';
import { useRefs } from '../hooks/data';
import { db } from '../db/db';
import { logActivity, saveRecord } from '../db/repo';
import type { ScheduleSlot, SchoolClass } from '../db/types';
import { escapeHtml, exportExcel, htmlTable, printHtml, readSpreadsheet } from '../lib/exporters';
import { CLASS_HEADERS, parseClassRows, skippedSummary } from '../lib/importers';
import { addDays, fullName, round, todayISO } from '../lib/utils';
import { examStats, studentAverage } from '../lib/stats';

export const SCHOOL_DAYS = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];
export const PERIOD_TIMES = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];

export function ClassesPage() {
  const { settings, run, toast } = useApp();
  const refs = useRefs();
  const navigate = useNavigate();
  const [level, setLevel] = useState('');

  const fields: FieldDef[] = useMemo(
    () => [
      { name: 'name', label: 'اسم القسم', type: 'text', required: true, placeholder: 'مثال: 3 أ' },
      { name: 'level', label: 'المستوى الدراسي', type: 'select', required: true, options: opts(settings.levels) },
      { name: 'teacherId', label: 'المعلم الأول', type: 'select', numeric: true, options: refs.teacherOptions },
      { name: 'secondTeacherId', label: 'المعلم الثاني', type: 'select', numeric: true, options: refs.teacherOptions },
      { name: 'room', label: 'القاعة', type: 'text' },
      { name: 'capacity', label: 'طاقة الاستيعاب', type: 'number', min: 0, max: 80 },
      { name: 'notes', label: 'ملاحظات', type: 'textarea' },
    ],
    [settings.levels, refs.teacherOptions],
  );

  const count = (c: SchoolClass) => (refs.students ?? []).filter((s) => s.classId === c.id).length;

  const importFile = (file: File) =>
    run(async () => {
      const rows = await readSpreadsheet(file);
      if (!rows.length) throw new Error('الملف فارغ.');
      const { valid, skipped, unmatchedTeachers } = parseClassRows(rows, await db.classes.toArray(), await db.teachers.toArray(), settings.levels);
      if (!valid.length) throw new Error(`لم يتم العثور على أي قسم جديد.${skippedSummary(skipped)}`);
      const now = new Date().toISOString();
      await db.classes.bulkAdd(valid.map((c) => ({ ...c, createdAt: now, updatedAt: now })));
      await logActivity('استيراد', 'أقسام', `${valid.length} قسم من ${file.name}`);
      // The classes were still created; these teachers can be assigned later from the class form.
      const note = unmatchedTeachers.length ? `\nمعلمون غير مسجلين (لم يُربطوا): ${unmatchedTeachers.slice(0, 8).join('، ')}` : '';
      toast(`تم استيراد ${valid.length} قسم.${skippedSummary(skipped)}${note}`, skipped.length || note ? 'warning' : 'success');
    });

  const downloadTemplate = () => exportExcel<null>([], CLASS_HEADERS.map((h) => ({ header: h, value: () => '' })), 'نموذج-استيراد-الأقسام.xlsx');

  return (
    <div>
      <PageHeader title="إدارة الأقسام" subtitle="الأقسام، الربط بالتلاميذ والمعلمين، وجداول استعمال الزمن" icon={<School />} />
      <CrudSection<SchoolClass>
        table="classes"
        entityName="قسم"
        title="قائمة الأقسام"
        rows={refs.classes}
        fields={fields}
        defaults={() => ({ name: '', level: level || '', teacherId: undefined, secondTeacherId: undefined, room: '', capacity: 30, schedule: [], notes: '' })}
        labelOf={(c) => c.name}
        searchOf={(c) => [c.name, c.level, c.room, refs.teacherName(c.teacherId)]}
        filterFn={(c) => !level || c.level === level}
        filters={<Select value={level} onChange={setLevel} placeholder="كل المستويات" options={settings.levels.map((l) => ({ value: l, label: l }))} />}
        extraValidate={(v) => {
          const dup = (refs.classes ?? []).find((c) => c.name.trim() === String(v.name).trim() && c.id !== v.id);
          return dup ? { name: 'يوجد قسم بنفس الاسم.' } : {};
        }}
        onView={(c) => navigate(`/classes/${c.id}`)}
        toolbar={<ExcelImportButtons onFile={importFile} onTemplate={downloadTemplate} />}
        // Same headers as the import template ("عدد التلاميذ" is ignored on import).
        exportColumns={[
          { header: 'القسم', value: (c) => c.name },
          { header: 'المستوى', value: (c) => c.level },
          { header: 'المعلم الأول', value: (c) => (c.teacherId ? refs.teacherName(c.teacherId) : '') },
          { header: 'المعلم الثاني', value: (c) => (c.secondTeacherId ? refs.teacherName(c.secondTeacherId) : '') },
          { header: 'القاعة', value: (c) => c.room },
          { header: 'طاقة الاستيعاب', value: (c) => c.capacity },
          { header: 'ملاحظات', value: (c) => c.notes },
          { header: 'عدد التلاميذ', value: (c) => count(c) },
        ]}
        exportName="قائمة-الأقسام"
        columns={[
          { header: 'القسم', render: (c) => <span className="font-semibold">{c.name}</span>, sortValue: (c) => c.name },
          { header: 'المستوى', render: (c) => c.level, sortValue: (c) => c.level },
          { header: 'المعلمون', render: (c) => [refs.teacherName(c.teacherId), c.secondTeacherId ? refs.teacherName(c.secondTeacherId) : ''].filter(Boolean).join('، ') },
          {
            header: 'عدد التلاميذ',
            sortValue: (c) => count(c),
            render: (c) => {
              const n = count(c);
              return (
                <span className={c.capacity && n > c.capacity ? 'font-bold text-red-600' : ''}>
                  {n}
                  {c.capacity ? ` / ${c.capacity}` : ''}
                </span>
              );
            },
          },
          { header: 'القاعة', render: (c) => c.room || '—' },
        ]}
      />
    </div>
  );
}

export function ClassDetail() {
  const { id } = useParams();
  const cid = Number(id);
  const navigate = useNavigate();
  const { settings, run, printHeader } = useApp();
  const refs = useRefs();
  const [tab, setTab] = useState<'students' | 'schedule' | 'indicators'>('students');
  const [addId, setAddId] = useState('');
  const cls = useLiveQuery(() => db.classes.get(cid), [cid]);
  const extra = useLiveQuery(async () => {
    const from = addDays(todayISO(), -30);
    const [attendance, exams] = await Promise.all([
      db.studentAttendance.where('classId').equals(cid).filter((a) => a.date >= from).toArray(),
      db.exams.where('classId').equals(cid).toArray(),
    ]);
    const grades = exams.length ? await db.grades.where('examId').anyOf(exams.map((e) => e.id!)).toArray() : [];
    return { attendance, exams, grades };
  }, [cid]);

  if (cls === undefined || !refs.loaded) return <Loading />;
  if (!cls) return <EmptyState message="القسم غير موجود." action={<Button onClick={() => navigate('/classes')}>العودة</Button>} />;

  const students = (refs.students ?? []).filter((s) => s.classId === cid).sort((a, b) => fullName(a).localeCompare(fullName(b), 'ar'));
  const candidates = (refs.students ?? []).filter((s) => s.classId !== cid && (!s.level || s.level === cls.level));

  const assign = (studentId: number, classId: number | undefined) =>
    run(async () => {
      const s = refs.studentMap.get(studentId)!;
      await saveRecord('students', { ...s, classId, level: classId ? cls.level : s.level }, fullName(s));
    }, classId ? 'تم ربط التلميذ بالقسم.' : 'تم سحب التلميذ من القسم.');

  const slot = (day: string, period: number) => cls.schedule?.find((s) => s.day === day && s.period === period);
  const setSlot = (day: string, period: number, patch: Partial<ScheduleSlot>) => {
    const others = (cls.schedule ?? []).filter((s) => !(s.day === day && s.period === period));
    const current = { day, period, subject: '', ...slot(day, period), ...patch };
    const schedule = current.subject ? [...others, current] : others;
    run(() => db.classes.update(cid, { schedule, updatedAt: new Date().toISOString() }));
  };

  const printList = () =>
    run(async () =>
      printHtml(
        `قائمة تلاميذ القسم ${cls.name} (${cls.level})`,
        `<p>المعلم: ${escapeHtml(refs.teacherName(cls.teacherId))} — العدد: ${students.length}</p>` +
          htmlTable(
            students.map((s, i) => ({ ...s, n: i + 1 })),
            [
              { header: 'ع/ر', value: (s) => s.n },
              { header: 'الاسم واللقب', value: (s) => fullName(s) },
              { header: 'الجنس', value: (s) => s.gender },
              { header: 'تاريخ الولادة', value: (s) => s.birthDate },
              { header: 'هاتف الولي', value: (s) => s.guardianPhone },
              { header: 'ملاحظات', value: () => '' },
            ],
          ),
        printHeader,
      ),
    );

  const printSchedule = () =>
    run(async () => {
      const head = `<tr><th>الحصة</th>${SCHOOL_DAYS.map((d) => `<th>${d}</th>`).join('')}</tr>`;
      const body = PERIODS.map(
        (p) =>
          `<tr><th>${p} (${PERIOD_TIMES[p - 1]})</th>${SCHOOL_DAYS.map((d) => {
            const s = slot(d, p);
            return `<td>${s ? escapeHtml(s.subject) + (s.teacherId ? `<br><small>${escapeHtml(refs.teacherName(s.teacherId))}</small>` : '') : ''}</td>`;
          }).join('')}</tr>`,
      ).join('');
      printHtml(`جدول استعمال الزمن — ${cls.name}`, `<table>${head}${body}</table>`, printHeader);
    });

  const att = extra?.attendance ?? [];
  const absent = att.filter((a) => a.status === 'absent').length;
  const presenceRate = att.length ? round(((att.length - absent) / att.length) * 100, 1) : null;
  const avgs = students.map((s) => studentAverage(s.id!, extra?.exams ?? [], extra?.grades ?? [], settings.maxGrade)).filter((x): x is number => x !== null);
  const classAvg = avgs.length ? round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null;
  const boys = students.filter((s) => s.gender === 'ذكر').length;
  const girls = students.filter((s) => s.gender === 'أنثى').length;

  return (
    <div>
      <PageHeader
        title={`القسم ${cls.name}`}
        subtitle={`${cls.level} — ${refs.teacherName(cls.teacherId)}`}
        icon={<School />}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/classes')}>
              <ArrowRight className="h-4 w-4" /> الأقسام
            </Button>
            <Button variant="secondary" onClick={printList}>
              <Printer className="h-4 w-4" /> طباعة القائمة
            </Button>
            <Button variant="secondary" onClick={printSchedule}>
              <Printer className="h-4 w-4" /> طباعة الجدول
            </Button>
          </>
        }
      />
      <Card>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'students', label: `التلاميذ (${students.length})` },
            { id: 'schedule', label: 'جدول استعمال الزمن' },
            { id: 'indicators', label: 'مؤشرات القسم' },
          ]}
        />
        {tab === 'students' && (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <Select
                value={addId}
                onChange={setAddId}
                placeholder="— اختر تلميذًا لإضافته إلى القسم —"
                options={candidates.map((s) => ({ value: String(s.id), label: `${fullName(s)}${s.classId ? ` (حاليًا: ${refs.className(s.classId)})` : ''}` }))}
              />
              <Button
                disabled={!addId}
                onClick={() => {
                  assign(Number(addId), cid);
                  setAddId('');
                }}
              >
                <UserPlus className="h-4 w-4" /> ربط بالقسم
              </Button>
            </div>
            <DataTable
              rows={students}
              emptyMessage="لا يوجد تلاميذ في هذا القسم."
              onRowClick={(s) => navigate(`/students/${s.id}`)}
              columns={[
                { header: 'الاسم واللقب', render: (s) => fullName(s), sortValue: (s) => fullName(s) },
                { header: 'الجنس', render: (s) => s.gender || '—' },
                { header: 'الولي', render: (s) => s.guardianName || '—' },
                { header: 'الهاتف', render: (s) => <span dir="ltr">{s.guardianPhone || '—'}</span> },
              ]}
              actions={(s) => (
                <Button size="sm" variant="ghost" onClick={() => assign(s.id!, undefined)} title="سحب من القسم">
                  <X className="h-4 w-4" />
                </Button>
              )}
            />
          </>
        )}
        {tab === 'schedule' && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border p-2 dark:border-slate-700">الحصة</th>
                  {SCHOOL_DAYS.map((d) => (
                    <th key={d} className="border bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map((p) => (
                  <tr key={p}>
                    <th className="border p-2 text-xs dark:border-slate-700">
                      {p}
                      <div className="font-normal text-slate-400">{PERIOD_TIMES[p - 1]}</div>
                    </th>
                    {SCHOOL_DAYS.map((d) => {
                      const s = slot(d, p);
                      return (
                        <td key={d} className="border p-1 dark:border-slate-700">
                          <select className={`${inputClass} !px-1 !py-1 text-xs`} value={s?.subject ?? ''} onChange={(e) => setSlot(d, p, { subject: e.target.value })}>
                            <option value="">—</option>
                            {settings.subjects.map((sub) => (
                              <option key={sub}>{sub}</option>
                            ))}
                          </select>
                          {s && (
                            <select
                              className={`${inputClass} mt-1 !px-1 !py-0.5 text-[11px]`}
                              value={s.teacherId ?? ''}
                              onChange={(e) => setSlot(d, p, { teacherId: e.target.value ? Number(e.target.value) : undefined })}
                            >
                              <option value="">المعلم</option>
                              {refs.teacherOptions.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-400">يُحفظ الجدول تلقائيًا عند كل تغيير. قائمة المواد قابلة للتعديل من الإعدادات.</p>
          </div>
        )}
        {tab === 'indicators' && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Indicator label="عدد التلاميذ" value={`${students.length}${cls.capacity ? ` / ${cls.capacity}` : ''}`} />
            <Indicator label="ذكور / إناث" value={`${boys} / ${girls}`} />
            <Indicator label="نسبة الحضور (30 يومًا)" value={presenceRate === null ? '—' : `${presenceRate}%`} />
            <Indicator label="الغيابات (30 يومًا)" value={absent} />
            <Indicator label={`معدل القسم / ${settings.maxGrade}`} value={classAvg ?? '—'} />
            <Indicator label="عدد الامتحانات" value={extra?.exams.length ?? 0} />
            <Indicator
              label="نسبة النجاح في آخر امتحان"
              value={(() => {
                const last = [...(extra?.exams ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0];
                if (!last) return '—';
                const st = examStats(last, extra!.grades, settings.passMark, settings.maxGrade);
                return st.passRate === null ? '—' : `${st.passRate}%`;
              })()}
            />
            <Indicator label="تلاميذ يستوجبون المتابعة" value={<Badge tone="orange">{students.filter((s) => s.needsFollowUp).length}</Badge>} />
          </div>
        )}
      </Card>
    </div>
  );
}

function Indicator({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
      <div className="text-xl font-bold text-primary-700 dark:text-primary-100">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
