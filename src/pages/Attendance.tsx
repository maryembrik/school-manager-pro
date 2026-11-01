import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCheck, ClipboardCheck, FileSpreadsheet, History, Printer } from 'lucide-react';
import { CrudSection } from '../components/CrudPage';
import { opts, type FieldDef } from '../components/EntityForm';
import { Badge, Button, Card, EmptyState, Label, Loading, PageHeader, Select, Tabs, inputClass } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { useApp } from '../context/AppContext';
import { useRefs } from '../hooks/data';
import { db } from '../db/db';
import { logActivity, saveTeacherAttendance, setStudentAttendance, statusLabel } from '../db/repo';
import type { StudentAttendance, StudentAttendanceStatus, TeacherAttendance } from '../db/types';
import { exportExcel, htmlTable, printHtml, type ExportColumn } from '../lib/exporters';
import { addDays, dayName, endOfMonth, formatDate, formatDateTime, fullName, startOfMonth, startOfWeek, todayISO } from '../lib/utils';
import { repeatedAbsences } from '../lib/stats';

export const TEACHER_ATT_LABEL: Record<TeacherAttendance['type'], string> = { absent: 'غياب', late: 'تأخير', leave: 'رخصة' };

type TabId = 'daily' | 'teachers' | 'repeated' | 'reports';

export function AttendancePage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) || 'daily';
  return (
    <div>
      <PageHeader title="الحضور والغياب" subtitle="المتابعة اليومية لحضور التلاميذ والمعلمين" icon={<ClipboardCheck />} />
      <Tabs<TabId>
        value={tab}
        onChange={(t) => setParams({ tab: t })}
        tabs={[
          { id: 'daily', label: 'تسجيل حضور التلاميذ' },
          { id: 'teachers', label: 'غياب المعلمين والرخص' },
          { id: 'repeated', label: 'الغيابات المتكررة' },
          { id: 'reports', label: 'التقارير الأسبوعية والشهرية' },
        ]}
      />
      {tab === 'daily' && <DailyAttendance />}
      {tab === 'teachers' && <TeacherAttendanceSection />}
      {tab === 'repeated' && <RepeatedAbsences />}
      {tab === 'reports' && <AttendanceReports />}
    </div>
  );
}

function DailyAttendance() {
  const { run } = useApp();
  const refs = useRefs();
  const [date, setDate] = useState(todayISO());
  const [classId, setClassId] = useState('');
  const [historyOf, setHistoryOf] = useState<StudentAttendance | null>(null);

  useEffect(() => {
    if (!classId && refs.classes?.length) setClassId(String(refs.classes[0].id));
  }, [refs.classes, classId]);

  const records = useLiveQuery(() => db.studentAttendance.where('date').equals(date).toArray(), [date]);
  const recordMap = useMemo(() => new Map((records ?? []).map((r) => [r.studentId, r])), [records]);
  const students = (refs.students ?? []).filter((s) => String(s.classId) === classId).sort((a, b) => fullName(a).localeCompare(fullName(b), 'ar'));

  if (!refs.loaded) return <Loading />;
  if (!refs.classes?.length) return <Card><EmptyState message="أنشئ الأقسام واربط بها التلاميذ أولًا لتسجيل الحضور." /></Card>;

  const set = (studentId: number, patch: Partial<StudentAttendance>) => {
    const cur = recordMap.get(studentId);
    const entry = {
      date,
      studentId,
      classId: Number(classId),
      status: (patch.status ?? cur?.status ?? 'present') as StudentAttendanceStatus,
      reason: patch.reason ?? cur?.reason ?? '',
      justified: patch.justified ?? cur?.justified ?? false,
    };
    if (entry.status === 'present') {
      entry.reason = '';
      entry.justified = false;
    }
    return run(() => setStudentAttendance(entry));
  };

  const markAllPresent = () =>
    run(async () => {
      for (const s of students) if (!recordMap.has(s.id!)) await setStudentAttendance({ date, studentId: s.id!, classId: Number(classId), status: 'present', reason: '', justified: false });
      await logActivity('إضافة', 'حضور', `قسم ${refs.className(Number(classId))} بتاريخ ${date}`);
    }, 'تم تسجيل حضور بقية التلاميذ.');

  const recorded = students.filter((s) => recordMap.has(s.id!)).length;
  const absent = students.filter((s) => recordMap.get(s.id!)?.status === 'absent').length;
  const late = students.filter((s) => recordMap.get(s.id!)?.status === 'late').length;

  const btn = (active: boolean, color: string) =>
    `rounded-md px-2.5 py-1 text-xs font-semibold border transition ${active ? `${color} text-white border-transparent` : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'}`;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label>
          <Label>التاريخ</Label>
          <input type="date" className={inputClass} value={date} max={addDays(todayISO(), 1)} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <label>
          <Label>القسم</Label>
          <Select value={classId} onChange={setClassId} options={refs.classOptions.map((o) => ({ value: String(o.value), label: o.label }))} />
        </label>
        <div className="text-sm text-slate-500">
          {dayName(date)} — مسجّل {recorded}/{students.length} — <span className="text-red-600">غائب {absent}</span> — <span className="text-orange-500">متأخر {late}</span>
        </div>
        <div className="flex-1" />
        <Button variant="success" onClick={markAllPresent} disabled={!students.length || recorded === students.length}>
          <CheckCheck className="h-4 w-4" /> تسجيل البقية حاضرين
        </Button>
      </div>
      {!students.length ? (
        <EmptyState message="لا يوجد تلاميذ في هذا القسم." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="p-2 text-right">التلميذ</th>
                <th className="p-2 text-right">الحالة</th>
                <th className="p-2 text-right">السبب</th>
                <th className="p-2 text-right">مبرر</th>
                <th className="p-2 text-right">سجل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {students.map((s) => {
                const r = recordMap.get(s.id!);
                const st = r?.status;
                return (
                  <tr key={s.id} className={st === 'absent' ? 'bg-red-50/50 dark:bg-red-950/20' : st === 'late' ? 'bg-orange-50/50 dark:bg-orange-950/20' : ''}>
                    <td className="p-2 font-semibold">{fullName(s)}</td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <button className={btn(st === 'present', 'bg-green-600')} onClick={() => set(s.id!, { status: 'present' })}>
                          حاضر
                        </button>
                        <button className={btn(st === 'absent', 'bg-red-600')} onClick={() => set(s.id!, { status: 'absent' })}>
                          غائب
                        </button>
                        <button className={btn(st === 'late', 'bg-orange-500')} onClick={() => set(s.id!, { status: 'late' })}>
                          متأخر
                        </button>
                      </div>
                    </td>
                    <td className="p-2">
                      {st && st !== 'present' && (
                        <input
                          key={`${s.id}-${date}-${r?.updatedAt}`}
                          className={`${inputClass} !py-1`}
                          defaultValue={r?.reason}
                          placeholder="سبب الغياب أو التأخر"
                          onBlur={(e) => e.target.value !== (r?.reason ?? '') && set(s.id!, { reason: e.target.value })}
                        />
                      )}
                    </td>
                    <td className="p-2">
                      {st && st !== 'present' && <input type="checkbox" className="h-4 w-4" checked={!!r?.justified} onChange={(e) => set(s.id!, { justified: e.target.checked })} />}
                    </td>
                    <td className="p-2">
                      {r?.history?.length ? (
                        <button className="flex items-center gap-1 text-xs text-primary-700" onClick={() => setHistoryOf(r)} title="عرض سجل التعديلات">
                          <History className="h-4 w-4" /> {r.history.length}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-400">يُحفظ كل تغيير فورًا. تعديل تسجيل سابق يُحفظ مع تاريخ التعديل في سجل التلميذ.</p>
      {historyOf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setHistoryOf(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-bold">سجل تعديلات {refs.studentName(historyOf.studentId)} — {formatDate(historyOf.date)}</h3>
            <p className="mb-2 text-xs text-slate-500">تاريخ التسجيل الأول: {formatDateTime(historyOf.createdAt)}</p>
            <ul className="space-y-2 text-sm">
              {historyOf.history.map((h, i) => (
                <li key={i} className="rounded bg-slate-50 p-2 dark:bg-slate-900">
                  <div className="text-xs text-slate-500">{formatDateTime(h.at)}</div>
                  {h.change}
                </li>
              ))}
            </ul>
            <Button className="mt-4 w-full" variant="secondary" onClick={() => setHistoryOf(null)}>
              إغلاق
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function TeacherAttendanceSection() {
  const refs = useRefs();
  const rows = useLiveQuery(() => db.teacherAttendance.orderBy('date').reverse().toArray(), []);
  const [type, setType] = useState('');
  const fields: FieldDef[] = [
    { name: 'teacherId', label: 'المعلم', type: 'select', numeric: true, required: true, options: refs.teacherOptions },
    { name: 'type', label: 'النوع', type: 'select', required: true, options: [{ value: 'absent', label: 'غياب' }, { value: 'late', label: 'تأخير' }, { value: 'leave', label: 'رخصة' }] },
    { name: 'date', label: 'التاريخ (من)', type: 'date', required: true },
    { name: 'endDate', label: 'إلى تاريخ', type: 'date', help: 'للغياب أو الرخصة لعدة أيام' },
    { name: 'durationMinutes', label: 'مدة التأخير (دقائق)', type: 'number', min: 0, max: 600 },
    { name: 'reason', label: 'السبب', type: 'text' },
    { name: 'justified', label: 'مبرر', type: 'checkbox' },
  ];
  return (
    <CrudSection<TeacherAttendance>
      table="teacherAttendance"
      entityName="تسجيل"
      addLabel="تسجيل غياب/رخصة/تأخير"
      rows={rows}
      fields={fields}
      quickAdd={false}
      defaults={() => ({ teacherId: undefined, type: 'absent', date: todayISO(), endDate: '', durationMinutes: 0, reason: '', justified: false, history: [] })}
      labelOf={(r) => `${refs.teacherName(r.teacherId)} — ${TEACHER_ATT_LABEL[r.type]} ${r.date}`}
      searchOf={(r) => [refs.teacherName(r.teacherId), r.reason]}
      filterFn={(r) => !type || r.type === type}
      filters={<Select value={type} onChange={setType} placeholder="كل الأنواع" options={opts(Object.keys(TEACHER_ATT_LABEL)).map((o) => ({ value: String(o.value), label: TEACHER_ATT_LABEL[o.value as TeacherAttendance['type']] }))} />}
      extraValidate={(v) => (v.endDate && String(v.endDate) < String(v.date) ? { endDate: 'تاريخ النهاية قبل تاريخ البداية.' } : {})}
      saveFn={(r) => saveTeacherAttendance(r, `${refs.teacherName(r.teacherId)} — ${TEACHER_ATT_LABEL[r.type]}`)}
      exportName="غيابات-المعلمين"
      exportColumns={[
        { header: 'المعلم', value: (r) => refs.teacherName(r.teacherId) },
        { header: 'النوع', value: (r) => TEACHER_ATT_LABEL[r.type] },
        { header: 'من', value: (r) => r.date },
        { header: 'إلى', value: (r) => r.endDate || r.date },
        { header: 'المدة (د)', value: (r) => (r.type === 'late' ? r.durationMinutes : '') },
        { header: 'السبب', value: (r) => r.reason },
        { header: 'مبرر', value: (r) => (r.justified ? 'نعم' : 'لا') },
      ]}
      columns={[
        { header: 'المعلم', render: (r) => <span className="font-semibold">{refs.teacherName(r.teacherId)}</span>, sortValue: (r) => refs.teacherName(r.teacherId) },
        { header: 'النوع', render: (r) => <Badge tone={r.type === 'late' ? 'orange' : r.type === 'leave' ? 'blue' : 'red'}>{TEACHER_ATT_LABEL[r.type]}</Badge> },
        { header: 'التاريخ', render: (r) => (r.endDate && r.endDate !== r.date ? `${formatDate(r.date)} ← ${formatDate(r.endDate)}` : formatDate(r.date)), sortValue: (r) => r.date },
        { header: 'السبب', render: (r) => r.reason || '—' },
        { header: 'مبرر', render: (r) => (r.justified ? <Badge tone="green">نعم</Badge> : <Badge>لا</Badge>) },
        { header: 'آخر تعديل', render: (r) => (r.history?.length ? <span className="text-xs">{formatDateTime(r.updatedAt)}</span> : '—') },
      ]}
    />
  );
}

function RepeatedAbsences() {
  const { settings } = useApp();
  const refs = useRefs();
  const navigate = useNavigate();
  const [from, setFrom] = useState(addDays(todayISO(), -30));
  const [to, setTo] = useState(todayISO());
  const [threshold, setThreshold] = useState(settings.absenceAlertThreshold);
  const records = useLiveQuery(() => db.studentAttendance.where('date').between(from, to, true, true).toArray(), [from, to]);
  const list = records ? repeatedAbsences(records, threshold) : undefined;
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label>
          <Label>من</Label>
          <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          <Label>إلى</Label>
          <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          <Label>عتبة التنبيه (عدد الغيابات)</Label>
          <input type="number" min={1} className={`${inputClass} w-28`} value={threshold} onChange={(e) => setThreshold(Math.max(1, Number(e.target.value) || 1))} />
        </label>
      </div>
      <DataTable
        rows={list?.map((r) => ({ ...r, id: r.studentId }))}
        emptyMessage="لا يوجد تلاميذ تجاوزوا عتبة الغيابات في هذه الفترة."
        onRowClick={(r) => navigate(`/students/${r.studentId}`)}
        columns={[
          { header: 'التلميذ', render: (r) => <span className="font-semibold">{refs.studentName(r.studentId)}</span> },
          { header: 'القسم', render: (r) => refs.className(refs.studentMap.get(r.studentId)?.classId) },
          { header: 'الغيابات', render: (r) => <Badge tone="red">{r.absent}</Badge>, sortValue: (r) => r.absent },
          { header: 'غير مبررة', render: (r) => r.unjustified, sortValue: (r) => r.unjustified },
          { header: 'التأخرات', render: (r) => r.late, sortValue: (r) => r.late },
          { header: 'هاتف الولي', render: (r) => <span dir="ltr">{refs.studentMap.get(r.studentId)?.guardianPhone || '—'}</span> },
        ]}
      />
    </Card>
  );
}

function AttendanceReports() {
  const { printHeader, run } = useApp();
  const refs = useRefs();
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [ref, setRef] = useState(todayISO());
  const [classId, setClassId] = useState('');
  const from = period === 'week' ? startOfWeek(ref) : startOfMonth(ref);
  const to = period === 'week' ? addDays(from, 6) : endOfMonth(ref);
  const records = useLiveQuery(() => db.studentAttendance.where('date').between(from, to, true, true).toArray(), [from, to]);
  const teacherRecords = useLiveQuery(() => db.teacherAttendance.where('date').between(from, to, true, true).toArray(), [from, to]);

  const rows = useMemo(() => {
    const students = (refs.students ?? []).filter((s) => !classId || String(s.classId) === classId);
    return students
      .map((s) => {
        const rs = (records ?? []).filter((r) => r.studentId === s.id);
        return {
          id: s.id,
          name: fullName(s),
          cls: refs.className(s.classId),
          days: rs.length,
          absent: rs.filter((r) => r.status === 'absent').length,
          unjustified: rs.filter((r) => r.status === 'absent' && !r.justified).length,
          late: rs.filter((r) => r.status === 'late').length,
        };
      })
      .filter((r) => r.days > 0)
      .sort((a, b) => b.absent - a.absent);
  }, [refs, records, classId]);

  const cols: ExportColumn<(typeof rows)[number]>[] = [
    { header: 'التلميذ', value: (r) => r.name },
    { header: 'القسم', value: (r) => r.cls },
    { header: 'أيام مسجلة', value: (r) => r.days },
    { header: 'غيابات', value: (r) => r.absent },
    { header: 'غير مبررة', value: (r) => r.unjustified },
    { header: 'تأخرات', value: (r) => r.late },
  ];
  const title = `تقرير الحضور ${period === 'week' ? 'الأسبوعي' : 'الشهري'} من ${formatDate(from)} إلى ${formatDate(to)}`;
  const totalAbs = rows.reduce((a, r) => a + r.absent, 0);
  const totalRecorded = rows.reduce((a, r) => a + r.days, 0);

  return (
    <Card
      title={title}
      actions={
        <>
          <Button variant="secondary" onClick={() => exportExcel(rows, cols, `حضور-${from}.xlsx`)}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              run(async () =>
                printHtml(
                  title,
                  `<p>نسبة الحضور: ${totalRecorded ? Math.round(((totalRecorded - totalAbs) / totalRecorded) * 100) : '—'}% — مجموع الغيابات: ${totalAbs} — غيابات/رخص المعلمين: ${teacherRecords?.length ?? 0}</p>` + htmlTable(rows, cols),
                  printHeader,
                ),
              )
            }
          >
            <Printer className="h-4 w-4" /> PDF
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Select value={period} onChange={(v) => setPeriod(v as 'week' | 'month')} options={[{ value: 'week', label: 'أسبوعي' }, { value: 'month', label: 'شهري' }]} />
        <input type="date" className={`${inputClass} md:w-auto`} value={ref} onChange={(e) => e.target.value && setRef(e.target.value)} />
        <Select value={classId} onChange={setClassId} placeholder="كل الأقسام" options={refs.classOptions.map((o) => ({ value: String(o.value), label: o.label }))} />
        <span className="text-sm text-slate-500">
          نسبة الحضور: <strong>{totalRecorded ? Math.round(((totalRecorded - totalAbs) / totalRecorded) * 100) : '—'}%</strong> — غيابات/رخص المعلمين: <strong>{teacherRecords?.length ?? 0}</strong>
        </span>
      </div>
      <DataTable
        rows={records ? rows : undefined}
        emptyMessage="لا توجد تسجيلات حضور في هذه الفترة."
        columns={[
          { header: 'التلميذ', render: (r) => r.name, sortValue: (r) => r.name },
          { header: 'القسم', render: (r) => r.cls, sortValue: (r) => r.cls },
          { header: 'أيام مسجلة', render: (r) => r.days },
          { header: 'غيابات', render: (r) => (r.absent ? <Badge tone="red">{r.absent}</Badge> : 0), sortValue: (r) => r.absent },
          { header: 'غير مبررة', render: (r) => r.unjustified, sortValue: (r) => r.unjustified },
          { header: 'تأخرات', render: (r) => r.late, sortValue: (r) => r.late },
        ]}
      />
      <p className="mt-2 text-xs text-slate-400">الحالات: {(['present', 'absent', 'late'] as const).map(statusLabel).join(' / ')}</p>
    </Card>
  );
}
