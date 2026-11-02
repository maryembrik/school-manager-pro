// Turning spreadsheet rows (keyed by Arabic column headers) into records.
// Kept free of React and of the database so the rules can be tested directly.
import { MAX_CLASS_TEACHERS, type SchoolClass, type Teacher } from '../db/types';
import { normalize } from './utils';

export type Row = Record<string, unknown>;

export interface ParseResult<T> {
  valid: T[];
  /** Spreadsheet line numbers (header = line 1) that were not imported, with the reason. */
  skipped: { line: number; reason: string }[];
}

export const TEACHER_HEADERS = ['الاسم', 'اللقب', 'الهاتف', 'البريد الإلكتروني', 'الاختصاص', 'المستوى', 'تاريخ الالتحاق', 'ملاحظات'];
export const CLASS_TEACHER_HEADERS = Array.from({ length: MAX_CLASS_TEACHERS }, (_, i) => `المعلم ${i + 1}`);
export const CLASS_HEADERS = ['القسم', 'المستوى', ...CLASS_TEACHER_HEADERS, 'القاعة', 'طاقة الاستيعاب', 'ملاحظات'];
// Column names used by earlier templates, still accepted for teachers 1 and 2.
const LEGACY_TEACHER_HEADERS = ['المعلم الأول', 'المعلم الثاني'];

const cell = (r: Row, h: string) => String(r[h] ?? '').trim();
const nameKey = (s: string) => normalize(s).replace(/\s+/g, ' ').trim();

/** Accepts YYYY-MM-DD or day/month/year (also with . or -); anything else becomes ''. */
export function normalizeDate(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
}

export function parseTeacherRows(rows: Row[], existing: Teacher[]): ParseResult<Teacher> {
  const seen = new Set(existing.map((t) => nameKey(`${t.firstName} ${t.lastName}`)));
  const result: ParseResult<Teacher> = { valid: [], skipped: [] };
  rows.forEach((r, i) => {
    const line = i + 2;
    const firstName = cell(r, 'الاسم');
    const lastName = cell(r, 'اللقب');
    if (!firstName || !lastName) return result.skipped.push({ line, reason: 'الاسم أو اللقب مفقود' });
    const key = nameKey(`${firstName} ${lastName}`);
    if (seen.has(key)) return result.skipped.push({ line, reason: 'المعلم موجود مسبقًا' });
    seen.add(key);
    result.valid.push({
      firstName,
      lastName,
      phone: cell(r, 'الهاتف'),
      email: cell(r, 'البريد الإلكتروني'),
      specialty: cell(r, 'الاختصاص'),
      levels: cell(r, 'المستوى'),
      hireDate: normalizeDate(r['تاريخ الالتحاق']),
      notes: cell(r, 'ملاحظات'),
      needsFollowUp: false,
    });
  });
  return result;
}

/**
 * Teachers ("المعلم 1" … "المعلم 5") are matched by "first last" name, ignoring hamza/spacing
 * differences; a teacher listed twice on one row is kept once.
 */
export function parseClassRows(
  rows: Row[],
  existing: SchoolClass[],
  teachers: Teacher[],
  levels: string[],
): ParseResult<SchoolClass> & { unmatchedTeachers: string[] } {
  const seen = new Set(existing.map((c) => c.name.trim()));
  const teacherByName = new Map(teachers.map((t) => [nameKey(`${t.firstName} ${t.lastName}`), t.id]));
  const unmatched = new Set<string>();
  const result: ParseResult<SchoolClass> = { valid: [], skipped: [] };
  rows.forEach((r, i) => {
    const line = i + 2;
    const name = cell(r, 'القسم');
    const level = cell(r, 'المستوى');
    if (!name) return result.skipped.push({ line, reason: 'اسم القسم مفقود' });
    if (!levels.includes(level)) return result.skipped.push({ line, reason: `المستوى "${level || '—'}" غير موجود في الإعدادات` });
    if (seen.has(name)) return result.skipped.push({ line, reason: 'القسم موجود مسبقًا' });
    seen.add(name);
    const teacherIds: number[] = [];
    CLASS_TEACHER_HEADERS.forEach((h, i) => {
      const n = cell(r, h) || (LEGACY_TEACHER_HEADERS[i] ? cell(r, LEGACY_TEACHER_HEADERS[i]) : '');
      if (!n) return;
      const id = teacherByName.get(nameKey(n));
      if (id === undefined) unmatched.add(n);
      else if (!teacherIds.includes(id)) teacherIds.push(id);
    });
    const capacity = Number(cell(r, 'طاقة الاستيعاب'));
    result.valid.push({
      name,
      level,
      teacherIds,
      room: cell(r, 'القاعة'),
      capacity: Number.isFinite(capacity) && capacity > 0 ? Math.round(capacity) : 30,
      schedule: [],
      notes: cell(r, 'ملاحظات'),
    });
  });
  return { ...result, unmatchedTeachers: [...unmatched] };
}

/** One-line summary of skipped lines for a toast. */
export function skippedSummary(skipped: ParseResult<unknown>['skipped']) {
  if (!skipped.length) return '';
  const shown = skipped.slice(0, 10).map((s) => `السطر ${s.line}: ${s.reason}`).join('\n');
  return `\nلم يُستورد ${skipped.length} سطر:\n${shown}${skipped.length > 10 ? '\n…' : ''}`;
}
