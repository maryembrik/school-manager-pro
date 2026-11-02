import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, FileSpreadsheet, Printer } from 'lucide-react';
import { Button, Card, EmptyState, Label, Loading, PageHeader, Select, inputClass } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useRefs } from '../hooks/data';
import { db } from '../db/db';
import { escapeHtml, exportExcelSheets, printHtml } from '../lib/exporters';
import { endOfMonth, formatDate, fullName, inRange, round, startOfMonth, todayISO } from '../lib/utils';
import { effectiveTaskStatus, examStats, repeatedAbsences, studentAverage, taskCompletionRate } from '../lib/stats';
import { TEACHER_ATT_LABEL } from './Attendance';
import { classTeachers } from './Classes';
import { visitAxisAverages } from './Teachers';

type ReportType =
  | 'attendance'
  | 'teachers'
  | 'students'
  | 'classes'
  | 'exams'
  | 'visits'
  | 'tasks'
  | 'activities'
  | 'monthly'
  | 'annual';

const REPORTS: { id: ReportType; label: string }[] = [
  { id: 'attendance', label: 'تقرير الحضور والغياب' },
  { id: 'teachers', label: 'تقرير المعلمين' },
  { id: 'students', label: 'تقرير التلاميذ' },
  { id: 'classes', label: 'تقرير الأقسام' },
  { id: 'exams', label: 'تقرير نتائج الامتحانات' },
  { id: 'visits', label: 'تقرير الزيارات الصفية' },
  { id: 'tasks', label: 'تقرير إنجاز المهام' },
  { id: 'activities', label: 'تقرير الأنشطة والاجتماعات' },
  { id: 'monthly', label: 'التقرير الشهري للمؤسسة' },
  { id: 'annual', label: 'التقرير السنوي' },
];

interface ReportTable {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}
interface ReportOut {
  kpis: [string, string | number][];
  chart?: { data: Record<string, string | number>[]; xKey: string; bars: { key: string; name: string; color: string }[] };
  tables: ReportTable[];
}

function useAllData() {
  return useLiveQuery(async () => {
    const [studentAttendance, teacherAttendance, visits, exams, grades, tasks, events, meetings, pedagogy, parentContacts, documents] = await Promise.all([
      db.studentAttendance.toArray(),
      db.teacherAttendance.toArray(),
      db.visits.toArray(),
      db.exams.toArray(),
      db.grades.toArray(),
      db.tasks.toArray(),
      db.events.toArray(),
      db.meetings.toArray(),
      db.pedagogy.toArray(),
      db.parentContacts.toArray(),
      db.documents.toArray(),
    ]);
    return { studentAttendance, teacherAttendance, visits, exams, grades, tasks, events, meetings, pedagogy, parentContacts, documents };
  }, []);
}

export function ReportsPage() {
  const { settings, printHeader, run } = useApp();
  const refs = useRefs();
  const data = useAllData();
  const today = todayISO();
  const yearStart = `${settings.schoolYear.slice(0, 4)}-09-01`;
  const [type, setType] = useState<ReportType>('attendance');
  const [from, setFrom] = useState(startOfMonth(today));
  const [to, setTo] = useState(today);
  const [level, setLevel] = useState('');
  const [classId, setClassId] = useState('');
  const [subject, setSubject] = useState('');

  const changeType = (t: ReportType) => {
    setType(t);
    if (t === 'monthly') {
      setFrom(startOfMonth(today));
      setTo(endOfMonth(today));
    } else if (t === 'annual') {
      setFrom(yearStart);
      setTo(`${Number(settings.schoolYear.slice(0, 4)) + 1}-06-30`);
    }
  };

  const report = useMemo<ReportOut | null>(() => {
    if (!data || !refs.loaded) return null;
    const P = settings.passMark;
    const S = settings.maxGrade;
    const classes = (refs.classes ?? []).filter((c) => (!level || c.level === level) && (!classId || String(c.id) === classId));
    const students = (refs.students ?? []).filter((s) => (!level || s.level === level) && (!classId || String(s.classId) === classId));
    const studentIds = new Set(students.map((s) => s.id));
    const att = data.studentAttendance.filter((a) => inRange(a.date, from, to) && studentIds.has(a.studentId));
    const exams = data.exams.filter(
      (e) => inRange(e.date, from, to) && (!level || e.level === level) && (!classId || !e.classId || String(e.classId) === classId) && (!subject || e.subject === subject),
    );
    const visits = data.visits.filter((v) => inRange(v.date, from, to) && (!classId || String(v.classId) === classId) && (!subject || v.subject === subject));
    const tAtt = data.teacherAttendance.filter((a) => inRange(a.date, from, to));
    const tasks = data.tasks.filter((t) => inRange(t.dueDate || t.createdAt, from, to));
    const meetings = data.meetings.filter((m) => inRange(m.date, from, to));
    const events = data.events.filter((e) => inRange(e.date, from, to));

    const absent = att.filter((a) => a.status === 'absent').length;
    const late = att.filter((a) => a.status === 'late').length;
    const presence = att.length ? `${round(((att.length - absent) / att.length) * 100, 1)}%` : '—';

    const attendanceSection = (): ReportOut => {
      const perClass = classes.map((c) => {
        const r = att.filter((a) => a.classId === c.id);
        return { name: c.name, present: r.filter((a) => a.status === 'present').length, absent: r.filter((a) => a.status === 'absent').length, late: r.filter((a) => a.status === 'late').length };
      });
      const repeated = repeatedAbsences(att, settings.absenceAlertThreshold);
      return {
        kpis: [
          ['تسجيلات الحضور', att.length],
          ['نسبة الحضور', presence],
          ['الغيابات', absent],
          ['غير المبررة', att.filter((a) => a.status === 'absent' && !a.justified).length],
          ['التأخرات', late],
          ['غيابات/رخص المعلمين', tAtt.length],
        ],
        chart: { data: perClass, xKey: 'name', bars: [{ key: 'present', name: 'حاضر', color: '#16a34a' }, { key: 'late', name: 'متأخر', color: '#f97316' }, { key: 'absent', name: 'غائب', color: '#dc2626' }] },
        tables: [
          { title: 'الحضور حسب القسم', headers: ['القسم', 'حاضر', 'غائب', 'متأخر'], rows: perClass.map((c) => [c.name, c.present, c.absent, c.late]) },
          {
            title: `الغيابات المتكررة (${settings.absenceAlertThreshold} فأكثر)`,
            headers: ['التلميذ', 'القسم', 'الغيابات', 'غير مبررة', 'التأخرات'],
            rows: repeated.map((r) => [refs.studentName(r.studentId), refs.className(refs.studentMap.get(r.studentId)?.classId), r.absent, r.unjustified, r.late]),
          },
          {
            title: 'غيابات المعلمين ورخصهم',
            headers: ['المعلم', 'النوع', 'من', 'إلى', 'السبب'],
            rows: tAtt.map((a) => [refs.teacherName(a.teacherId), TEACHER_ATT_LABEL[a.type], a.date, a.endDate || a.date, a.reason]),
          },
        ],
      };
    };

    const teachersSection = (): ReportOut => {
      const rows = (refs.teachers ?? []).map((t) => {
        const ta = tAtt.filter((a) => a.teacherId === t.id);
        const tv = visits.filter((v) => v.teacherId === t.id);
        const avg = visitAxisAverages(tv, settings.evaluationAxes).filter((a) => a.percent !== null);
        const pct = avg.length ? round(avg.reduce((s, a) => s + (a.percent ?? 0), 0) / avg.length, 0) : null;
        const tt = data.tasks.filter((x) => x.assigneeTeacherId === t.id);
        return [fullName(t), t.specialty, ta.filter((a) => a.type === 'absent').length, ta.filter((a) => a.type === 'leave').length, ta.filter((a) => a.type === 'late').length, tv.length, pct === null ? '—' : `${pct}%`, `${tt.filter((x) => x.status === 'مكتملة').length}/${tt.length}`];
      });
      return {
        kpis: [
          ['عدد المعلمين', refs.teachers?.length ?? 0],
          ['الغيابات', tAtt.filter((a) => a.type === 'absent').length],
          ['الرخص', tAtt.filter((a) => a.type === 'leave').length],
          ['التأخيرات', tAtt.filter((a) => a.type === 'late').length],
          ['الزيارات الصفية', visits.length],
        ],
        tables: [{ title: 'وضعية المعلمين', headers: ['المعلم', 'الاختصاص', 'غيابات', 'رخص', 'تأخيرات', 'زيارات', 'متوسط التقييم', 'مهام منجزة'], rows }],
      };
    };

    const studentsSection = (): ReportOut => {
      const byLevel = settings.levels.map((l) => ({ name: l, boys: students.filter((s) => s.level === l && s.gender === 'ذكر').length, girls: students.filter((s) => s.level === l && s.gender === 'أنثى').length, total: students.filter((s) => s.level === l).length }));
      const allExams = data.exams.filter((e) => inRange(e.date, from, to));
      return {
        kpis: [
          ['عدد التلاميذ', students.length],
          ['ذكور', students.filter((s) => s.gender === 'ذكر').length],
          ['إناث', students.filter((s) => s.gender === 'أنثى').length],
          ['دون قسم', students.filter((s) => !s.classId).length],
          ['ملفات تستوجب المتابعة', students.filter((s) => s.needsFollowUp).length],
        ],
        chart: { data: byLevel, xKey: 'name', bars: [{ key: 'boys', name: 'ذكور', color: '#1e3a8a' }, { key: 'girls', name: 'إناث', color: '#db2777' }] },
        tables: [
          { title: 'التوزيع حسب المستوى', headers: ['المستوى', 'ذكور', 'إناث', 'المجموع'], rows: byLevel.map((l) => [l.name, l.boys, l.girls, l.total]) },
          {
            title: 'قائمة التلاميذ',
            headers: ['التلميذ', 'المستوى', 'القسم', 'الغيابات', 'المعدل'],
            rows: students
              .map((s) => [fullName(s), s.level, refs.className(s.classId), att.filter((a) => a.studentId === s.id && a.status === 'absent').length, studentAverage(s.id!, allExams, data.grades, S) ?? '—'] as (string | number)[])
              .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'ar')),
          },
        ],
      };
    };

    const classesSection = (): ReportOut => {
      const rows = classes.map((c) => {
        const cs = (refs.students ?? []).filter((s) => s.classId === c.id);
        const ca = att.filter((a) => a.classId === c.id);
        const ce = data.exams.filter((e) => inRange(e.date, from, to) && (e.classId ? e.classId === c.id : e.level === c.level));
        const avgs = cs.map((s) => studentAverage(s.id!, ce, data.grades, S)).filter((x): x is number => x !== null);
        const avg = avgs.length ? round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : 0;
        const absentC = ca.filter((a) => a.status === 'absent').length;
        return { name: c.name, level: c.level, teacher: classTeachers(c, refs.teacherName) || '—', count: cs.length, presence: ca.length ? round(((ca.length - absentC) / ca.length) * 100, 1) : 0, average: avg, pass: avgs.length ? round((avgs.filter((a) => a >= P).length / avgs.length) * 100, 0) : 0 };
      });
      return {
        kpis: [
          ['عدد الأقسام', classes.length],
          ['معدل عدد التلاميذ بالقسم', classes.length ? round(rows.reduce((a, r) => a + r.count, 0) / classes.length, 1) : '—'],
        ],
        chart: { data: rows, xKey: 'name', bars: [{ key: 'average', name: `المعدل / ${S}`, color: '#1e3a8a' }, { key: 'presence', name: 'نسبة الحضور %', color: '#16a34a' }] },
        tables: [{ title: 'مؤشرات الأقسام', headers: ['القسم', 'المستوى', 'المعلمون', 'التلاميذ', 'نسبة الحضور %', 'المعدل', 'نسبة النجاح %'], rows: rows.map((r) => [r.name, r.level, r.teacher, r.count, r.presence, r.average, r.pass]) }],
      };
    };

    const examsSection = (): ReportOut => {
      const rows = exams.map((e) => {
        const st = examStats(e, data.grades.filter((g) => studentIds.has(g.studentId)), P, S);
        return { title: e.title, subject: e.subject, target: e.classId ? refs.className(e.classId) : e.level, date: e.date, ...st };
      });
      const all = rows.filter((r) => r.average !== null);
      const needSupport = students
        .map((s) => ({ s, avg: studentAverage(s.id!, exams, data.grades, S) }))
        .filter((x) => x.avg !== null && x.avg < P)
        .sort((a, b) => a.avg! - b.avg!);
      return {
        kpis: [
          ['عدد الامتحانات', exams.length],
          ['المعدل العام', all.length ? round(all.reduce((a, r) => a + (r.average ?? 0), 0) / all.length) : '—'],
          ['نسبة النجاح العامة', all.length ? `${round(all.reduce((a, r) => a + (r.passRate ?? 0), 0) / all.length, 1)}%` : '—'],
          ['تلاميذ يحتاجون إلى الدعم', needSupport.length],
          ['مواضيع غير مستلمة', exams.filter((e) => !e.subjectReceived).length],
        ],
        chart: { data: rows.map((r) => ({ name: `${r.title}`, average: r.average ?? 0, passRate: r.passRate ?? 0 })), xKey: 'name', bars: [{ key: 'average', name: 'المعدل', color: '#1e3a8a' }, { key: 'passRate', name: 'النجاح %', color: '#16a34a' }] },
        tables: [
          { title: 'نتائج الامتحانات', headers: ['الامتحان', 'المادة', 'القسم/المستوى', 'التاريخ', 'عدد الأعداد', 'المعدل', 'أعلى', 'أدنى', 'النجاح %'], rows: rows.map((r) => [r.title, r.subject, r.target, r.date, r.count, r.average ?? '—', r.max ?? '—', r.min ?? '—', r.passRate ?? '—']) },
          { title: 'التلاميذ الذين يحتاجون إلى الدعم', headers: ['التلميذ', 'القسم', 'المعدل'], rows: needSupport.map((x) => [fullName(x.s), refs.className(x.s.classId), x.avg!]) },
        ],
      };
    };

    const visitsSection = (): ReportOut => {
      const avgs = visitAxisAverages(visits, settings.evaluationAxes);
      return {
        kpis: [
          ['عدد الزيارات', visits.length],
          ['معلمون تمت زيارتهم', new Set(visits.map((v) => v.teacherId)).size],
          ['بطاقات موقّعة', visits.filter((v) => v.signed).length],
        ],
        chart: { data: avgs.map((a) => ({ name: a.axis, percent: a.percent ?? 0 })), xKey: 'name', bars: [{ key: 'percent', name: 'متوسط المحور %', color: '#1e3a8a' }] },
        tables: [
          { title: 'متوسط محاور التقييم', headers: ['المحور', 'المتوسط', 'النسبة %'], rows: avgs.map((a) => [a.axis, a.average === null ? '—' : `${a.average}/${a.max}`, a.percent ?? '—']) },
          { title: 'قائمة الزيارات', headers: ['التاريخ', 'المعلم', 'القسم', 'المادة', 'التقييم', 'التوصيات'], rows: visits.sort((a, b) => a.date.localeCompare(b.date)).map((v) => [v.date, refs.teacherName(v.teacherId), refs.className(v.classId), v.subject, v.overallRating, v.recommendations]) },
        ],
      };
    };

    const tasksSection = (): ReportOut => {
      const statuses = ['لم تبدأ', 'قيد الإنجاز', 'مكتملة', 'متأخرة'] as const;
      const byCat = settings.taskCategories.map((c) => {
        const ct = tasks.filter((t) => t.category === c);
        return { name: c, done: ct.filter((t) => t.status === 'مكتملة').length, open: ct.filter((t) => t.status !== 'مكتملة').length };
      });
      return {
        kpis: [['عدد المهام', tasks.length], ['نسبة الإنجاز', `${taskCompletionRate(tasks)}%`], ...statuses.map((s) => [s, tasks.filter((t) => effectiveTaskStatus(t, today) === s).length] as [string, number])],
        chart: { data: byCat, xKey: 'name', bars: [{ key: 'done', name: 'مكتملة', color: '#16a34a' }, { key: 'open', name: 'غير مكتملة', color: '#f97316' }] },
        tables: [
          {
            title: 'قائمة المهام',
            headers: ['المهمة', 'التصنيف', 'الأولوية', 'الحالة', 'الاستحقاق', 'تاريخ الإنجاز'],
            rows: tasks.map((t) => [t.title, t.category, t.priority, effectiveTaskStatus(t, today), t.dueDate, t.completedAt?.slice(0, 10) ?? '']),
          },
        ],
      };
    };

    const activitiesSection = (): ReportOut => {
      const projects = data.pedagogy.filter((p) => p.kind === 'projects' && inRange(p.date, from, to));
      return {
        kpis: [
          ['الاجتماعات', meetings.length],
          ['الأحداث والأنشطة', events.length],
          ['المشاريع التربوية', projects.length],
          ['قرارات غير منجزة', meetings.reduce((a, m) => a + (m.actions?.filter((x) => !x.done).length ?? 0), 0)],
          ['اتصالات الأولياء', data.parentContacts.filter((c) => inRange(c.date, from, to)).length],
        ],
        tables: [
          { title: 'الاجتماعات', headers: ['التاريخ', 'العنوان', 'النوع', 'عدد القرارات', 'مسؤوليات منجزة'], rows: meetings.map((m) => [m.date, m.title, m.type, m.decisions.split('\n').filter((l) => l.trim()).length, `${m.actions?.filter((a) => a.done).length ?? 0}/${m.actions?.length ?? 0}`]) },
          { title: 'الأنشطة والأحداث', headers: ['التاريخ', 'العنوان', 'النوع', 'المكان'], rows: events.map((e) => [e.date, e.title, e.type, e.location]) },
          { title: 'المشاريع التربوية', headers: ['المشروع', 'المسؤول', 'الحالة', 'التقدم %'], rows: projects.map((p) => [p.title, refs.teacherName(p.teacherId), p.status, p.progress]) },
        ],
      };
    };

    const combine = (parts: [string, ReportOut][]): ReportOut => ({
      kpis: parts.flatMap(([, p]) => p.kpis.slice(0, 3)),
      chart: parts[0][1].chart,
      tables: parts.flatMap(([name, p]) => p.tables.map((t) => ({ ...t, title: `${name} — ${t.title}` }))),
    });

    switch (type) {
      case 'attendance':
        return attendanceSection();
      case 'teachers':
        return teachersSection();
      case 'students':
        return studentsSection();
      case 'classes':
        return classesSection();
      case 'exams':
        return examsSection();
      case 'visits':
        return visitsSection();
      case 'tasks':
        return tasksSection();
      case 'activities':
        return activitiesSection();
      case 'monthly':
        return combine([
          ['الحضور', attendanceSection()],
          ['الامتحانات', examsSection()],
          ['الزيارات', visitsSection()],
          ['المهام', tasksSection()],
          ['الأنشطة', activitiesSection()],
        ]);
      case 'annual':
        return combine([
          ['التلاميذ', studentsSection()],
          ['الأقسام', classesSection()],
          ['الحضور', attendanceSection()],
          ['الامتحانات', examsSection()],
          ['المعلمون', teachersSection()],
          ['الزيارات', visitsSection()],
          ['المهام', tasksSection()],
          ['الأنشطة', activitiesSection()],
        ]);
    }
  }, [data, refs, type, from, to, level, classId, subject, settings, today]);

  const title = `${REPORTS.find((r) => r.id === type)!.label} — من ${formatDate(from)} إلى ${formatDate(to)}`;
  const filtersLabel = [level && `المستوى: ${level}`, classId && `القسم: ${refs.className(Number(classId))}`, subject && `المادة: ${subject}`].filter(Boolean).join(' — ');

  const doPrint = () =>
    run(async () => {
      if (!report) return;
      const kpis = `<table><tr>${report.kpis.map(([k]) => `<th>${escapeHtml(k)}</th>`).join('')}</tr><tr>${report.kpis.map(([, v]) => `<td>${escapeHtml(String(v))}</td>`).join('')}</tr></table>`;
      const tables = report.tables
        .map(
          (t) =>
            `<h2>${escapeHtml(t.title)}</h2><table><thead><tr>${t.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${
              t.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(String(c ?? ''))}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${t.headers.length}">لا توجد بيانات</td></tr>`
            }</tbody></table>`,
        )
        .join('');
      printHtml(title, `${filtersLabel ? `<p class="muted">${escapeHtml(filtersLabel)}</p>` : ''}${kpis}${tables}`, printHeader);
    });

  const doExcel = () => {
    if (!report) return;
    exportExcelSheets(
      [{ name: 'المؤشرات', rows: [['المؤشر', 'القيمة'], ...report.kpis.map(([k, v]) => [k, v])] }, ...report.tables.map((t) => ({ name: t.title, rows: [t.headers, ...t.rows] }))],
      `تقرير-${type}-${from}.xlsx`,
    );
  };

  return (
    <div>
      <PageHeader title="الإحصائيات والتقارير" subtitle="مركز التقارير — كل الأرقام محسوبة من قاعدة البيانات المحلية" icon={<BarChart3 />} />
      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="xl:col-span-2">
            <Label>نوع التقرير</Label>
            <Select className="w-full md:w-full" value={type} onChange={(v) => changeType(v as ReportType)} options={REPORTS.map((r) => ({ value: r.id, label: r.label }))} />
          </label>
          <label>
            <Label>من</Label>
            <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            <Label>إلى</Label>
            <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label>
            <Label>المستوى</Label>
            <Select className="w-full md:w-full" value={level} onChange={(v) => { setLevel(v); setClassId(''); }} placeholder="الكل" options={settings.levels.map((l) => ({ value: l, label: l }))} />
          </label>
          <label>
            <Label>القسم</Label>
            <Select className="w-full md:w-full" value={classId} onChange={setClassId} placeholder="الكل" options={(refs.classes ?? []).filter((c) => !level || c.level === level).map((c) => ({ value: String(c.id), label: c.name }))} />
          </label>
          <label>
            <Label>المادة</Label>
            <Select className="w-full md:w-full" value={subject} onChange={setSubject} placeholder="الكل" options={settings.subjects.map((s) => ({ value: s, label: s }))} />
          </label>
          <div className="flex items-end gap-2 xl:col-span-2">
            <Button variant="secondary" onClick={doExcel} disabled={!report}>
              <FileSpreadsheet className="h-4 w-4" /> تصدير Excel
            </Button>
            <Button variant="secondary" onClick={doPrint} disabled={!report}>
              <Printer className="h-4 w-4" /> طباعة / PDF
            </Button>
          </div>
        </div>
      </Card>
      {!report ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <Card title={title}>
            {filtersLabel && <p className="mb-3 text-sm text-slate-500">{filtersLabel}</p>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {report.kpis.map(([k, v], i) => (
                <div key={`${k}${i}`} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                  <div className="text-xl font-extrabold text-primary-700 dark:text-primary-100">{v}</div>
                  <div className="text-xs text-slate-500">{k}</div>
                </div>
              ))}
            </div>
          </Card>
          {report.chart && report.chart.data.length > 0 && (
            <Card title="الرسم البياني">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={report.chart.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey={report.chart.xKey} fontSize={11} reversed interval={0} />
                  <YAxis orientation="right" fontSize={11} />
                  <Tooltip />
                  <Legend />
                  {report.chart.bars.map((b) => (
                    <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
          {report.tables.map((t) => (
            <Card key={t.title} title={t.title}>
              {!t.rows.length ? (
                <EmptyState message="لا توجد بيانات في هذه الفترة." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900">
                      <tr>
                        {t.headers.map((h) => (
                          <th key={h} className="p-2 text-right font-semibold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {t.rows.map((r, i) => (
                        <tr key={i}>
                          {r.map((c, j) => (
                            <td key={j} className="p-2">
                              {c}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
