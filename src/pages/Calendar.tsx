import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { EntityFormModal, opts, type FieldDef, type Values } from '../components/EntityForm';
import { Badge, Button, Card, EmptyState, IconButton, PageHeader, Select, useConfirm } from '../components/ui';
import { useApp } from '../context/AppContext';
import { db } from '../db/db';
import { deleteRecord, saveRecord } from '../db/repo';
import type { CalendarEvent } from '../db/types';
import { AR_DAYS, AR_MONTHS, formatDate, todayISO } from '../lib/utils';
import { CHART_COLORS } from './Dashboard';

interface DayItem {
  key: string;
  title: string;
  type: string;
  color: string;
  event?: CalendarEvent;
  time?: string;
}

export function CalendarPage() {
  const { settings, run } = useApp();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const [cursor, setCursor] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState<Values | null>(null);
  const [typeFilter, setTypeFilter] = useState('');

  const data = useLiveQuery(async () => ({
    events: await db.events.toArray(),
    meetings: await db.meetings.toArray(),
    exams: await db.exams.toArray(),
    tasks: await db.tasks.filter((t) => !!t.dueDate && t.status !== 'مكتملة').toArray(),
  }), []);

  const colorOf = (type: string) => CHART_COLORS[Math.max(0, settings.eventTypes.indexOf(type)) % CHART_COLORS.length];

  const newEvent = (date = selected): Values => ({ title: '', type: settings.eventTypes[0] ?? '', date, endDate: '', time: '', location: '', description: '', reminderDays: 1 });

  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing(newEvent(today));
      params.delete('new');
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Index all items per day: own events (multi-day), plus meetings, exams and task deadlines from other modules.
  const byDay = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    const push = (d: string, item: DayItem) => {
      if (typeFilter && item.type !== typeFilter) return;
      map.set(d, [...(map.get(d) ?? []), item]);
    };
    if (!data) return map;
    for (const e of data.events) {
      const end = e.endDate && e.endDate > e.date ? e.endDate : e.date;
      let d = e.date;
      let guard = 0;
      while (d <= end && guard++ < 400) {
        push(d, { key: `e${e.id}-${d}`, title: e.title, type: e.type, color: colorOf(e.type), event: e, time: e.time });
        const [y, m, dd] = d.split('-').map(Number);
        d = todayISO(new Date(y, m - 1, dd + 1));
      }
    }
    for (const m of data.meetings) push(m.date, { key: `m${m.id}`, title: m.title, type: 'اجتماع', color: colorOf('اجتماع'), time: m.time });
    for (const x of data.exams) push(x.date, { key: `x${x.id}`, title: `${x.title} (${x.subject})`, type: 'امتحان', color: colorOf('امتحان') });
    for (const t of data.tasks) push(t.dueDate, { key: `t${t.id}`, title: `أجل مهمة: ${t.title}`, type: 'موعد نهائي', color: colorOf('موعد نهائي') });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, typeFilter, settings.eventTypes]);

  const first = new Date(cursor.y, cursor.m, 1);
  const startPad = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(startPad).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => todayISO(new Date(cursor.y, cursor.m, i + 1)))];
  while (cells.length % 7) cells.push(null);
  const weekDays = [...AR_DAYS.slice(1), AR_DAYS[0]];

  const shift = (n: number) => setCursor((c) => {
    const d = new Date(c.y, c.m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const fields: FieldDef[] = [
    { name: 'title', label: 'العنوان', type: 'text', required: true, full: true },
    { name: 'type', label: 'النوع', type: 'select', required: true, options: opts(settings.eventTypes) },
    { name: 'time', label: 'الساعة', type: 'time' },
    { name: 'date', label: 'التاريخ', type: 'date', required: true },
    { name: 'endDate', label: 'إلى تاريخ (اختياري)', type: 'date' },
    { name: 'location', label: 'المكان', type: 'text' },
    { name: 'reminderDays', label: 'التذكير قبل (أيام)', type: 'number', min: 0, max: 60 },
    { name: 'description', label: 'التفاصيل', type: 'textarea' },
  ];

  const remove = async (e: CalendarEvent) => {
    if (await confirm({ message: `حذف الحدث "${e.title}"؟` })) await run(() => deleteRecord('events', e.id!, e.title), 'تم حذف الحدث.');
  };

  const dayItems = byDay.get(selected) ?? [];

  return (
    <div>
      <PageHeader
        title="الروزنامة السنوية"
        subtitle="المواعيد والاجتماعات والامتحانات والأنشطة والعطل"
        icon={<CalendarDays />}
        actions={
          <Button onClick={() => setEditing(newEvent())}>
            <Plus className="h-4 w-4" /> إضافة حدث
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => shift(-1)} aria-label="الشهر السابق">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <h2 className="w-40 text-center text-lg font-bold">
              {AR_MONTHS[cursor.m]} {cursor.y}
            </h2>
            <Button variant="secondary" size="sm" onClick={() => shift(1)} aria-label="الشهر التالي">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCursor({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 });
                setSelected(today);
              }}
            >
              اليوم
            </Button>
            <div className="flex-1" />
            <Select value={typeFilter} onChange={setTypeFilter} placeholder="كل الأنواع" options={settings.eventTypes.map((t) => ({ value: t, label: t }))} />
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500">
            {weekDays.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) =>
              d ? (
                <button
                  key={d}
                  onClick={() => setSelected(d)}
                  onDoubleClick={() => setEditing(newEvent(d))}
                  className={`min-h-[72px] rounded-lg border p-1 text-right align-top transition md:min-h-[96px] ${
                    d === selected ? 'border-primary-700 ring-2 ring-primary-100' : 'border-slate-200 dark:border-slate-700'
                  } ${d === today ? 'bg-primary-50 dark:bg-slate-700' : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700'}`}
                >
                  <div className={`text-xs font-bold ${d === today ? 'text-primary-700 dark:text-primary-100' : ''}`}>{Number(d.slice(8))}</div>
                  <div className="mt-0.5 space-y-0.5">
                    {(byDay.get(d) ?? []).slice(0, 3).map((it) => (
                      <div key={it.key} className="truncate rounded px-1 text-[10px] text-white" style={{ background: it.color }}>
                        {it.title}
                      </div>
                    ))}
                    {(byDay.get(d)?.length ?? 0) > 3 && <div className="text-[10px] text-slate-500">+{byDay.get(d)!.length - 3}</div>}
                  </div>
                </button>
              ) : (
                <div key={`pad${i}`} />
              ),
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {settings.eventTypes.map((t) => (
              <span key={t} className="flex items-center gap-1 text-xs text-slate-500">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(t) }} />
                {t}
              </span>
            ))}
          </div>
        </Card>
        <Card
          title={formatDate(selected)}
          actions={
            <Button size="sm" onClick={() => setEditing(newEvent())}>
              <Plus className="h-4 w-4" />
            </Button>
          }
        >
          {!dayItems.length ? (
            <EmptyState message="لا توجد أحداث في هذا اليوم." />
          ) : (
            <ul className="space-y-2">
              {dayItems.map((it) => (
                <li key={it.key} className="rounded-lg border-r-4 bg-slate-50 p-2 dark:bg-slate-900" style={{ borderColor: it.color }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{it.title}</div>
                      <div className="text-xs text-slate-500">
                        <Badge>{it.type}</Badge> {it.time} {it.event?.location}
                      </div>
                      {it.event?.description && <p className="mt-1 whitespace-pre-line text-xs text-slate-600 dark:text-slate-300">{it.event.description}</p>}
                      {!it.event && <p className="mt-1 text-[11px] text-slate-400">من وحدة {it.type === 'اجتماع' ? 'الاجتماعات' : it.type === 'امتحان' ? 'الامتحانات' : 'المهام'}</p>}
                    </div>
                    {it.event && (
                      <div className="flex">
                        <IconButton title="تعديل" onClick={() => setEditing({ ...it.event })}>
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton title="حذف" tone="danger" onClick={() => remove(it.event!)}>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <EntityFormModal
        open={!!editing}
        title={editing?.id ? 'تعديل حدث' : 'إضافة حدث'}
        fields={fields}
        initial={editing ?? {}}
        onClose={() => setEditing(null)}
        extraValidate={(v) => (v.endDate && String(v.endDate) < String(v.date) ? { endDate: 'تاريخ النهاية قبل تاريخ البداية.' } : {})}
        onSubmit={(v) => run(() => saveRecord('events', v as unknown as CalendarEvent, String(v.title)), v.id ? 'تم تعديل الحدث.' : 'تمت إضافة الحدث.')}
      />
    </div>
  );
}
