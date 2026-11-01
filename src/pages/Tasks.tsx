import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, CheckCircle2, ClipboardList } from 'lucide-react';
import { CrudSection } from '../components/CrudPage';
import { opts, type FieldDef } from '../components/EntityForm';
import { Badge, IconButton, PageHeader, Select } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useRefs } from '../hooks/data';
import { db } from '../db/db';
import type { Task } from '../db/types';
import { addDays, endOfMonth, formatDate, startOfMonth, startOfWeek, todayISO } from '../lib/utils';
import { effectiveTaskStatus, taskCompletionRate } from '../lib/stats';
import { priorityTone, taskStatusTone } from './Dashboard';
import { logActivity } from '../db/repo';

const STATUSES: Task['status'][] = ['لم تبدأ', 'قيد الإنجاز', 'مكتملة', 'متأخرة'];
const PRIORITIES: Task['priority'][] = ['عاجلة', 'عالية', 'متوسطة', 'منخفضة'];

export function TasksPage() {
  const { settings, run } = useApp();
  const refs = useRefs();
  const [params] = useSearchParams();
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [category, setCategory] = useState('');
  const [period, setPeriod] = useState('');
  const today = todayISO();

  const sorted = useMemo(
    () => tasks?.slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')),
    [tasks],
  );

  const range = (): [string, string] | null => {
    if (period === 'day') return [today, today];
    if (period === 'week') return [startOfWeek(today), addDays(startOfWeek(today), 6)];
    if (period === 'month') return [startOfMonth(today), endOfMonth(today)];
    return null;
  };
  const r = range();

  const fields: FieldDef[] = [
    { name: 'title', label: 'عنوان المهمة', type: 'text', required: true, full: true },
    { name: 'description', label: 'الوصف', type: 'textarea' },
    { name: 'category', label: 'التصنيف', type: 'select', options: opts(settings.taskCategories) },
    { name: 'priority', label: 'الأولوية', type: 'select', required: true, options: opts(PRIORITIES) },
    { name: 'status', label: 'الحالة', type: 'select', required: true, options: opts(STATUSES.filter((s) => s !== 'متأخرة')), help: 'تصبح المهمة "متأخرة" تلقائيًا عند تجاوز تاريخ الاستحقاق.' },
    { name: 'dueDate', label: 'تاريخ الاستحقاق', type: 'date' },
    { name: 'assigneeTeacherId', label: 'مسندة إلى (معلم)', type: 'select', numeric: true, options: refs.teacherOptions },
    { name: 'notes', label: 'الملاحظات', type: 'textarea' },
  ];

  const move = (t: Task, dir: -1 | 1) =>
    run(async () => {
      const list = sorted ?? [];
      const i = list.findIndex((x) => x.id === t.id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      // Re-number the whole list so the order stays stable.
      const reordered = [...list];
      [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
      await db.transaction('rw', db.tasks, async () => {
        for (let k = 0; k < reordered.length; k++) await db.tasks.update(reordered[k].id!, { sortOrder: k });
      });
    });

  const complete = (t: Task) =>
    run(async () => {
      await db.tasks.update(t.id!, { status: 'مكتملة', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      await logActivity('تعديل', 'مهمة', `${t.title} (مكتملة)`);
    }, 'تم إنجاز المهمة.');

  return (
    <div>
      <PageHeader
        title="المهام الإدارية"
        subtitle={tasks ? `نسبة الإنجاز ${taskCompletionRate(tasks)}% — ${tasks.filter((t) => effectiveTaskStatus(t, today) === 'متأخرة').length} مهمة متأخرة` : undefined}
        icon={<ClipboardList />}
      />
      <CrudSection<Task>
        table="tasks"
        entityName="مهمة"
        rows={sorted}
        fields={fields}
        defaults={() => ({
          title: '',
          description: '',
          category: settings.taskCategories[0] ?? '',
          priority: 'متوسطة',
          status: 'لم تبدأ',
          dueDate: '',
          assigneeTeacherId: params.get('assignee') ? Number(params.get('assignee')) : undefined,
          notes: '',
          sortOrder: (tasks?.length ?? 0) + 1,
          completedAt: '',
        })}
        beforeSave={(v) => ({
          ...v,
          status: v.status === 'متأخرة' ? 'قيد الإنجاز' : v.status,
          completedAt: v.status === 'مكتملة' ? (v.completedAt as string) || new Date().toISOString() : '',
        })}
        labelOf={(t) => t.title}
        searchOf={(t) => [t.title, t.description, t.notes, t.category]}
        filterFn={(t) =>
          (!status || effectiveTaskStatus(t, today) === status) &&
          (!priority || t.priority === priority) &&
          (!category || t.category === category) &&
          (!r || (!!t.dueDate && t.dueDate >= r[0] && t.dueDate <= r[1]))
        }
        filters={
          <>
            <Select value={period} onChange={setPeriod} placeholder="كل الفترات" options={[{ value: 'day', label: 'مهام اليوم' }, { value: 'week', label: 'مهام الأسبوع' }, { value: 'month', label: 'مهام الشهر' }]} />
            <Select value={status} onChange={setStatus} placeholder="كل الحالات" options={STATUSES.map((s) => ({ value: s, label: s }))} />
            <Select value={priority} onChange={setPriority} placeholder="كل الأولويات" options={PRIORITIES.map((s) => ({ value: s, label: s }))} />
            <Select value={category} onChange={setCategory} placeholder="كل التصنيفات" options={settings.taskCategories.map((s) => ({ value: s, label: s }))} />
          </>
        }
        extraActions={(t) => (
          <>
            <IconButton title="تقديم" onClick={() => move(t, -1)}>
              <ArrowUp className="h-4 w-4" />
            </IconButton>
            <IconButton title="تأخير" onClick={() => move(t, 1)}>
              <ArrowDown className="h-4 w-4" />
            </IconButton>
            {t.status !== 'مكتملة' && (
              <IconButton title="تحديد كمكتملة" onClick={() => complete(t)}>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </IconButton>
            )}
          </>
        )}
        exportName="المهام"
        exportColumns={[
          { header: 'المهمة', value: (t) => t.title },
          { header: 'الوصف', value: (t) => t.description },
          { header: 'التصنيف', value: (t) => t.category },
          { header: 'الأولوية', value: (t) => t.priority },
          { header: 'الحالة', value: (t) => effectiveTaskStatus(t, today) },
          { header: 'تاريخ الإضافة', value: (t) => t.createdAt?.slice(0, 10) },
          { header: 'تاريخ الاستحقاق', value: (t) => t.dueDate },
          { header: 'مسندة إلى', value: (t) => (t.assigneeTeacherId ? refs.teacherName(t.assigneeTeacherId) : '') },
          { header: 'ملاحظات', value: (t) => t.notes },
        ]}
        columns={[
          {
            header: 'المهمة',
            sortValue: (t) => t.title,
            render: (t) => (
              <div>
                <div className={`font-semibold ${t.status === 'مكتملة' ? 'text-slate-400 line-through' : ''}`}>{t.title}</div>
                {t.description && <div className="max-w-xs truncate text-xs text-slate-500">{t.description}</div>}
              </div>
            ),
          },
          { header: 'التصنيف', render: (t) => t.category || '—', sortValue: (t) => t.category },
          { header: 'الأولوية', render: (t) => <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>, sortValue: (t) => PRIORITIES.indexOf(t.priority) },
          {
            header: 'الحالة',
            sortValue: (t) => STATUSES.indexOf(effectiveTaskStatus(t, today)),
            render: (t) => {
              const s = effectiveTaskStatus(t, today);
              return <Badge tone={taskStatusTone(s)}>{s}</Badge>;
            },
          },
          { header: 'أُضيفت', render: (t) => formatDate(t.createdAt), sortValue: (t) => t.createdAt ?? '' },
          { header: 'الاستحقاق', render: (t) => formatDate(t.dueDate), sortValue: (t) => t.dueDate || '9999' },
          { header: 'مسندة إلى', render: (t) => (t.assigneeTeacherId ? refs.teacherName(t.assigneeTeacherId) : '—') },
        ]}
      />
    </div>
  );
}
