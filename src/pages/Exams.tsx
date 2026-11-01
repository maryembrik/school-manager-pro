import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FileSpreadsheet, NotebookPen, Paperclip, Printer } from 'lucide-react';
import { CrudSection } from '../components/CrudPage';
import { opts, type FieldDef, type Values } from '../components/EntityForm';
import { DocActions, FilePicker } from './Documents';
import { Badge, Button, Card, EmptyState, Label, Loading, PageHeader, Select, Tabs, inputClass } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { useApp } from '../context/AppContext';
import { useRefs } from '../hooks/data';
import { db } from '../db/db';
import { saveWithAttachment, setGrade } from '../db/repo';
import type { Exam, Student } from '../db/types';
import { exportExcel, htmlTable, printHtml, type ExportColumn } from '../lib/exporters';
import { formatDate, fullName, round, todayISO } from '../lib/utils';
import { examStats, normalizedScore, studentAverage } from '../lib/stats';

export const TERMS = ['الثلاثي الأول', 'الثلاثي الثاني', 'الثلاثي الثالث'];

type TabId = 'list' | 'grades' | 'results' | 'compare';

export function examStudents(exam: Exam, students: Student[]) {
  return students
    .filter((s) => (exam.classId ? s.classId === exam.classId : s.level === exam.level))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'ar'));
}

export function ExamsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) || 'list';
  return (
    <div>
      <PageHeader title="الامتحانات والتقييم" subtitle="برمجة الامتحانات، متابعة المواضيع والإصلاح، الأعداد والنتائج" icon={<NotebookPen />} />
      <Tabs<TabId>
        value={tab}
        onChange={(t) => setParams({ tab: t })}
        tabs={[
          { id: 'list', label: 'الامتحانات' },
          { id: 'grades', label: 'إدخال الأعداد' },
          { id: 'results', label: 'النتائج والمعدلات' },
          { id: 'compare', label: 'مقارنة الأقسام' },
        ]}
      />
      {tab === 'list' && <ExamList />}
      {tab === 'grades' && <GradeEntry />}
      {tab === 'results' && <Results />}
      {tab === 'compare' && <Compare />}
    </div>
  );
}

function ExamList() {
  const { settings } = useApp();
  const refs = useRefs();
  const [, setParams] = useSearchParams();
  const rows = useLiveQuery(() => db.exams.orderBy('date').reverse().toArray(), []);
  const gradeCounts = useLiveQuery(async () => {
    const m = new Map<number, number>();
    await db.grades.each((g) => {
      if (g.score !== null || g.absent) m.set(g.examId, (m.get(g.examId) ?? 0) + 1);
    });
    return m;
  }, []);
  const [level, setLevel] = useState('');
  const today = todayISO();

  const fields: FieldDef[] = [
    { name: 'title', label: 'عنوان الامتحان', type: 'text', required: true, full: true },
    { name: 'level', label: 'المستوى', type: 'select', required: true, options: opts(settings.levels) },
    { name: 'classId', label: 'القسم (اتركه فارغًا لكل أقسام المستوى)', type: 'select', numeric: true, options: refs.classOptions },
    { name: 'subject', label: 'المادة', type: 'select', required: true, options: opts(settings.subjects) },
    { name: 'term', label: 'الثلاثي', type: 'select', options: opts(TERMS) },
    { name: 'date', label: 'تاريخ الامتحان', type: 'date', required: true },
    { name: 'maxScore', label: 'العدد الأقصى', type: 'number', required: true, min: 1, max: 100 },
    { name: 'coefficient', label: 'الضارب', type: 'number', required: true, min: 0.5, max: 10, step: 0.5 },
    { name: 'teacherId', label: 'المعلم المكلف', type: 'select', numeric: true, options: refs.teacherOptions },
    { name: 'subjectDueDate', label: 'أجل تسليم الموضوع', type: 'date' },
    { name: 'subjectReceived', label: 'تم استلام الموضوع', type: 'checkbox' },
    { name: 'subjectReceivedDate', label: 'تاريخ الاستلام', type: 'date' },
    { name: 'correctionStatus', label: 'حالة الإصلاح', type: 'select', options: opts(['لم يبدأ', 'قيد الإصلاح', 'مكتمل']) },
    { name: 'notes', label: 'ملاحظات', type: 'textarea' },
  ];

  return (
    <CrudSection<Exam>
      table="exams"
      entityName="امتحان"
      rows={rows}
      fields={fields}
      quickAdd={false}
      defaults={() => ({
        title: '',
        level: level || '',
        classId: undefined,
        subject: '',
        term: TERMS[0],
        date: todayISO(),
        maxScore: settings.maxGrade,
        coefficient: 1,
        teacherId: undefined,
        subjectDueDate: '',
        subjectReceived: false,
        subjectReceivedDate: '',
        correctionStatus: 'لم يبدأ',
        notes: '',
      })}
      beforeSave={(v) => {
        // Attaching the paper means the subject has been received.
        const received = v.subjectReceived || !!v._file;
        return { ...v, subjectReceived: received, subjectReceivedDate: received && !v.subjectReceivedDate ? todayISO() : v.subjectReceivedDate };
      }}
      saveFn={(r) => {
        const { _file, ...rest } = r as unknown as Values;
        const exam = rest as unknown as Exam;
        return saveWithAttachment('exams', exam, _file as File | undefined, `${exam.title} (${exam.subject})`);
      }}
      formExtra={(values, set) => <FilePicker values={values} set={set} label="ورقة الامتحان / الموضوع (PDF، Word، صورة)" autoTitle={false} />}
      extraValidate={(v) => {
        const cls = v.classId ? refs.classMap.get(v.classId as number) : undefined;
        if (cls && cls.level !== v.level) return { classId: `هذا القسم تابع لمستوى "${cls.level}".` };
        return {};
      }}
      labelOf={(e) => `${e.title} (${e.subject})`}
      searchOf={(e) => [e.title, e.subject, e.level, refs.className(e.classId)]}
      filterFn={(e) => !level || e.level === level}
      filters={<Select value={level} onChange={setLevel} placeholder="كل المستويات" options={settings.levels.map((l) => ({ value: l, label: l }))} />}
      extraActions={(e) => (
        <>
          <DocActions doc={e} />
          <Button size="sm" variant="ghost" onClick={() => setParams({ tab: 'grades', exam: String(e.id) })}>
            الأعداد
          </Button>
        </>
      )}
      exportName="الامتحانات"
      exportColumns={[
        { header: 'الامتحان', value: (e) => e.title },
        { header: 'المستوى', value: (e) => e.level },
        { header: 'القسم', value: (e) => (e.classId ? refs.className(e.classId) : 'كل الأقسام') },
        { header: 'المادة', value: (e) => e.subject },
        { header: 'التاريخ', value: (e) => e.date },
        { header: 'أجل الموضوع', value: (e) => e.subjectDueDate },
        { header: 'الموضوع مستلم', value: (e) => (e.subjectReceived ? 'نعم' : 'لا') },
        { header: 'ملف الموضوع', value: (e) => e.fileName ?? '' },
        { header: 'الإصلاح', value: (e) => e.correctionStatus },
      ]}
      columns={[
        { header: 'الامتحان', render: (e) => <span className="font-semibold">{e.title}</span>, sortValue: (e) => e.title },
        { header: 'المادة', render: (e) => e.subject, sortValue: (e) => e.subject },
        { header: 'المستوى / القسم', render: (e) => `${e.level}${e.classId ? ` — ${refs.className(e.classId)}` : ''}` },
        { header: 'التاريخ', render: (e) => formatDate(e.date), sortValue: (e) => e.date },
        {
          header: 'الموضوع',
          render: (e) =>
            e.subjectReceived ? (
              <Badge tone="green">
                {e.fileId && <Paperclip className="ml-1 inline h-3 w-3" />}
                مستلم
              </Badge>
            ) : e.subjectDueDate && e.subjectDueDate < today ? (
              <Badge tone="red">متأخر ({formatDate(e.subjectDueDate)})</Badge>
            ) : (
              <Badge tone="orange">{e.subjectDueDate ? `قبل ${formatDate(e.subjectDueDate)}` : 'غير مستلم'}</Badge>
            ),
        },
        { header: 'الإصلاح', render: (e) => <Badge tone={e.correctionStatus === 'مكتمل' ? 'green' : e.correctionStatus === 'قيد الإصلاح' ? 'orange' : 'gray'}>{e.correctionStatus}</Badge> },
        { header: 'الأعداد', render: (e) => `${gradeCounts?.get(e.id!) ?? 0} / ${examStudents(e, refs.students ?? []).length}` },
      ]}
    />
  );
}

function GradeEntry() {
  const { settings, run, toast, printHeader } = useApp();
  const refs = useRefs();
  const [params, setParams] = useSearchParams();
  const exams = useLiveQuery(() => db.exams.orderBy('date').reverse().toArray(), []);
  const examId = Number(params.get('exam')) || exams?.[0]?.id;
  const exam = exams?.find((e) => e.id === examId);
  const grades = useLiveQuery(() => (examId ? db.grades.where('examId').equals(examId).toArray() : []), [examId]);
  const [draft, setDraft] = useState<Record<number, string>>({});

  useEffect(() => setDraft({}), [examId]);

  if (!exams || !refs.loaded) return <Loading />;
  if (!exams.length) return <Card><EmptyState message="أضف امتحانًا أولًا." /></Card>;
  if (!exam) return <Card><EmptyState message="الامتحان غير موجود." /></Card>;

  const students = examStudents(exam, refs.students ?? []);
  const gmap = new Map((grades ?? []).map((g) => [g.studentId, g]));
  const stats = examStats(exam, grades ?? [], settings.passMark, settings.maxGrade);

  const commit = (studentId: number, raw: string) => {
    const g = gmap.get(studentId);
    const trimmed = raw.trim().replace(',', '.');
    if (trimmed === '') {
      if (g && g.score !== null) run(() => setGrade(exam.id!, studentId, null, false));
      return;
    }
    const n = Number(trimmed);
    if (Number.isNaN(n) || n < 0 || n > exam.maxScore) {
      toast(`العدد يجب أن يكون بين 0 و ${exam.maxScore}.`, 'error');
      return;
    }
    if (g?.score === n && !g.absent) return;
    run(() => setGrade(exam.id!, studentId, n, false));
  };

  const cols: ExportColumn<Student>[] = [
    { header: 'التلميذ', value: (s) => fullName(s) },
    { header: 'القسم', value: (s) => refs.className(s.classId) },
    { header: `العدد / ${exam.maxScore}`, value: (s) => (gmap.get(s.id!)?.absent ? 'غائب' : gmap.get(s.id!)?.score ?? '') },
    { header: 'ملاحظة', value: (s) => gmap.get(s.id!)?.remark ?? '' },
  ];

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="min-w-[260px]">
          <Label>الامتحان</Label>
          <Select value={String(examId)} onChange={(v) => setParams({ tab: 'grades', exam: v })} options={exams.map((e) => ({ value: String(e.id), label: `${e.title} — ${e.subject} — ${e.classId ? refs.className(e.classId) : e.level}` }))} />
        </label>
        <div className="flex flex-wrap gap-3 text-sm">
          <Badge tone="blue">المعدل: {stats.average ?? '—'} / {settings.maxGrade}</Badge>
          <Badge tone="green">النجاح: {stats.passRate ?? '—'}%</Badge>
          <Badge>أعلى: {stats.max ?? '—'}</Badge>
          <Badge>أدنى: {stats.min ?? '—'}</Badge>
          <Badge>المُدخل: {stats.count} / {students.length}</Badge>
        </div>
        <div className="flex-1" />
        <Button variant="secondary" onClick={() => exportExcel(students, cols, `أعداد-${exam.title}.xlsx`)}>
          <FileSpreadsheet className="h-4 w-4" /> Excel
        </Button>
        <Button variant="secondary" onClick={() => run(async () => printHtml(`أعداد ${exam.title} — ${exam.subject}`, htmlTable(students, cols), printHeader))}>
          <Printer className="h-4 w-4" /> PDF
        </Button>
      </div>
      {!students.length ? (
        <EmptyState message="لا يوجد تلاميذ في القسم أو المستوى المحدد لهذا الامتحان." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="p-2 text-right">#</th>
                <th className="p-2 text-right">التلميذ</th>
                <th className="p-2 text-right">القسم</th>
                <th className="p-2 text-right">العدد / {exam.maxScore}</th>
                <th className="p-2 text-right">غائب</th>
                <th className="p-2 text-right">على {settings.maxGrade}</th>
                <th className="p-2 text-right">ملاحظة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {students.map((s, i) => {
                const g = gmap.get(s.id!);
                const n = normalizedScore(g, exam, settings.maxGrade);
                return (
                  <tr key={s.id}>
                    <td className="p-2 text-slate-400">{i + 1}</td>
                    <td className="p-2 font-semibold">{fullName(s)}</td>
                    <td className="p-2">{refs.className(s.classId)}</td>
                    <td className="p-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        dir="ltr"
                        disabled={g?.absent}
                        className={`${inputClass} w-24 text-center`}
                        value={draft[s.id!] ?? (g?.score ?? '').toString()}
                        onChange={(e) => setDraft((d) => ({ ...d, [s.id!]: e.target.value }))}
                        onBlur={(e) => {
                          commit(s.id!, e.target.value);
                          setDraft((d) => {
                            const { [s.id!]: _x, ...rest } = d;
                            void _x;
                            return rest;
                          });
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      />
                    </td>
                    <td className="p-2">
                      <input type="checkbox" className="h-4 w-4" checked={!!g?.absent} onChange={(e) => run(() => setGrade(exam.id!, s.id!, e.target.checked ? null : g?.score ?? null, e.target.checked, g?.remark))} />
                    </td>
                    <td className={`p-2 font-bold ${n === null ? '' : n >= settings.passMark ? 'text-green-600' : 'text-red-600'}`}>{n === null ? '—' : round(n)}</td>
                    <td className="p-2">
                      <input
                        key={`${s.id}-${g?.updatedAt}`}
                        className={`${inputClass} !py-1`}
                        defaultValue={g?.remark ?? ''}
                        onBlur={(e) => e.target.value !== (g?.remark ?? '') && run(() => setGrade(exam.id!, s.id!, g?.score ?? null, !!g?.absent, e.target.value))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-400">يُحفظ كل عدد عند مغادرة الخانة أو الضغط على Enter.</p>
        </div>
      )}
    </Card>
  );
}

function Results() {
  const { settings, printHeader, run } = useApp();
  const refs = useRefs();
  const navigate = (id: number) => (window.location.hash = `#/students/${id}`);
  const [classId, setClassId] = useState('');
  const [term, setTerm] = useState('');
  const [subject, setSubject] = useState('');
  const data = useLiveQuery(async () => ({ exams: await db.exams.toArray(), grades: await db.grades.toArray() }), []);

  useEffect(() => {
    if (!classId && refs.classes?.length) setClassId(String(refs.classes[0].id));
  }, [refs.classes, classId]);

  const rows = useMemo(() => {
    if (!data || !classId) return undefined;
    const cls = refs.classMap.get(Number(classId));
    if (!cls) return [];
    const exams = data.exams.filter((e) => (e.classId ? e.classId === cls.id : e.level === cls.level) && (!term || e.term === term) && (!subject || e.subject === subject));
    const list = (refs.students ?? [])
      .filter((s) => s.classId === cls.id)
      .map((s) => ({ id: s.id, name: fullName(s), avg: studentAverage(s.id!, exams, data.grades, settings.maxGrade) }));
    const ranked = [...list].filter((r) => r.avg !== null).sort((a, b) => b.avg! - a.avg!);
    return list
      .map((r) => ({ ...r, rank: r.avg === null ? null : ranked.findIndex((x) => x.avg === r.avg) + 1 }))
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  }, [data, classId, term, subject, refs, settings.maxGrade]);

  const needSupport = rows?.filter((r) => r.avg !== null && r.avg < settings.passMark) ?? [];
  const cols: ExportColumn<NonNullable<typeof rows>[number]>[] = [
    { header: 'الرتبة', value: (r) => r.rank ?? '' },
    { header: 'التلميذ', value: (r) => r.name },
    { header: `المعدل / ${settings.maxGrade}`, value: (r) => r.avg ?? '' },
    { header: 'الملاحظة', value: (r) => (r.avg === null ? '' : r.avg < settings.passMark ? 'يحتاج إلى دعم' : 'ناجح') },
  ];
  const title = `نتائج القسم ${refs.className(Number(classId))}${term ? ` — ${term}` : ''}${subject ? ` — ${subject}` : ''}`;

  return (
    <Card
      title={title}
      actions={
        rows && (
          <>
            <Button variant="secondary" onClick={() => exportExcel(rows, cols, 'النتائج.xlsx')}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
            <Button variant="secondary" onClick={() => run(async () => printHtml(title, htmlTable(rows, cols), printHeader))}>
              <Printer className="h-4 w-4" /> PDF
            </Button>
          </>
        )
      }
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={classId} onChange={setClassId} options={refs.classOptions.map((o) => ({ value: String(o.value), label: o.label }))} />
        <Select value={term} onChange={setTerm} placeholder="كل الثلاثيات" options={TERMS.map((t) => ({ value: t, label: t }))} />
        <Select value={subject} onChange={setSubject} placeholder="كل المواد (معدل مرجّح بالضوارب)" options={settings.subjects.map((t) => ({ value: t, label: t }))} />
      </div>
      {needSupport.length > 0 && (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-100">
          <strong>تلاميذ يحتاجون إلى الدعم ({needSupport.length}):</strong> {needSupport.map((r) => r.name).join('، ')}
        </div>
      )}
      <DataTable
        rows={rows}
        emptyMessage="لا يوجد تلاميذ أو أقسام."
        onRowClick={(r) => navigate(r.id!)}
        columns={[
          { header: 'الرتبة', render: (r) => r.rank ?? '—', sortValue: (r) => r.rank ?? 999 },
          { header: 'التلميذ', render: (r) => <span className="font-semibold">{r.name}</span>, sortValue: (r) => r.name },
          {
            header: `المعدل / ${settings.maxGrade}`,
            sortValue: (r) => r.avg ?? -1,
            render: (r) => (r.avg === null ? '—' : <span className={`font-bold ${r.avg >= settings.passMark ? 'text-green-600' : 'text-red-600'}`}>{r.avg}</span>),
          },
          { header: 'الملاحظة', render: (r) => (r.avg === null ? '—' : r.avg < settings.passMark ? <Badge tone="red">يحتاج إلى دعم</Badge> : <Badge tone="green">ناجح</Badge>) },
        ]}
      />
    </Card>
  );
}

function Compare() {
  const { settings } = useApp();
  const refs = useRefs();
  const [level, setLevel] = useState(settings.levels[0] ?? '');
  const [subject, setSubject] = useState('');
  const [term, setTerm] = useState('');
  const data = useLiveQuery(async () => ({ exams: await db.exams.toArray(), grades: await db.grades.toArray() }), []);
  if (!data) return <Loading />;

  const classes = (refs.classes ?? []).filter((c) => c.level === level);
  const chart = classes.map((c) => {
    const exams = data.exams.filter((e) => (e.classId ? e.classId === c.id : e.level === c.level) && (!subject || e.subject === subject) && (!term || e.term === term));
    const avgs = (refs.students ?? [])
      .filter((s) => s.classId === c.id)
      .map((s) => studentAverage(s.id!, exams, data.grades, settings.maxGrade))
      .filter((x): x is number => x !== null);
    const avg = avgs.length ? round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : 0;
    const pass = avgs.length ? round((avgs.filter((a) => a >= settings.passMark).length / avgs.length) * 100, 0) : 0;
    return { name: c.name, average: avg, passRate: pass, count: avgs.length };
  });

  return (
    <Card title="مقارنة نتائج الأقسام">
      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={level} onChange={setLevel} options={settings.levels.map((l) => ({ value: l, label: l }))} />
        <Select value={subject} onChange={setSubject} placeholder="كل المواد" options={settings.subjects.map((t) => ({ value: t, label: t }))} />
        <Select value={term} onChange={setTerm} placeholder="كل الثلاثيات" options={TERMS.map((t) => ({ value: t, label: t }))} />
      </div>
      {!chart.some((c) => c.count) ? (
        <EmptyState message="لا توجد أعداد كافية للمقارنة في هذا المستوى." />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" reversed />
              <YAxis yAxisId="a" orientation="right" domain={[0, settings.maxGrade]} />
              <YAxis yAxisId="b" orientation="left" domain={[0, 100]} unit="%" />
              <Tooltip />
              <Legend />
              <Bar yAxisId="a" dataKey="average" name={`المعدل / ${settings.maxGrade}`} fill="#1e3a8a" />
              <Bar yAxisId="b" dataKey="passRate" name="نسبة النجاح %" fill="#16a34a" />
            </BarChart>
          </ResponsiveContainer>
          <DataTable
            rows={chart.map((c, i) => ({ ...c, id: i }))}
            columns={[
              { header: 'القسم', render: (c) => c.name },
              { header: 'تلاميذ لهم أعداد', render: (c) => c.count },
              { header: 'المعدل', render: (c) => c.average, sortValue: (c) => c.average },
              { header: 'نسبة النجاح', render: (c) => `${c.passRate}%`, sortValue: (c) => c.passRate },
            ]}
          />
        </>
      )}
    </Card>
  );
}
