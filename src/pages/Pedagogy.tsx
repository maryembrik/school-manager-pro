import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpenCheck, FileSpreadsheet, Printer } from 'lucide-react';
import { CrudSection } from '../components/CrudPage';
import { opts, type FieldDef, type Values } from '../components/EntityForm';
import { Badge, Button, Card, IconButton, Label, PageHeader, ProgressBar, Select, Tabs, inputClass } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { useApp } from '../context/AppContext';
import { useRefs } from '../hooks/data';
import { db } from '../db/db';
import type { ClassVisit, PedagogyKind, PedagogyRecord, VisitAxisScore } from '../db/types';
import { escapeHtml, exportExcel, htmlTable, printHtml } from '../lib/exporters';
import { formatDate, round, todayISO } from '../lib/utils';
import { visitAxisAverages } from './Teachers';

interface KindConfig {
  label: string;
  entity: string;
  titleLabel: string;
  statuses: string[];
  use: ('teacher' | 'class' | 'student' | 'subject' | 'endDate' | 'progress' | 'actions')[];
  progressLabel?: string;
  detailsLabel: string;
}

export const KINDS: Record<PedagogyKind, KindConfig> = {
  lessonPlans: {
    label: 'الجذاذات والمذكرات',
    entity: 'متابعة جذاذة',
    titleLabel: 'الموضوع / الوحدة',
    statuses: ['مطابقة', 'تحتاج مراجعة', 'غير منجزة'],
    use: ['teacher', 'class', 'subject', 'actions'],
    detailsLabel: 'الملاحظات',
  },
  programProgress: {
    label: 'إنجاز البرامج',
    entity: 'متابعة برنامج',
    titleLabel: 'المحور / الوحدة الحالية',
    statuses: ['متقدم', 'في الموعد', 'متأخر'],
    use: ['teacher', 'class', 'subject', 'progress', 'actions'],
    progressLabel: 'نسبة الإنجاز',
    detailsLabel: 'الملاحظات',
  },
  learning: {
    label: 'متابعة التعلمات',
    entity: 'متابعة تعلم',
    titleLabel: 'الكفاية / الهدف',
    statuses: ['مكتسبة', 'في طور الاكتساب', 'غير مكتسبة'],
    use: ['teacher', 'class', 'subject', 'progress'],
    progressLabel: 'نسبة التحكم',
    detailsLabel: 'الملاحظات',
  },
  assessments: {
    label: 'متابعة التقييمات',
    entity: 'تقييم',
    titleLabel: 'عنوان التقييم',
    statuses: ['مخطط', 'منجز', 'تم الإصلاح', 'تم استغلال النتائج'],
    use: ['teacher', 'class', 'subject', 'actions'],
    detailsLabel: 'الملاحظات',
  },
  results: {
    label: 'نتائج التلاميذ',
    entity: 'متابعة نتائج',
    titleLabel: 'الموضوع',
    statuses: ['مرضية', 'متوسطة', 'ضعيفة'],
    use: ['teacher', 'class', 'subject', 'progress', 'actions'],
    progressLabel: 'نسبة النجاح',
    detailsLabel: 'التحليل',
  },
  difficulties: {
    label: 'رصد التعثرات',
    entity: 'تعثر',
    titleLabel: 'طبيعة التعثر',
    statuses: ['مرصود', 'قيد المعالجة', 'تم تجاوزه'],
    use: ['student', 'class', 'teacher', 'subject', 'actions'],
    detailsLabel: 'الوصف',
  },
  remediation: {
    label: 'خطط الدعم والمعالجة',
    entity: 'خطة دعم',
    titleLabel: 'عنوان الخطة',
    statuses: ['مبرمجة', 'قيد التنفيذ', 'منجزة', 'ملغاة'],
    use: ['class', 'student', 'teacher', 'subject', 'endDate', 'progress', 'actions'],
    progressLabel: 'نسبة التنفيذ',
    detailsLabel: 'الأهداف والأنشطة',
  },
  projects: {
    label: 'المشاريع التربوية',
    entity: 'مشروع',
    titleLabel: 'عنوان المشروع',
    statuses: ['في طور الإعداد', 'قيد الإنجاز', 'منجز', 'معلق'],
    use: ['teacher', 'class', 'endDate', 'progress', 'actions'],
    progressLabel: 'نسبة التقدم',
    detailsLabel: 'الأهداف والوصف',
  },
};

type TabId = 'visits' | PedagogyKind | 'performance';

export function PedagogyPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) || 'visits';
  const tabs: { id: TabId; label: string }[] = [
    { id: 'visits', label: 'الزيارات الصفية' },
    ...(Object.keys(KINDS) as PedagogyKind[]).map((k) => ({ id: k as TabId, label: KINDS[k].label })),
    { id: 'performance', label: 'تقارير الأداء البيداغوجي' },
  ];
  return (
    <div>
      <PageHeader title="المتابعة البيداغوجية" subtitle="متابعة العمل التربوي والزيارات والتعثرات وخطط الدعم" icon={<BookOpenCheck />} />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={tabs} />
      {tab === 'visits' && <VisitsSection />}
      {tab in KINDS && <KindSection key={tab} kind={tab as PedagogyKind} />}
      {tab === 'performance' && <PerformanceReport />}
    </div>
  );
}

function VisitsSection() {
  const { settings, printHeader, run } = useApp();
  const refs = useRefs();
  const [params] = useSearchParams();
  const rows = useLiveQuery(() => db.visits.orderBy('date').reverse().toArray(), []);
  const [teacher, setTeacher] = useState('');

  const fields: FieldDef[] = [
    { name: 'teacherId', label: 'اسم المعلم', type: 'select', numeric: true, required: true, options: refs.teacherOptions },
    { name: 'classId', label: 'القسم', type: 'select', numeric: true, options: refs.classOptions },
    { name: 'subject', label: 'المادة', type: 'select', required: true, options: opts(settings.subjects) },
    { name: 'date', label: 'تاريخ الزيارة', type: 'date', required: true },
    { name: 'visitType', label: 'نوع الزيارة', type: 'select', options: opts(['زيارة عادية', 'زيارة متابعة', 'زيارة بطلب من المعلم', 'زيارة توجيهية']) },
    { name: 'overallRating', label: 'التقييم العام', type: 'select', options: opts(['ممتاز', 'جيد جدًا', 'جيد', 'متوسط', 'يحتاج إلى دعم']) },
    { name: 'strengths', label: 'نقاط القوة', type: 'textarea' },
    { name: 'improvements', label: 'النقاط التي تحتاج إلى تطوير', type: 'textarea' },
    { name: 'recommendations', label: 'التوصيات', type: 'textarea' },
    { name: 'signedBy', label: 'توقيع المدير (الاسم)', type: 'text' },
    { name: 'signed', label: 'تم التوقيع', type: 'checkbox', help: 'تأكيد توقيع المدير على البطاقة' },
  ];

  const defaults = (): Values => ({
    teacherId: params.get('teacher') ? Number(params.get('teacher')) : undefined,
    classId: undefined,
    subject: '',
    date: todayISO(),
    visitType: 'زيارة عادية',
    axes: settings.evaluationAxes.map((a) => ({ axis: a.name, score: null, comment: '' })),
    strengths: '',
    improvements: '',
    recommendations: '',
    overallRating: '',
    signedBy: settings.directorName,
    signed: false,
  });

  const total = (v: ClassVisit) => {
    const scored = v.axes.filter((a) => a.score !== null && a.score !== undefined);
    if (!scored.length) return null;
    const max = scored.reduce((acc, a) => acc + (settings.evaluationAxes.find((x) => x.name === a.axis)?.maxScore ?? 5), 0);
    const sum = scored.reduce((acc, a) => acc + Number(a.score), 0);
    return { sum, max, pct: round((sum / max) * 100, 0) };
  };

  const printVisit = (v: ClassVisit) =>
    run(async () => {
      const t = total(v);
      const axes = v.axes
        .map((a) => `<tr><td>${escapeHtml(a.axis)}</td><td>${a.score ?? '—'} / ${settings.evaluationAxes.find((x) => x.name === a.axis)?.maxScore ?? '—'}</td><td>${escapeHtml(a.comment || '')}</td></tr>`)
        .join('');
      printHtml(
        'بطاقة زيارة صفية',
        `<table><tr><th>المعلم</th><td>${escapeHtml(refs.teacherName(v.teacherId))}</td><th>القسم</th><td>${escapeHtml(refs.className(v.classId))}</td></tr>
         <tr><th>المادة</th><td>${escapeHtml(v.subject)}</td><th>تاريخ الزيارة</th><td>${escapeHtml(formatDate(v.date))}</td></tr>
         <tr><th>نوع الزيارة</th><td>${escapeHtml(v.visitType || '—')}</td><th>التقييم العام</th><td>${escapeHtml(v.overallRating || '—')}${t ? ` (${t.sum}/${t.max})` : ''}</td></tr></table>
         <h2>محاور الملاحظة</h2><table><thead><tr><th>المحور</th><th>التقدير</th><th>ملاحظات</th></tr></thead><tbody>${axes}</tbody></table>
         <h2>نقاط القوة</h2><div class="box">${escapeHtml(v.strengths || '')}</div>
         <h2>النقاط التي تحتاج إلى تطوير</h2><div class="box">${escapeHtml(v.improvements || '')}</div>
         <h2>التوصيات</h2><div class="box">${escapeHtml(v.recommendations || '')}</div>
         <div class="sig"><span>إمضاء المعلم</span><span>إمضاء المدير: ${escapeHtml(v.signedBy || '')} ${v.signed ? '✓' : ''}</span></div>
         <p class="muted">محاور الملاحظة محددة من قبل المدير في إعدادات النظام.</p>`,
        printHeader,
      );
    });

  return (
    <CrudSection<ClassVisit>
      table="visits"
      entityName="زيارة صفية"
      rows={rows}
      fields={fields}
      defaults={defaults}
      labelOf={(v) => `${refs.teacherName(v.teacherId)} — ${v.date}`}
      searchOf={(v) => [refs.teacherName(v.teacherId), v.subject, refs.className(v.classId)]}
      filterFn={(v) => !teacher || String(v.teacherId) === teacher}
      filters={<Select value={teacher} onChange={setTeacher} placeholder="كل المعلمين" options={refs.teacherOptions.map((o) => ({ value: String(o.value), label: o.label }))} />}
      extraActions={(v) => (
        <IconButton title="طباعة البطاقة" onClick={() => printVisit(v)}>
          <Printer className="h-4 w-4" />
        </IconButton>
      )}
      exportName="الزيارات-الصفية"
      exportColumns={[
        { header: 'المعلم', value: (v) => refs.teacherName(v.teacherId) },
        { header: 'القسم', value: (v) => refs.className(v.classId) },
        { header: 'المادة', value: (v) => v.subject },
        { header: 'التاريخ', value: (v) => v.date },
        { header: 'التقييم العام', value: (v) => v.overallRating },
        { header: 'المجموع', value: (v) => (total(v) ? `${total(v)!.sum}/${total(v)!.max}` : '') },
        { header: 'التوصيات', value: (v) => v.recommendations },
      ]}
      formExtra={(values, set) => {
        const axes = (values.axes as VisitAxisScore[]) ?? [];
        // Make sure axes added in settings after the visit was created are shown too.
        const merged = [...axes, ...settings.evaluationAxes.filter((a) => !axes.some((x) => x.axis === a.name)).map((a) => ({ axis: a.name, score: null as unknown as number, comment: '' }))];
        const update = (i: number, patch: Partial<VisitAxisScore>) => set('axes', merged.map((a, j) => (j === i ? { ...a, ...patch } : a)));
        return (
          <div className="md:col-span-2">
            <Label>محاور الملاحظة والتقييم</Label>
            <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              {merged.map((a, i) => {
                const max = settings.evaluationAxes.find((x) => x.name === a.axis)?.maxScore ?? 5;
                return (
                  <div key={a.axis} className="grid grid-cols-1 items-center gap-2 md:grid-cols-[1fr_120px_2fr]">
                    <span className="text-sm font-semibold">{a.axis}</span>
                    <select className={inputClass} value={a.score ?? ''} onChange={(e) => update(i, { score: e.target.value === '' ? (null as unknown as number) : Number(e.target.value) })}>
                      <option value="">—</option>
                      {Array.from({ length: max + 1 }, (_, n) => (
                        <option key={n} value={n}>
                          {n} / {max}
                        </option>
                      ))}
                    </select>
                    <input className={inputClass} placeholder="ملاحظة" value={a.comment} onChange={(e) => update(i, { comment: e.target.value })} />
                  </div>
                );
              })}
              <p className="text-xs text-slate-400">يمكن تعديل المحاور وسلّم التقييم من إعدادات النظام.</p>
            </div>
          </div>
        );
      }}
      columns={[
        { header: 'المعلم', render: (v) => <span className="font-semibold">{refs.teacherName(v.teacherId)}</span>, sortValue: (v) => refs.teacherName(v.teacherId) },
        { header: 'القسم', render: (v) => refs.className(v.classId) },
        { header: 'المادة', render: (v) => v.subject },
        { header: 'التاريخ', render: (v) => formatDate(v.date), sortValue: (v) => v.date },
        {
          header: 'المجموع',
          render: (v) => {
            const t = total(v);
            return t ? <Badge tone={t.pct >= 70 ? 'green' : t.pct >= 50 ? 'orange' : 'red'}>{`${t.sum}/${t.max}`}</Badge> : '—';
          },
        },
        { header: 'التقييم', render: (v) => v.overallRating || '—' },
        { header: 'التوقيع', render: (v) => (v.signed ? <Badge tone="green">موقّعة</Badge> : <Badge>غير موقّعة</Badge>) },
      ]}
    />
  );
}

function statusTone(cfg: KindConfig, s: string) {
  const i = cfg.statuses.indexOf(s);
  if (i < 0) return 'gray' as const;
  if (['تم تجاوزه', 'منجز', 'منجزة', 'مكتملة', 'مطابقة', 'مكتسبة', 'مرضية', 'متقدم', 'تم استغلال النتائج'].includes(s)) return 'green' as const;
  if (['متأخر', 'غير منجزة', 'غير مكتسبة', 'ضعيفة', 'مرصود', 'ملغاة', 'معلق'].includes(s)) return 'red' as const;
  return 'orange' as const;
}

function KindSection({ kind }: { kind: PedagogyKind }) {
  const { settings } = useApp();
  const refs = useRefs();
  const cfg = KINDS[kind];
  const rows = useLiveQuery(() => db.pedagogy.where('kind').equals(kind).reverse().sortBy('date'), [kind]);
  const [status, setStatus] = useState('');

  const fields = useMemo(() => {
    const f: FieldDef[] = [{ name: 'title', label: cfg.titleLabel, type: 'text', required: true, full: true }];
    if (cfg.use.includes('student')) f.push({ name: 'studentId', label: 'التلميذ', type: 'select', numeric: true, options: refs.studentOptions, required: kind === 'difficulties' });
    if (cfg.use.includes('class')) f.push({ name: 'classId', label: 'القسم', type: 'select', numeric: true, options: refs.classOptions });
    if (cfg.use.includes('teacher')) f.push({ name: 'teacherId', label: kind === 'projects' ? 'المسؤول' : 'المعلم', type: 'select', numeric: true, options: refs.teacherOptions });
    if (cfg.use.includes('subject')) f.push({ name: 'subject', label: 'المادة', type: 'select', options: opts(settings.subjects) });
    f.push({ name: 'date', label: cfg.use.includes('endDate') ? 'تاريخ البداية' : 'التاريخ', type: 'date', required: true });
    if (cfg.use.includes('endDate')) f.push({ name: 'endDate', label: 'تاريخ النهاية', type: 'date' });
    f.push({ name: 'status', label: 'الحالة', type: 'select', required: true, options: opts(cfg.statuses) });
    if (cfg.use.includes('progress')) f.push({ name: 'progress', label: cfg.progressLabel ?? 'النسبة', type: 'range', min: 0, max: 100, full: true });
    f.push({ name: 'details', label: cfg.detailsLabel, type: 'textarea' });
    if (cfg.use.includes('actions')) f.push({ name: 'actions', label: 'الإجراءات المتخذة / المقترحة', type: 'textarea' });
    return f;
  }, [cfg, kind, refs, settings.subjects]);

  return (
    <CrudSection<PedagogyRecord>
      table="pedagogy"
      entityName={cfg.entity}
      title={cfg.label}
      rows={rows}
      fields={fields}
      quickAdd={false}
      defaults={() => ({ kind, title: '', teacherId: undefined, classId: undefined, studentId: undefined, subject: '', date: todayISO(), endDate: '', status: cfg.statuses[0], progress: 0, details: '', actions: '' })}
      beforeSave={(v) => {
        const s = v.studentId ? refs.studentMap.get(v.studentId as number) : undefined;
        return { ...v, kind, classId: v.classId ?? s?.classId };
      }}
      extraValidate={(v) => (v.endDate && String(v.endDate) < String(v.date) ? { endDate: 'تاريخ النهاية قبل تاريخ البداية.' } : {})}
      labelOf={(r) => r.title}
      searchOf={(r) => [r.title, r.subject, refs.teacherName(r.teacherId), refs.studentName(r.studentId), refs.className(r.classId), r.details]}
      filterFn={(r) => !status || r.status === status}
      filters={<Select value={status} onChange={setStatus} placeholder="كل الحالات" options={cfg.statuses.map((s) => ({ value: s, label: s }))} />}
      exportName={cfg.label}
      exportColumns={[
        { header: cfg.titleLabel, value: (r) => r.title },
        ...(cfg.use.includes('student') ? [{ header: 'التلميذ', value: (r: PedagogyRecord) => refs.studentName(r.studentId) }] : []),
        { header: 'القسم', value: (r) => refs.className(r.classId) },
        { header: 'المعلم', value: (r) => refs.teacherName(r.teacherId) },
        { header: 'المادة', value: (r) => r.subject },
        { header: 'التاريخ', value: (r) => r.date },
        { header: 'الحالة', value: (r) => r.status },
        ...(cfg.use.includes('progress') ? [{ header: cfg.progressLabel ?? 'النسبة', value: (r: PedagogyRecord) => `${r.progress}%` }] : []),
        { header: cfg.detailsLabel, value: (r) => r.details },
        { header: 'الإجراءات', value: (r) => r.actions },
      ]}
      columns={[
        { header: cfg.titleLabel, render: (r) => <span className="font-semibold">{r.title}</span>, sortValue: (r) => r.title },
        ...(cfg.use.includes('student') ? [{ header: 'التلميذ', render: (r: PedagogyRecord) => refs.studentName(r.studentId) }] : []),
        { header: 'القسم', render: (r) => refs.className(r.classId) },
        ...(cfg.use.includes('teacher') ? [{ header: kind === 'projects' ? 'المسؤول' : 'المعلم', render: (r: PedagogyRecord) => refs.teacherName(r.teacherId) }] : []),
        ...(cfg.use.includes('subject') ? [{ header: 'المادة', render: (r: PedagogyRecord) => r.subject || '—' }] : []),
        { header: 'التاريخ', render: (r) => formatDate(r.date), sortValue: (r) => r.date },
        { header: 'الحالة', render: (r) => <Badge tone={statusTone(cfg, r.status)}>{r.status}</Badge>, sortValue: (r) => r.status },
        ...(cfg.use.includes('progress')
          ? [
              {
                header: cfg.progressLabel ?? 'النسبة',
                sortValue: (r: PedagogyRecord) => r.progress,
                render: (r: PedagogyRecord) => (
                  <div className="flex w-32 items-center gap-2">
                    <ProgressBar value={r.progress} tone={r.progress >= 70 ? 'green' : r.progress >= 40 ? 'orange' : 'red'} />
                    <span className="text-xs">{r.progress}%</span>
                  </div>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}

function PerformanceReport() {
  const { settings, printHeader, run } = useApp();
  const refs = useRefs();
  const [from, setFrom] = useState(`${settings.schoolYear.slice(0, 4)}-09-01`);
  const [to, setTo] = useState(todayISO());
  const data = useLiveQuery(async () => {
    const [visits, pedagogy] = await Promise.all([db.visits.where('date').between(from, to, true, true).toArray(), db.pedagogy.where('date').between(from, to, true, true).toArray()]);
    return { visits, pedagogy };
  }, [from, to]);

  const rows = (refs.teachers ?? []).map((t) => {
    const v = data?.visits.filter((x) => x.teacherId === t.id) ?? [];
    const avgs = visitAxisAverages(v, settings.evaluationAxes).filter((a) => a.percent !== null);
    const overall = avgs.length ? round(avgs.reduce((a, b) => a + (b.percent ?? 0), 0) / avgs.length, 0) : null;
    const prog = data?.pedagogy.filter((p) => p.kind === 'programProgress' && p.teacherId === t.id) ?? [];
    const lastProg = prog.sort((a, b) => b.date.localeCompare(a.date))[0];
    const plans = data?.pedagogy.filter((p) => p.kind === 'lessonPlans' && p.teacherId === t.id) ?? [];
    const remediation = data?.pedagogy.filter((p) => p.kind === 'remediation' && p.teacherId === t.id).length ?? 0;
    return {
      id: t.id,
      name: `${t.firstName} ${t.lastName}`,
      visits: v.length,
      overall,
      program: lastProg ? lastProg.progress : null,
      plansOk: plans.filter((p) => p.status === 'مطابقة').length,
      plansTotal: plans.length,
      remediation,
    };
  });

  const cols = [
    { header: 'المعلم', value: (r: (typeof rows)[number]) => r.name },
    { header: 'عدد الزيارات', value: (r: (typeof rows)[number]) => r.visits },
    { header: 'متوسط التقييم %', value: (r: (typeof rows)[number]) => r.overall ?? '' },
    { header: 'آخر نسبة إنجاز البرنامج %', value: (r: (typeof rows)[number]) => r.program ?? '' },
    { header: 'جذاذات مطابقة', value: (r: (typeof rows)[number]) => `${r.plansOk}/${r.plansTotal}` },
    { header: 'خطط دعم', value: (r: (typeof rows)[number]) => r.remediation },
  ];
  const difficulties = data?.pedagogy.filter((p) => p.kind === 'difficulties') ?? [];
  const title = `تقرير الأداء البيداغوجي من ${formatDate(from)} إلى ${formatDate(to)}`;

  return (
    <Card
      title={title}
      actions={
        <>
          <Button variant="secondary" onClick={() => exportExcel(rows, cols, 'الأداء-البيداغوجي.xlsx')}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              run(async () =>
                printHtml(
                  title,
                  `<p>عدد الزيارات: ${data?.visits.length ?? 0} — التعثرات المرصودة: ${difficulties.length} (تم تجاوز ${difficulties.filter((d) => d.status === 'تم تجاوزه').length})</p>` + htmlTable(rows, cols),
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
      <div className="mb-4 flex flex-wrap gap-3">
        <label>
          <Label>من</Label>
          <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          <Label>إلى</Label>
          <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="flex items-end gap-4 text-sm text-slate-500">
          <span>
            الزيارات: <strong>{data?.visits.length ?? 0}</strong>
          </span>
          <span>
            التعثرات المرصودة: <strong>{difficulties.length}</strong>
          </span>
          <span>
            خطط الدعم: <strong>{data?.pedagogy.filter((p) => p.kind === 'remediation').length ?? 0}</strong>
          </span>
        </div>
      </div>
      <DataTable
        rows={data ? rows : undefined}
        emptyMessage="أضف المعلمين أولًا."
        columns={[
          { header: 'المعلم', render: (r) => <span className="font-semibold">{r.name}</span>, sortValue: (r) => r.name },
          { header: 'الزيارات', render: (r) => r.visits, sortValue: (r) => r.visits },
          {
            header: 'متوسط التقييم',
            sortValue: (r) => r.overall ?? -1,
            render: (r) => (r.overall === null ? '—' : <Badge tone={r.overall >= 70 ? 'green' : r.overall >= 50 ? 'orange' : 'red'}>{r.overall}%</Badge>),
          },
          { header: 'إنجاز البرنامج', render: (r) => (r.program === null ? '—' : `${r.program}%`), sortValue: (r) => r.program ?? -1 },
          { header: 'الجذاذات المطابقة', render: (r) => `${r.plansOk}/${r.plansTotal}` },
          { header: 'خطط الدعم', render: (r) => r.remediation },
        ]}
      />
    </Card>
  );
}
