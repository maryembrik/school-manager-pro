import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileText, Plus, Trash2, UsersRound } from 'lucide-react';
import { CrudSection } from '../components/CrudPage';
import { opts, type FieldDef } from '../components/EntityForm';
import { Badge, Button, IconButton, Label, PageHeader, Select, inputClass } from '../components/ui';
import { useApp } from '../context/AppContext';
import { db } from '../db/db';
import type { Meeting, MeetingAction } from '../db/types';
import { escapeHtml, printHtml } from '../lib/exporters';
import { dayName, formatDate, todayISO } from '../lib/utils';

function lines(text: string) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Build the printable minutes (محضر جلسة) in a standard Arabic administrative layout. */
export function minutesHtml(m: Meeting, schoolName: string, director: string) {
  const list = (text: string) => {
    const items = lines(text);
    return items.length ? `<ol>${items.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ol>` : '<p class="muted">—</p>';
  };
  const actions = m.actions?.length
    ? `<table><thead><tr><th>الإجراء</th><th>المسؤول</th><th>أجل التنفيذ</th><th>الحالة</th></tr></thead><tbody>${m.actions
        .map((a) => `<tr><td>${escapeHtml(a.action)}</td><td>${escapeHtml(a.owner)}</td><td>${escapeHtml(formatDate(a.deadline))}</td><td>${a.done ? 'منجز' : 'قيد المتابعة'}</td></tr>`)
        .join('')}</tbody></table>`
    : '<p class="muted">—</p>';
  return `
  <p>إنه في يوم ${escapeHtml(dayName(m.date))} ${escapeHtml(formatDate(m.date))}${m.time ? `، على الساعة ${escapeHtml(m.time)}` : ''}${m.location ? `، بـ${escapeHtml(m.location)}` : ''}،
  انعقد ${escapeHtml(m.type || 'اجتماع')} بـ${escapeHtml(schoolName)}${m.chair ? ` برئاسة ${escapeHtml(m.chair)}` : ''}، وذلك للنظر في جدول الأعمال التالي.</p>
  <h2>الحاضرون</h2><div class="box">${escapeHtml(m.attendees || '—')}</div>
  ${m.absentees ? `<h2>المتغيبون</h2><div class="box">${escapeHtml(m.absentees)}</div>` : ''}
  <h2>جدول الأعمال</h2>${list(m.agenda)}
  ${m.discussion ? `<h2>سير الجلسة والنقاش</h2><div class="box">${escapeHtml(m.discussion)}</div>` : ''}
  <h2>القرارات</h2>${list(m.decisions)}
  <h2>التوصيات</h2>${list(m.recommendations)}
  <h2>توزيع المسؤوليات وآجال التنفيذ</h2>${actions}
  <p>ورُفعت الجلسة بعد استيفاء جدول الأعمال.</p>
  <div class="sig"><span>كاتب الجلسة</span><span>رئيس الجلسة / المدير: ${escapeHtml(m.chair || director)}</span></div>`;
}

function ActionsEditor({ value, onChange }: { value: MeetingAction[]; onChange: (v: MeetingAction[]) => void }) {
  const update = (i: number, patch: Partial<MeetingAction>) => onChange(value.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <div className="md:col-span-2">
      <Label>المسؤوليات وآجال التنفيذ</Label>
      <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        {value.map((a, i) => (
          <div key={i} className="grid grid-cols-1 items-center gap-2 md:grid-cols-[2fr_1fr_150px_auto_auto]">
            <input className={inputClass} placeholder="الإجراء / القرار" value={a.action} onChange={(e) => update(i, { action: e.target.value })} />
            <input className={inputClass} placeholder="المسؤول" value={a.owner} onChange={(e) => update(i, { owner: e.target.value })} />
            <input type="date" className={inputClass} value={a.deadline} onChange={(e) => update(i, { deadline: e.target.value })} />
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={a.done} onChange={(e) => update(i, { done: e.target.checked })} /> منجز
            </label>
            <IconButton title="حذف" tone="danger" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => onChange([...value, { action: '', owner: '', deadline: '', done: false }])}>
          <Plus className="h-4 w-4" /> إضافة مسؤولية
        </Button>
      </div>
    </div>
  );
}

export function MeetingsPage() {
  const { settings, printHeader, run } = useApp();
  const rows = useLiveQuery(() => db.meetings.orderBy('date').reverse().toArray(), []);
  const [type, setType] = useState('');
  const [when, setWhen] = useState('');
  const today = todayISO();

  const fields: FieldDef[] = [
    { name: 'title', label: 'عنوان الاجتماع', type: 'text', required: true, full: true },
    { name: 'type', label: 'نوع الاجتماع', type: 'select', options: opts(settings.meetingTypes) },
    { name: 'chair', label: 'رئيس الجلسة', type: 'text' },
    { name: 'date', label: 'التاريخ', type: 'date', required: true },
    { name: 'time', label: 'الساعة', type: 'time' },
    { name: 'location', label: 'المكان', type: 'text', full: true },
    { name: 'attendees', label: 'الحاضرون', type: 'textarea' },
    { name: 'absentees', label: 'المتغيبون', type: 'textarea' },
    { name: 'agenda', label: 'جدول الأعمال (نقطة في كل سطر)', type: 'textarea' },
    { name: 'discussion', label: 'سير الجلسة والنقاش', type: 'textarea' },
    { name: 'decisions', label: 'القرارات (قرار في كل سطر)', type: 'textarea' },
    { name: 'recommendations', label: 'التوصيات (توصية في كل سطر)', type: 'textarea' },
  ];

  const printMinutes = (m: Meeting) => run(async () => printHtml(`محضر ${m.title}`, minutesHtml(m, settings.schoolName, settings.directorName), printHeader));

  return (
    <div>
      <PageHeader title="الاجتماعات والمحاضر" subtitle="إدارة الاجتماعات وتوليد المحاضر القابلة للطباعة" icon={<UsersRound />} />
      <CrudSection<Meeting>
        table="meetings"
        entityName="اجتماع"
        rows={rows}
        fields={fields}
        defaults={() => ({
          title: '',
          type: settings.meetingTypes[0] ?? '',
          date: today,
          time: '',
          location: '',
          chair: settings.directorName,
          attendees: '',
          absentees: '',
          agenda: '',
          discussion: '',
          decisions: '',
          recommendations: '',
          actions: [],
        })}
        labelOf={(m) => m.title}
        searchOf={(m) => [m.title, m.type, m.attendees, m.decisions, m.agenda]}
        filterFn={(m) => (!type || m.type === type) && (!when || (when === 'upcoming' ? m.date >= today : m.date < today))}
        filters={
          <>
            <Select value={when} onChange={setWhen} placeholder="الكل" options={[{ value: 'upcoming', label: 'القادمة' }, { value: 'past', label: 'السابقة' }]} />
            <Select value={type} onChange={setType} placeholder="كل الأنواع" options={settings.meetingTypes.map((t) => ({ value: t, label: t }))} />
          </>
        }
        formExtra={(values, set) => <ActionsEditor value={(values.actions as MeetingAction[]) ?? []} onChange={(v) => set('actions', v)} />}
        beforeSave={(v) => ({ ...v, actions: ((v.actions as MeetingAction[]) ?? []).filter((a) => a.action.trim()) })}
        extraActions={(m) => (
          <IconButton title="توليد المحضر (طباعة/PDF)" onClick={() => printMinutes(m)}>
            <FileText className="h-4 w-4" />
          </IconButton>
        )}
        exportName="الاجتماعات"
        exportColumns={[
          { header: 'العنوان', value: (m) => m.title },
          { header: 'النوع', value: (m) => m.type },
          { header: 'التاريخ', value: (m) => m.date },
          { header: 'الساعة', value: (m) => m.time },
          { header: 'الحاضرون', value: (m) => m.attendees },
          { header: 'القرارات', value: (m) => m.decisions },
          { header: 'التوصيات', value: (m) => m.recommendations },
        ]}
        columns={[
          { header: 'الاجتماع', render: (m) => <span className="font-semibold">{m.title}</span>, sortValue: (m) => m.title },
          { header: 'النوع', render: (m) => m.type || '—' },
          { header: 'التاريخ', render: (m) => `${formatDate(m.date)} ${m.time || ''}`, sortValue: (m) => m.date + (m.time || '') },
          { header: 'الحالة', render: (m) => (m.date >= today ? <Badge tone="blue">قادم</Badge> : <Badge>منعقد</Badge>) },
          {
            header: 'المسؤوليات',
            render: (m) => {
              const total = m.actions?.length ?? 0;
              if (!total) return '—';
              const done = m.actions.filter((a) => a.done).length;
              const late = m.actions.filter((a) => !a.done && a.deadline && a.deadline < today).length;
              return (
                <span className="flex gap-1">
                  <Badge tone="green">
                    {done}/{total}
                  </Badge>
                  {late > 0 && <Badge tone="red">{late} متأخرة</Badge>}
                </span>
              );
            },
          },
        ]}
      />
    </div>
  );
}
