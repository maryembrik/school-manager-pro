// Pure computations used by the dashboard, exams and reports. Kept free of UI and DB code so they are testable.
import type { Exam, Grade, StudentAttendance, Task } from '../db/types';
import { round, todayISO } from './utils';

/** Score normalized to the /20 scale (or the configured max). Null when absent or empty. */
export function normalizedScore(grade: Grade | undefined, exam: Exam, scale = 20): number | null {
  if (!grade || grade.absent || grade.score === null || grade.score === undefined) return null;
  if (!exam.maxScore) return null;
  return (grade.score / exam.maxScore) * scale;
}

/** Weighted average of a student across exams (coefficients), on the given scale. */
export function studentAverage(studentId: number, exams: Exam[], grades: Grade[], scale = 20): number | null {
  let sum = 0;
  let weights = 0;
  for (const exam of exams) {
    const g = grades.find((x) => x.examId === exam.id && x.studentId === studentId);
    const s = normalizedScore(g, exam, scale);
    if (s === null) continue;
    const c = exam.coefficient || 1;
    sum += s * c;
    weights += c;
  }
  return weights ? round(sum / weights) : null;
}

export interface ExamStats {
  count: number;
  average: number | null;
  min: number | null;
  max: number | null;
  passRate: number | null; // percentage
  passCount: number;
}

export function examStats(exam: Exam, grades: Grade[], passMark: number, scale = 20): ExamStats {
  const scores = grades
    .filter((g) => g.examId === exam.id)
    .map((g) => normalizedScore(g, exam, scale))
    .filter((s): s is number => s !== null);
  if (!scores.length) return { count: 0, average: null, min: null, max: null, passRate: null, passCount: 0 };
  const passCount = scores.filter((s) => s >= passMark).length;
  return {
    count: scores.length,
    average: round(scores.reduce((a, b) => a + b, 0) / scores.length),
    min: round(Math.min(...scores)),
    max: round(Math.max(...scores)),
    passRate: round((passCount / scores.length) * 100, 1),
    passCount,
  };
}

/** A task is late when not completed and its due date has passed. */
export function effectiveTaskStatus(t: Task, today = todayISO()): Task['status'] {
  if (t.status === 'مكتملة') return 'مكتملة';
  if (t.dueDate && t.dueDate < today) return 'متأخرة';
  return t.status === 'متأخرة' ? 'قيد الإنجاز' : t.status;
}

export function taskCompletionRate(tasks: Task[]) {
  if (!tasks.length) return 0;
  return round((tasks.filter((t) => t.status === 'مكتملة').length / tasks.length) * 100, 0);
}

/** Students whose absences in the list reach the threshold, sorted by count. */
export function repeatedAbsences(records: StudentAttendance[], threshold: number) {
  const counts = new Map<number, { absent: number; late: number; unjustified: number }>();
  for (const r of records) {
    if (r.status === 'present') continue;
    const c = counts.get(r.studentId) ?? { absent: 0, late: 0, unjustified: 0 };
    if (r.status === 'absent') {
      c.absent++;
      if (!r.justified) c.unjustified++;
    } else c.late++;
    counts.set(r.studentId, c);
  }
  return [...counts.entries()]
    .filter(([, c]) => c.absent >= threshold)
    .map(([studentId, c]) => ({ studentId, ...c }))
    .sort((a, b) => b.absent - a.absent);
}

/** Daily attendance counts for a date range (only days that have records). */
export function dailyAttendanceSeries(records: StudentAttendance[]) {
  const byDay = new Map<string, { date: string; present: number; absent: number; late: number }>();
  for (const r of records) {
    const d = byDay.get(r.date) ?? { date: r.date, present: 0, absent: 0, late: 0 };
    d[r.status]++;
    byDay.set(r.date, d);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}
