import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useApp } from '../context/AppContext';
import { addDays, formatDate, fullName, todayISO } from '../lib/utils';
import { effectiveTaskStatus, repeatedAbsences } from '../lib/stats';

export interface AppNotification {
  id: string;
  level: 'danger' | 'warning' | 'info';
  title: string;
  detail: string;
  link: string;
}

/** Notifications derived live from the database (nothing is hard-coded). */
export function useNotifications(): AppNotification[] | undefined {
  const { settings } = useApp();
  return useLiveQuery(async () => {
    const today = todayISO();
    const out: AppNotification[] = [];

    const tasks = await db.tasks.toArray();
    for (const t of tasks) {
      const st = effectiveTaskStatus(t, today);
      if (st === 'متأخرة') {
        out.push({ id: `task-${t.id}`, level: 'danger', title: `مهمة متأخرة: ${t.title}`, detail: `تاريخ الاستحقاق ${formatDate(t.dueDate)}`, link: '/tasks' });
      } else if (st !== 'مكتملة' && t.dueDate && t.dueDate <= addDays(today, 2)) {
        out.push({ id: `task-soon-${t.id}`, level: 'warning', title: `مهمة قريبة الأجل: ${t.title}`, detail: `تستحق في ${formatDate(t.dueDate)}`, link: '/tasks' });
      }
    }

    const events = await db.events.where('date').between(today, addDays(today, 30), true, true).toArray();
    for (const e of events) {
      const remindFrom = addDays(e.date, -(e.reminderDays || 0));
      if (today >= remindFrom) {
        out.push({ id: `event-${e.id}`, level: 'info', title: `${e.type}: ${e.title}`, detail: `${formatDate(e.date)} ${e.time || ''}`, link: '/calendar' });
      }
    }

    const meetings = await db.meetings.toArray();
    for (const m of meetings) {
      if (m.date >= today && m.date <= addDays(today, 3)) {
        out.push({ id: `meeting-${m.id}`, level: 'info', title: `اجتماع قادم: ${m.title}`, detail: `${formatDate(m.date)} ${m.time || ''}`, link: '/meetings' });
      }
      m.actions?.forEach((a, i) => {
        if (!a.done && a.deadline && a.deadline < today) {
          out.push({ id: `mact-${m.id}-${i}`, level: 'danger', title: `أجل تنفيذ قرار تجاوز: ${a.action}`, detail: `${a.owner || ''} — ${formatDate(a.deadline)}`, link: '/meetings' });
        }
      });
    }

    const exams = await db.exams.toArray();
    for (const e of exams) {
      if (!e.subjectReceived && e.subjectDueDate && e.subjectDueDate <= addDays(today, 3)) {
        out.push({
          id: `exam-${e.id}`,
          level: e.subjectDueDate < today ? 'danger' : 'warning',
          title: `موضوع امتحان غير مستلم: ${e.title}`,
          detail: `${e.subject} — أجل التسليم ${formatDate(e.subjectDueDate)}`,
          link: '/exams',
        });
      }
    }

    const monthAgo = addDays(today, -30);
    const att = await db.studentAttendance.where('date').between(monthAgo, today, true, true).toArray();
    const repeated = repeatedAbsences(att, settings.absenceAlertThreshold);
    if (repeated.length) {
      const students = await db.students.bulkGet(repeated.slice(0, 5).map((r) => r.studentId));
      out.push({
        id: 'absences',
        level: 'warning',
        title: `غيابات متكررة (${repeated.length} تلميذ) خلال 30 يومًا`,
        detail: students.map((s) => fullName(s)).join('، '),
        link: '/attendance?tab=repeated',
      });
    }

    const contacts = await db.parentContacts.toArray();
    for (const c of contacts) {
      if (!c.closed && c.followUpDate && c.followUpDate <= today) {
        out.push({ id: `pc-${c.id}`, level: 'warning', title: `متابعة ولي: ${c.guardianName}`, detail: `${c.subject} — ${formatDate(c.followUpDate)}`, link: '/parents' });
      }
    }

    const order = { danger: 0, warning: 1, info: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }, [settings.absenceAlertThreshold]);
}
