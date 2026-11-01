import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, ClipboardPlus, Printer, Users } from 'lucide-react';
import { CrudSection } from '../components/CrudPage';
import { opts, type FieldDef } from '../components/EntityForm';
import { Badge, Button, Card, EmptyState, Loading, PageHeader, Tabs } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { useApp } from '../context/AppContext';
import { useRefs } from '../hooks/data';
import { db } from '../db/db';
import type { ClassVisit, Teacher } from '../db/types';
import { escapeHtml, printHtml, type ExportColumn } from '../lib/exporters';
import { formatDate, fullName, round } from '../lib/utils';
import { effectiveTaskStatus } from '../lib/stats';
import { taskStatusTone } from './Dashboard';
import { TEACHER_ATT_LABEL } from './Attendance';

/** Average score per evaluation axis across a teacher's visits, as a percentage of each axis max. */
export function visitAxisAverages(visits: ClassVisit[], axes: { name: string; maxScore: number }[]) {
  return axes.map((ax) => {
    const scores = visits.flatMap((v) => v.axes.filter((a) => a.axis === ax.name && a.score !== null && a.score !== undefined).map((a) => a.score));
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    return { axis: ax.name, max: ax.maxScore, average: avg === null ? null : round(avg, 2), percent: avg === null ? null : round((avg / ax.maxScore) * 100, 0) };
  });
}

export function TeachersPage() {
  const { settings } = useApp();
  const refs = useRefs();
  const navigate = useNavigate();

  const fields: FieldDef[] = useMemo(
    () => [
      { name: 'firstName', label: 'الاسم', type: 'text', required: true },
      { name: 'lastName', label: 'اللقب', type: 'text', required: true },
      { name: 'phone', label: 'رقم الهاتف', type: 'tel' },
      { name: 'email', label: 'البريد الإلكتروني', type: 'email' },
      { name: 'specialty', label: 'المادة أو الاختصاص', type: 'select', options: opts(['معلم عام (عربية)', 'معلم عام (فرنسية)', ...settings.subjects]) },
      { name: 'levels', label: 'المستوى أو القسم', type: 'text', placeholder: 'مثال: السنة الثالثة' },
      { name: 'hireDate', label: 'تاريخ الالتحاق', type: 'date' },
      { name: 'notes', label: 'الملاحظات المهنية', type: 'textarea' },
      { name: 'needsFollowUp', label: 'ملف يستوجب المتابعة', type: 'checkbox' },
    ],
    [settings.subjects],
  );

  const classesOf = (t: Teacher) =>
    (refs.classes ?? [])
      .filter((c) => c.teacherId === t.id || c.secondTeacherId === t.id)
      .map((c) => c.name)
      .join('، ');

  const exportColumns: ExportColumn<Teacher>[] = [
    { header: 'الاسم', value: (t) => t.firstName },
    { header: 'اللقب', value: (t) => t.lastName },
    { header: 'الهاتف', value: (t) => t.phone },
    { header: 'البريد', value: (t) => t.email },
    { header: 'الاختصاص', value: (t) => t.specialty },
    { header: 'الأقسام', value: (t) => classesOf(t) },
    { header: 'تاريخ الالتحاق', value: (t) => t.hireDate },
    { header: 'ملاحظات', value: (t) => t.notes },
  ];

  return (
    <div>
      <PageHeader title="إدارة المعلمين" subtitle="الإطار التربوي وملفاته الرقمية" icon={<Users />} />
      <CrudSection<Teacher>
        table="teachers"
        entityName="معلم"
        title="قائمة الإطار التربوي"
        rows={refs.teachers}
        fields={fields}
        defaults={() => ({ firstName: '', lastName: '', phone: '', email: '', specialty: '', levels: '', hireDate: '', notes: '', needsFollowUp: false })}
        labelOf={(t) => fullName(t)}
        searchOf={(t) => [t.firstName, t.lastName, `${t.firstName} ${t.lastName}`, t.specialty, t.phone]}
        exportColumns={exportColumns}
        exportName="قائمة-المعلمين"
        onView={(t) => navigate(`/teachers/${t.id}`)}
        columns={[
          { header: 'الاسم واللقب', render: (t) => <span className="font-semibold">{fullName(t)}</span>, sortValue: (t) => `${t.lastName} ${t.firstName}` },
          { header: 'الاختصاص', render: (t) => t.specialty || '—', sortValue: (t) => t.specialty },
          { header: 'الأقسام', render: (t) => classesOf(t) || '—' },
          { header: 'الهاتف', render: (t) => <span dir="ltr">{t.phone || '—'}</span> },
          { header: 'تاريخ الالتحاق', render: (t) => formatDate(t.hireDate), sortValue: (t) => t.hireDate },
          { header: 'متابعة', render: (t) => (t.needsFollowUp ? <Badge tone="orange">يستوجب المتابعة</Badge> : null) },
        ]}
      />
    </div>
  );
}

export function TeacherProfile() {
  const { id } = useParams();
  const tid = Number(id);
  const navigate = useNavigate();
  const { settings, printHeader, run } = useApp();
  const refs = useRefs();
  const [tab, setTab] = useState<'info' | 'attendance' | 'tasks' | 'visits' | 'evaluation' | 'reports'>('info');
  const data = useLiveQuery(async () => {
    const teacher = await db.teachers.get(tid);
    if (!teacher) return { teacher: null };
    const [attendance, tasks, visits, pedagogy] = await Promise.all([
      db.teacherAttendance.where('teacherId').equals(tid).reverse().sortBy('date'),
      db.tasks.filter((t) => t.assigneeTeacherId === tid).toArray(),
      db.visits.where('teacherId').equals(tid).reverse().sortBy('date'),
      db.pedagogy.where('teacherId').equals(tid).reverse().sortBy('date'),
    ]);
    return { teacher, attendance, tasks, visits, pedagogy };
  }, [tid]);

  if (!data) return <Loading />;
  if (!data.teacher) return <EmptyState message="المعلم غير موجود." action={<Button onClick={() => navigate('/teachers')}>العودة</Button>} />;
  const t = data.teacher;
  const classes = (refs.classes ?? []).filter((c) => c.teacherId === tid || c.secondTeacherId === tid);
  const averages = visitAxisAverages(data.visits!, settings.evaluationAxes);
  const absences = data.attendance!.filter((a) => a.type === 'absent').length;
  const leaves = data.attendance!.filter((a) => a.type === 'leave').length;
  const lates = data.attendance!.filter((a) => a.type === 'late').length;

  const printEvaluation = () =>
    run(async () => {
      const axesRows = averages
        .map((a) => `<tr><td>${escapeHtml(a.axis)}</td><td>${a.average ?? '—'} / ${a.max}</td><td>${a.percent ?? '—'}%</td></tr>`)
        .join('');
      const last = data.visits![0];
      printHtml(
        `بطاقة تقييم المعلم: ${fullName(t)}`,
        `<table><tr><th>الاختصاص</th><td>${escapeHtml(t.specialty || '—')}</td><th>الأقسام</th><td>${escapeHtml(classes.map((c) => c.name).join('، ') || '—')}</td></tr>
         <tr><th>تاريخ الالتحاق</th><td>${escapeHtml(formatDate(t.hireDate))}</td><th>عدد الزيارات</th><td>${data.visits!.length}</td></tr>
         <tr><th>الغيابات</th><td>${absences}</td><th>الرخص / التأخيرات</th><td>${leaves} / ${lates}</td></tr></table>
         <h2>متوسط التقييم حسب المحاور</h2>
         <table><thead><tr><th>المحور</th><th>المتوسط</th><th>النسبة</th></tr></thead><tbody>${axesRows}</tbody></table>
         <p class="muted">المحاور والمعايير مضبوطة في إعدادات النظام من قبل المدير، ولا تمثل مرجعًا رسميًا.</p>
         ${last ? `<h2>آخر زيارة (${escapeHtml(formatDate(last.date))})</h2><h2>التوصيات</h2><div class="box">${escapeHtml(last.recommendations || '—')}</div>` : ''}
         <h2>ملاحظات المدير</h2><div class="box">${escapeHtml(t.notes || '')}</div>
         <div class="sig"><span>إمضاء المعلم</span><span>إمضاء المدير: ${escapeHtml(settings.directorName)}</span></div>`,
        printHeader,
      );
    });

  return (
    <div>
      <PageHeader
        title={fullName(t)}
        subtitle={t.specialty}
        icon={<Users />}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/teachers')}>
              <ArrowRight className="h-4 w-4" /> القائمة
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/tasks?new=1&assignee=${tid}`)}>
              <ClipboardPlus className="h-4 w-4" /> إسناد مهمة
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/pedagogy?tab=visits&new=1&teacher=${tid}`)}>
              <ClipboardPlus className="h-4 w-4" /> زيارة صفية
            </Button>
            <Button variant="secondary" onClick={printEvaluation}>
              <Printer className="h-4 w-4" /> بطاقة التقييم
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <div className="text-2xl font-bold text-red-600">{absences}</div>
          <div className="text-sm text-slate-500">غيابات</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold text-orange-500">
            {leaves} / {lates}
          </div>
          <div className="text-sm text-slate-500">رخص / تأخيرات</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold text-primary-700">{data.visits!.length}</div>
          <div className="text-sm text-slate-500">زيارات صفية</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold text-green-600">
            {data.tasks!.filter((x) => x.status === 'مكتملة').length} / {data.tasks!.length}
          </div>
          <div className="text-sm text-slate-500">مهام منجزة</div>
        </Card>
      </div>
      <Card>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'info', label: 'البيانات' },
            { id: 'attendance', label: 'الحضور والرخص' },
            { id: 'tasks', label: 'المهام المسندة' },
            { id: 'visits', label: 'الزيارات الصفية' },
            { id: 'evaluation', label: 'بطاقة التقييم' },
            { id: 'reports', label: 'التقارير والملاحظات' },
          ]}
        />
        {tab === 'info' && (
          <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              ['الاسم واللقب', fullName(t)],
              ['الهاتف', t.phone || '—'],
              ['البريد الإلكتروني', t.email || '—'],
              ['الاختصاص', t.specialty || '—'],
              ['المستوى', t.levels || '—'],
              ['الأقسام المسندة', classes.map((c) => c.name).join('، ') || '—'],
              ['تاريخ الالتحاق', formatDate(t.hireDate)],
              ['الملاحظات المهنية', t.notes || '—'],
            ].map(([k, v]) => (
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
            emptyMessage="لا توجد غيابات أو رخص مسجلة. سجّلها من صفحة الحضور والغياب."
            columns={[
              { header: 'النوع', render: (a) => <Badge tone={a.type === 'late' ? 'orange' : a.type === 'leave' ? 'blue' : 'red'}>{TEACHER_ATT_LABEL[a.type]}</Badge> },
              { header: 'من', render: (a) => formatDate(a.date), sortValue: (a) => a.date },
              { header: 'إلى', render: (a) => formatDate(a.endDate || a.date) },
              { header: 'المدة (دقائق)', render: (a) => (a.type === 'late' ? a.durationMinutes : '—') },
              { header: 'السبب', render: (a) => a.reason || '—' },
              { header: 'مبرر', render: (a) => (a.justified ? 'نعم' : 'لا') },
            ]}
          />
        )}
        {tab === 'tasks' && (
          <DataTable
            rows={data.tasks}
            emptyMessage="لا توجد مهام مسندة."
            columns={[
              { header: 'المهمة', render: (x) => x.title },
              { header: 'الاستحقاق', render: (x) => formatDate(x.dueDate), sortValue: (x) => x.dueDate },
              { header: 'الحالة', render: (x) => <Badge tone={taskStatusTone(effectiveTaskStatus(x))}>{effectiveTaskStatus(x)}</Badge> },
            ]}
          />
        )}
        {tab === 'visits' && (
          <DataTable
            rows={data.visits}
            emptyMessage="لا توجد زيارات صفية."
            onRowClick={() => navigate('/pedagogy?tab=visits')}
            columns={[
              { header: 'التاريخ', render: (v) => formatDate(v.date), sortValue: (v) => v.date },
              { header: 'القسم', render: (v) => refs.className(v.classId) },
              { header: 'المادة', render: (v) => v.subject },
              { header: 'التقدير', render: (v) => v.overallRating || '—' },
            ]}
          />
        )}
        {tab === 'evaluation' && (
          <div className="space-y-3">
            {!data.visits!.length && <p className="text-sm text-slate-500">لا تتوفر زيارات صفية لحساب التقييم.</p>}
            {averages.map((a) => (
              <div key={a.axis}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{a.axis}</span>
                  <span className="font-bold">{a.average === null ? '—' : `${a.average} / ${a.max}`}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className={`h-full ${(a.percent ?? 0) >= 70 ? 'bg-green-500' : (a.percent ?? 0) >= 50 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${a.percent ?? 0}%` }} />
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-400">المحاور قابلة للتعديل من إعدادات النظام، ولا تمثل مرجعًا رسميًا ما لم يُدخله المدير.</p>
          </div>
        )}
        {tab === 'reports' && (
          <DataTable
            rows={data.pedagogy}
            emptyMessage="لا توجد تقارير أو متابعات مرتبطة بهذا المعلم."
            columns={[
              { header: 'العنوان', render: (p) => p.title },
              { header: 'المادة', render: (p) => p.subject || '—' },
              { header: 'التاريخ', render: (p) => formatDate(p.date), sortValue: (p) => p.date },
              { header: 'الحالة', render: (p) => p.status || '—' },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
