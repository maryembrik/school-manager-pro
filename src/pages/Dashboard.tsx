import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, CalendarClock, ClipboardList, FolderOpen, GraduationCap, School, UserX, Users, UsersRound } from 'lucide-react';
import { db } from '../db/db';
import { useApp } from '../context/AppContext';
import { Badge, Card, EmptyState, Loading, PageHeader, ProgressBar, StatCard, type Tone } from '../components/ui';
import { addDays, dayName, formatDate, formatDateTime, todayISO } from '../lib/utils';
import { dailyAttendanceSeries, effectiveTaskStatus, taskCompletionRate } from '../lib/stats';
import type { StatCardId } from '../lib/settings';
import type { ReactNode } from 'react';

export const CHART_COLORS = ['#1e3a8a', '#16a34a', '#f97316', '#dc2626', '#0891b2', '#7c3aed', '#ca8a04', '#64748b'];

export function priorityTone(p: string): Tone {
  return p === 'عاجلة' ? 'red' : p === 'عالية' ? 'orange' : p === 'متوسطة' ? 'blue' : 'gray';
}
export function taskStatusTone(s: string): Tone {
  return s === 'مكتملة' ? 'green' : s === 'متأخرة' ? 'red' : s === 'قيد الإنجاز' ? 'orange' : 'gray';
}

function useDashboardData() {
  return useLiveQuery(async () => {
    const today = todayISO();
    const in14 = addDays(today, 14);
    const [students, teachersCount, classesCount, tasks, todayAtt, recentAtt, teacherAtt, events, meetings, activity, openContacts, followTeachers] = await Promise.all([
      db.students.toArray(),
      db.teachers.count(),
      db.classes.count(),
      db.tasks.toArray(),
      db.studentAttendance.where('date').equals(today).toArray(),
      db.studentAttendance.where('date').between(addDays(today, -20), today, true, true).toArray(),
      db.teacherAttendance.where('date').belowOrEqual(today).toArray(),
      db.events.where('date').between(today, in14, true, true).toArray(),
      db.meetings.where('date').aboveOrEqual(today).toArray(),
      db.activity.orderBy('at').reverse().limit(10).toArray(),
      db.parentContacts.filter((c) => !c.closed).count(),
      db.teachers.filter((t) => !!t.needsFollowUp).count(),
    ]);
    const absentTeachersToday = teacherAtt.filter((t) => t.type !== 'late' && t.date <= today && (t.endDate || t.date) >= today);
    return {
      today,
      students,
      teachersCount,
      classesCount,
      tasks,
      todayAtt,
      recentAtt,
      absentTeachersToday,
      events,
      meetings: meetings.sort((a, b) => a.date.localeCompare(b.date)),
      activity,
      followUps: students.filter((s) => s.needsFollowUp).length + followTeachers + openContacts,
    };
  }, []);
}

export function Dashboard() {
  const { settings } = useApp();
  const navigate = useNavigate();
  const data = useDashboardData();

  if (!data) return <Loading />;
  const today = data.today;

  const openTasks = data.tasks.filter((t) => t.status !== 'مكتملة');
  const absentToday = data.todayAtt.filter((a) => a.status === 'absent').length;
  const lateToday = data.todayAtt.filter((a) => a.status === 'late').length;

  const cards: Record<StatCardId, ReactNode> = {
    students: <StatCard label="العدد الجملي للتلاميذ" value={data.students.length} icon={<GraduationCap />} onClick={() => navigate('/students')} />,
    teachers: <StatCard label="العدد الجملي للمعلمين" value={data.teachersCount} icon={<Users />} onClick={() => navigate('/teachers')} />,
    classes: <StatCard label="عدد الأقسام" value={data.classesCount} icon={<School />} onClick={() => navigate('/classes')} />,
    absentStudents: (
      <StatCard
        label="التلاميذ الغائبون اليوم"
        value={absentToday}
        hint={data.todayAtt.length ? `${lateToday} متأخر` : 'لم يُسجَّل الحضور اليوم'}
        tone={absentToday ? 'orange' : 'green'}
        icon={<UserX />}
        onClick={() => navigate('/attendance')}
      />
    ),
    absentTeachers: (
      <StatCard
        label="المعلمون الغائبون اليوم"
        value={data.absentTeachersToday.length}
        tone={data.absentTeachersToday.length ? 'orange' : 'green'}
        icon={<UserX />}
        onClick={() => navigate('/attendance?tab=teachers')}
      />
    ),
    openTasks: (
      <StatCard
        label="المهام غير المكتملة"
        value={openTasks.length}
        hint={`${openTasks.filter((t) => effectiveTaskStatus(t, today) === 'متأخرة').length} متأخرة`}
        tone={openTasks.some((t) => effectiveTaskStatus(t, today) === 'متأخرة') ? 'red' : 'blue'}
        icon={<ClipboardList />}
        onClick={() => navigate('/tasks')}
      />
    ),
    upcomingMeetings: <StatCard label="الاجتماعات القادمة" value={data.meetings.length} icon={<UsersRound />} onClick={() => navigate('/meetings')} />,
    followUps: <StatCard label="ملفات تستوجب المتابعة" value={data.followUps} tone={data.followUps ? 'orange' : 'green'} icon={<FolderOpen />} onClick={() => navigate('/parents')} />,
  };

  const series = dailyAttendanceSeries(data.recentAtt).map((d) => ({ ...d, label: `${dayName(d.date).slice(0, 3)} ${d.date.slice(8)}/${d.date.slice(5, 7)}` }));
  const byLevel = settings.levels
    .map((lvl) => ({ name: lvl, value: data.students.filter((s) => s.level === lvl).length }))
    .filter((x) => x.value > 0);
  const otherLevel = data.students.filter((s) => !settings.levels.includes(s.level)).length;
  if (otherLevel) byLevel.push({ name: 'غير محدد', value: otherLevel });

  const statusCounts = (['لم تبدأ', 'قيد الإنجاز', 'مكتملة', 'متأخرة'] as const).map((s) => ({
    status: s,
    count: data.tasks.filter((t) => effectiveTaskStatus(t, today) === s).length,
  }));
  const completion = taskCompletionRate(data.tasks);

  const urgent = openTasks
    .filter((t) => t.priority === 'عاجلة' || t.priority === 'عالية' || effectiveTaskStatus(t, today) === 'متأخرة' || (t.dueDate && t.dueDate <= addDays(today, 3)))
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
    .slice(0, 8);

  const upcoming = [
    ...data.events.map((e) => ({ key: `e${e.id}`, date: e.date, time: e.time, title: e.title, type: e.type, link: '/calendar' })),
    ...data.meetings.filter((m) => m.date <= addDays(today, 14)).map((m) => ({ key: `m${m.id}`, date: m.date, time: m.time, title: m.title, type: 'اجتماع', link: '/meetings' })),
  ]
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    .slice(0, 8);

  const widgets: Record<string, ReactNode> = {
    stats: (
      <div key="stats" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 lg:col-span-2">
        {settings.statCards.map((id) => (
          <div key={id}>{cards[id]}</div>
        ))}
      </div>
    ),
    attendanceChart: (
      <Card key="att" title="مخطط الحضور اليومي (آخر الأيام المسجلة)">
        {series.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={11} reversed />
              <YAxis allowDecimals={false} fontSize={11} orientation="right" />
              <Tooltip />
              <Legend />
              <Bar dataKey="present" name="حاضر" stackId="a" fill="#16a34a" />
              <Bar dataKey="late" name="متأخر" stackId="a" fill="#f97316" />
              <Bar dataKey="absent" name="غائب" stackId="a" fill="#dc2626" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="لم يتم تسجيل الحضور بعد." />
        )}
      </Card>
    ),
    levelChart: (
      <Card key="lvl" title="توزيع التلاميذ حسب المستوى">
        {byLevel.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={byLevel} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2} label={({ value }) => value}>
                {byLevel.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="لا يوجد تلاميذ مسجلون." />
        )}
      </Card>
    ),
    taskProgress: (
      <Card key="tp" title="مؤشرات إنجاز المهام">
        {data.tasks.length ? (
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <span className="text-sm text-slate-500">نسبة الإنجاز</span>
              <span className="text-3xl font-extrabold text-green-600">{completion}%</span>
            </div>
            <ProgressBar value={completion} tone={completion >= 70 ? 'green' : completion >= 40 ? 'orange' : 'red'} />
            <div className="grid grid-cols-2 gap-2 pt-2">
              {statusCounts.map((s) => (
                <div key={s.status} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
                  <Badge tone={taskStatusTone(s.status)}>{s.status}</Badge>
                  <span className="font-bold">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState message="لا توجد مهام مسجلة." />
        )}
      </Card>
    ),
    urgentTasks: (
      <Card key="ut" title="المهام العاجلة" actions={<button className="text-sm text-primary-700 hover:underline" onClick={() => navigate('/tasks')}>عرض الكل</button>}>
        {urgent.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {urgent.map((t) => {
              const st = effectiveTaskStatus(t, today);
              return (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{t.title}</p>
                    <p className="text-xs text-slate-500">{t.dueDate ? `الاستحقاق: ${formatDate(t.dueDate)}` : 'دون أجل'}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                    {st === 'متأخرة' && (
                      <Badge tone="red">
                        <AlertCircle className="ml-1 h-3 w-3" />
                        متأخرة
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState message="لا توجد مهام عاجلة." />
        )}
      </Card>
    ),
    upcoming: (
      <Card key="up" title="المواعيد القادمة (14 يومًا)">
        {upcoming.length ? (
          <ul className="space-y-2">
            {upcoming.map((u) => (
              <li key={u.key}>
                <button onClick={() => navigate(u.link)} className="flex w-full items-center gap-3 rounded-lg p-2 text-right hover:bg-slate-50 dark:hover:bg-slate-700">
                  <div className="w-14 shrink-0 rounded-lg bg-primary-50 py-1 text-center text-primary-700 dark:bg-slate-700 dark:text-primary-100">
                    <div className="text-lg font-bold leading-none">{u.date.slice(8)}</div>
                    <div className="text-[10px]">{dayName(u.date)}</div>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{u.title}</p>
                    <p className="text-xs text-slate-500">
                      {u.type} {u.time && `— ${u.time}`}
                    </p>
                  </div>
                  <CalendarClock className="mr-auto h-4 w-4 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState message="لا توجد مواعيد قادمة." />
        )}
      </Card>
    ),
    activity: (
      <Card key="act" title="آخر العمليات المسجلة">
        {data.activity.length ? (
          <ul className="space-y-2 text-sm">
            {data.activity.map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                <Badge tone={a.action === 'حذف' ? 'red' : a.action === 'إضافة' ? 'green' : 'blue'}>{a.action}</Badge>
                <span className="flex-1">
                  {a.entity}: <strong>{a.label}</strong>
                </span>
                <span className="whitespace-nowrap text-xs text-slate-400">{formatDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState message="لم تُسجَّل أي عملية بعد." />
        )}
      </Card>
    ),
  };

  const isEmpty = !data.students.length && !data.teachersCount && !data.classesCount && !data.tasks.length;

  return (
    <div>
      <PageHeader title="لوحة القيادة" subtitle={`${dayName(today)} ${formatDate(today)} — السنة الدراسية ${settings.schoolYear}`} />
      {isEmpty && (
        <Card className="mb-4 border-primary-100 bg-primary-50 dark:bg-slate-800">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            مرحبًا بك! قاعدة البيانات فارغة. ابدأ بضبط <button className="font-bold text-primary-700 underline" onClick={() => navigate('/settings')}>إعدادات المؤسسة</button>، ثم أنشئ{' '}
            <button className="font-bold text-primary-700 underline" onClick={() => navigate('/classes')}>الأقسام</button> وأضف{' '}
            <button className="font-bold text-primary-700 underline" onClick={() => navigate('/teachers')}>المعلمين</button> و
            <button className="font-bold text-primary-700 underline" onClick={() => navigate('/students')}>التلاميذ</button>. جميع المؤشرات تُحسب من بياناتك الفعلية.
          </p>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{settings.dashboardWidgets.map((w) => widgets[w])}</div>
    </div>
  );
}
