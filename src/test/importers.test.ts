// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SchoolClass, Teacher } from '../db/types';
import { normalizeDate, parseClassRows, parseTeacherRows } from '../lib/importers';

const LEVELS = ['السنة الأولى', 'السنة الثانية'];

function teacher(firstName: string, lastName: string, id: number): Teacher {
  return { id, firstName, lastName, phone: '', email: '', specialty: '', levels: '', hireDate: '', notes: '', needsFollowUp: false };
}

describe('Teacher import', () => {
  it('imports valid rows and reports missing names and duplicates by line', () => {
    const { valid, skipped } = parseTeacherRows(
      [
        { الاسم: 'سامي', اللقب: 'الهمامي', الهاتف: '98111222', 'تاريخ الالتحاق': '01/09/2015', الاختصاص: 'الرياضيات' },
        { الاسم: '', اللقب: 'بدون اسم' },
        { الاسم: 'منى', اللقب: 'الشابي' }, // already in the database
        { الاسم: 'سامي', اللقب: 'الهمامي' }, // duplicate inside the file
      ],
      [teacher('منى', 'الشابي', 1)],
    );
    expect(valid).toHaveLength(1);
    expect(valid[0]).toMatchObject({ firstName: 'سامي', phone: '98111222', hireDate: '2015-09-01', specialty: 'الرياضيات' });
    expect(skipped.map((s) => s.line)).toEqual([3, 4, 5]);
  });
});

describe('Class import', () => {
  const teachers = [teacher('أحمد', 'بن علي', 7), teacher('سارة', 'العياري', 8)];

  it('links teachers by name (tolerating hamza) and validates level and duplicates', () => {
    const existing = [{ name: '2 أ', level: 'السنة الثانية', teacherIds: [], room: '', capacity: 30, schedule: [], notes: '' } as SchoolClass];
    const { valid, skipped, unmatchedTeachers } = parseClassRows(
      [
        // Old template column names are still understood.
        { القسم: '1 أ', المستوى: 'السنة الأولى', 'المعلم الأول': 'احمد بن علي', 'المعلم الثاني': 'سارة العياري', 'طاقة الاستيعاب': '28' },
        { القسم: '1 ب', المستوى: 'السنة الأولى', 'المعلم 1': 'معلم مجهول' },
        { القسم: '9 أ', المستوى: 'السنة التاسعة' },
        { القسم: '2 أ', المستوى: 'السنة الثانية' },
        { القسم: '', المستوى: 'السنة الأولى' },
      ],
      existing,
      teachers,
      LEVELS,
    );
    expect(valid).toHaveLength(2);
    expect(valid[0]).toMatchObject({ name: '1 أ', teacherIds: [7, 8], capacity: 28 });
    expect(valid[1]).toMatchObject({ name: '1 ب', teacherIds: [], capacity: 30 });
    expect(unmatchedTeachers).toEqual(['معلم مجهول']);
    expect(skipped.map((s) => s.line)).toEqual([4, 5, 6]);
  });

  it('reads up to five teachers per class, in order, without repeats', () => {
    const five = [1, 2, 3, 4, 5].map((i) => teacher(`معلم${i}`, 'تجربة', i));
    const { valid } = parseClassRows(
      [{ القسم: '5 أ', المستوى: 'السنة الأولى', 'المعلم 1': 'معلم3 تجربة', 'المعلم 2': 'معلم1 تجربة', 'المعلم 3': 'معلم3 تجربة', 'المعلم 4': 'معلم5 تجربة', 'المعلم 5': 'معلم2 تجربة' }],
      [],
      five,
      LEVELS,
    );
    expect(valid[0].teacherIds).toEqual([3, 1, 5, 2]);
  });
});

describe('Date cells', () => {
  it('reads ISO and day/month/year dates', () => {
    expect(normalizeDate('2017-03-15')).toBe('2017-03-15');
    expect(normalizeDate('15/03/2017')).toBe('2017-03-15');
    expect(normalizeDate('5.3.17')).toBe('2017-03-05');
    expect(normalizeDate('n/a')).toBe('');
  });
});
