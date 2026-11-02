// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { db, SchoolDB } from '../db/db';
import { deleteRecord, saveRecord, saveWithAttachment, setGrade, setStudentAttendance } from '../db/repo';
import type { DocumentRecord, Exam, SchoolClass, Student, Task, Teacher } from '../db/types';
import { createBackup, restoreBackup, validateBackup, wipeAllData } from '../lib/backup';
import { createRecoveryCode, hasRecoveryCode, resetPasswordWithRecoveryCode, setPassword, verifyPassword } from '../lib/auth';
import { examStats, effectiveTaskStatus, repeatedAbsences, studentAverage } from '../lib/stats';
import { validateFields } from '../components/EntityForm';
import { loadSettings, sanitizeSettings, saveSettings } from '../lib/settings';

function student(partial: Partial<Student> = {}): Student {
  return {
    firstName: 'أحمد',
    lastName: 'بن علي',
    gender: 'ذكر',
    birthDate: '2016-03-01',
    level: 'السنة الرابعة',
    registrationNumber: '',
    guardianName: 'علي',
    guardianRelation: 'الأب',
    guardianPhone: '98000000',
    guardianPhone2: '',
    guardianEmail: '',
    address: '',
    healthNotes: '',
    notes: '',
    needsFollowUp: false,
    ...partial,
  };
}

function exam(partial: Partial<Exam> = {}): Exam {
  return {
    title: 'فرض',
    level: 'السنة الرابعة',
    subject: 'الرياضيات',
    term: 'الثلاثي الأول',
    date: '2026-10-10',
    maxScore: 20,
    coefficient: 1,
    subjectDueDate: '',
    subjectReceived: false,
    subjectReceivedDate: '',
    correctionStatus: 'لم يبدأ',
    notes: '',
    ...partial,
  };
}

beforeEach(async () => {
  await wipeAllData();
  await db.meta.clear();
  localStorage.clear();
});

describe('CRUD: add, edit, delete', () => {
  it('adds a student with timestamps and logs the operation', async () => {
    const id = await saveRecord('students', student(), 'أحمد بن علي');
    const s = await db.students.get(id);
    expect(s?.firstName).toBe('أحمد');
    expect(s?.createdAt).toBeTruthy();
    const log = await db.activity.toArray();
    expect(log.at(-1)).toMatchObject({ action: 'إضافة', label: 'أحمد بن علي' });
  });

  it('edits a student, keeping fields not included in the update', async () => {
    const id = await saveRecord('students', student({ notes: 'ملاحظة' }), 'x');
    await saveRecord('students', { id, firstName: 'محمد' } as Student, 'x');
    const s = await db.students.get(id);
    expect(s?.firstName).toBe('محمد');
    expect(s?.notes).toBe('ملاحظة');
    expect(s?.updatedAt! >= s?.createdAt!).toBe(true);
  });

  it('deletes a student and its dependent attendance and grades', async () => {
    const id = await saveRecord('students', student(), 'x');
    const other = await saveRecord('students', student({ firstName: 'سارة' }), 'y');
    const examId = await saveRecord('exams', exam(), 'e');
    await setStudentAttendance({ date: '2026-10-01', studentId: id, status: 'absent', reason: '', justified: false });
    await setStudentAttendance({ date: '2026-10-01', studentId: other, status: 'present', reason: '', justified: false });
    await setGrade(examId, id, 12, false);
    await deleteRecord('students', id, 'x');
    expect(await db.students.get(id)).toBeUndefined();
    expect(await db.studentAttendance.where('studentId').equals(id).count()).toBe(0);
    expect(await db.grades.where('studentId').equals(id).count()).toBe(0);
    // Other students' data is untouched.
    expect(await db.studentAttendance.where('studentId').equals(other).count()).toBe(1);
  });

  it('deleting a class unlinks its students instead of deleting them', async () => {
    const classId = await saveRecord<SchoolClass>('classes', { name: '4 أ', level: 'السنة الرابعة', teacherIds: [], room: '', capacity: 30, schedule: [], notes: '' }, '4 أ');
    const sid = await saveRecord('students', student({ classId }), 'x');
    await deleteRecord('classes', classId, '4 أ');
    const s = await db.students.get(sid);
    expect(s).toBeDefined();
    expect(s?.classId).toBeUndefined();
  });

  it('deleting a teacher removes them from every class list and keeps the others', async () => {
    const ids = await Promise.all(['أ', 'ب', 'ج'].map((n) => saveRecord<Teacher>('teachers', { firstName: n, lastName: 'م', phone: '', email: '', specialty: '', levels: '', hireDate: '', notes: '', needsFollowUp: false }, n)));
    const c1 = await saveRecord<SchoolClass>('classes', { name: '1 أ', level: 'السنة الأولى', teacherIds: [ids[0], ids[1], ids[2]], room: '', capacity: 30, schedule: [], notes: '' }, '1 أ');
    const c2 = await saveRecord<SchoolClass>('classes', { name: '1 ب', level: 'السنة الأولى', teacherIds: [ids[1]], room: '', capacity: 30, schedule: [], notes: '' }, '1 ب');
    await deleteRecord('teachers', ids[1], 'ب');
    expect((await db.classes.get(c1))?.teacherIds).toEqual([ids[0], ids[2]]);
    expect((await db.classes.get(c2))?.teacherIds).toEqual([]);
  });
});

describe('Classes with several teachers: upgrading existing data', () => {
  it('converts a version-1 database (first/second teacher) to the teacher list on open', async () => {
    const name = 'smp-migration-test';
    const old = new Dexie(name);
    old.version(1).stores({ classes: '++id, name, level, teacherId' });
    await old.table('classes').bulkAdd([
      { name: '3 أ', level: 'السنة الثالثة', teacherId: 4, secondTeacherId: 9, room: '', capacity: 30, schedule: [], notes: '' },
      { name: '3 ب', level: 'السنة الثالثة', room: '', capacity: 30, schedule: [], notes: '' },
    ]);
    old.close();

    const upgraded = new SchoolDB(name);
    const classes = await upgraded.classes.orderBy('name').toArray();
    expect(classes.map((c) => c.teacherIds)).toEqual([[4, 9], []]);
    expect(classes[0]).not.toHaveProperty('teacherId');
    expect(await upgraded.classes.where('teacherIds').equals(9).count()).toBe(1);
    upgraded.close();
    await Dexie.delete(name);
  });

  it('restores a backup made before the change', async () => {
    const backup = await createBackup(false);
    backup.tables.classes = [{ id: 1, name: '6 أ', level: 'السنة السادسة', teacherId: 2, secondTeacherId: 3, room: '', capacity: 30, schedule: [], notes: '' }];
    await restoreBackup(backup);
    expect((await db.classes.get(1))?.teacherIds).toEqual([2, 3]);
  });
});

describe('Exam paper attachment', () => {
  it('stores the paper, replaces it without leaving the old blob, and removes it with the exam', async () => {
    const id = await saveWithAttachment('exams', exam(), new File(['v1'], 'sujet.pdf', { type: 'application/pdf' }), 'فرض');
    const first = await db.exams.get(id);
    expect(first?.fileName).toBe('sujet.pdf');
    expect((await db.files.get(first!.fileId!))?.size).toBe(2);

    await saveWithAttachment('exams', { ...first! }, new File(['v2!'], 'sujet-final.pdf', { type: 'application/pdf' }), 'فرض');
    const second = await db.exams.get(id);
    expect(second?.fileName).toBe('sujet-final.pdf');
    expect(await db.files.get(first!.fileId!)).toBeUndefined();
    expect(await db.files.count()).toBe(1);

    // Editing other fields without a new file keeps the attachment.
    await saveWithAttachment('exams', { ...second!, title: 'فرض معدّل' }, undefined, 'فرض');
    expect((await db.exams.get(id))?.fileId).toBe(second!.fileId);

    await deleteRecord('exams', id, 'فرض');
    expect(await db.files.count()).toBe(0);
  });
});

describe('Attendance edits keep history', () => {
  it('updates the same day record and appends to its history', async () => {
    const sid = await saveRecord('students', student(), 'x');
    await setStudentAttendance({ date: '2026-10-05', studentId: sid, status: 'absent', reason: '', justified: false });
    await setStudentAttendance({ date: '2026-10-05', studentId: sid, status: 'late', reason: 'حافلة', justified: true });
    const rows = await db.studentAttendance.where('studentId').equals(sid).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('late');
    expect(rows[0].history).toHaveLength(1);
    expect(rows[0].history[0].at).toBeTruthy();
    expect(rows[0].history[0].change).toContain('متأخر');
  });

  it('does not add history when nothing changed', async () => {
    const sid = await saveRecord('students', student(), 'x');
    await setStudentAttendance({ date: '2026-10-05', studentId: sid, status: 'absent', reason: '', justified: false });
    await setStudentAttendance({ date: '2026-10-05', studentId: sid, status: 'absent', reason: '', justified: false });
    const r = await db.studentAttendance.where('studentId').equals(sid).first();
    expect(r?.history).toHaveLength(0);
  });
});

describe('Persistence and backup / restore', () => {
  it('data survives closing and reopening the database', async () => {
    await saveRecord('students', student(), 'x');
    db.close();
    const reopened = new SchoolDB();
    expect(await reopened.students.count()).toBe(1);
    reopened.close();
    await db.open();
  });

  it('exports a full backup and restores it after the data is wiped', async () => {
    const sid = await saveRecord('students', student(), 'x');
    await saveRecord('tasks', { title: 'مهمة', description: '', category: 'إدارية', dueDate: '2026-11-10', priority: 'عالية', status: 'لم تبدأ', notes: '', sortOrder: 1, completedAt: '' } as Task, 'مهمة');
    const fileId = await db.files.add({ name: 'a.txt', type: 'text/plain', size: 5, blob: new Blob(['hello'], { type: 'text/plain' }), createdAt: new Date().toISOString() });
    await saveRecord<DocumentRecord>('documents', { title: 'مراسلة', category: 'المراسلات الواردة', reference: '', date: '2026-10-01', schoolYear: '2026-2027', sender: '', description: '', fileId, fileName: 'a.txt', fileType: 'text/plain', fileSize: 5, archived: false }, 'مراسلة');
    saveSettings({ ...loadSettings(), schoolName: 'مدرسة النور' });

    const backup = JSON.parse(JSON.stringify(await createBackup(true)));
    expect(validateBackup(backup).ok).toBe(true);

    await wipeAllData();
    localStorage.clear();
    expect(await db.students.count()).toBe(0);

    await restoreBackup(backup);
    expect((await db.students.get(sid))?.lastName).toBe('بن علي');
    expect(await db.tasks.count()).toBe(1);
    expect(await db.documents.count()).toBe(1);
    const f = await db.files.get(fileId);
    expect(f?.name).toBe('a.txt');
    expect(f?.size).toBe(5);
    expect(loadSettings().schoolName).toBe('مدرسة النور');
  });

  it('rejects an invalid backup and leaves current data untouched', async () => {
    await saveRecord('students', student(), 'x');
    const bad = { app: 'school-manager-pro', version: 1, tables: { students: [{ firstName: 'بدون معرف' }] } };
    const check = validateBackup(bad);
    expect(check.ok).toBe(false);
    await expect(restoreBackup(bad as never)).rejects.toThrow();
    expect(await db.students.count()).toBe(1);
  });

  it('rejects files that are not backups of this application', () => {
    expect(validateBackup({ foo: 1 }).ok).toBe(false);
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup({ app: 'school-manager-pro', version: 99, tables: {} }).ok).toBe(false);
  });

  it('sanitizes settings from a backup (unknown keys and wrong types dropped)', () => {
    const s = sanitizeSettings({ schoolName: 'س', levels: 'not-an-array', evil: '<script>' });
    expect(s.schoolName).toBe('س');
    expect(Array.isArray(s.levels)).toBe(true);
    expect((s as unknown as Record<string, unknown>).evil).toBeUndefined();
  });
});

describe('Password protection', () => {
  it('stores only a salted hash and verifies the password', async () => {
    await setPassword('director2026');
    const stored = JSON.stringify(await db.meta.get('auth'));
    expect(stored).not.toContain('director2026');
    expect(await verifyPassword('director2026')).toBe(true);
    expect(await verifyPassword('wrong-pass1')).toBe(false);
  });

  it('refuses weak passwords', async () => {
    await expect(setPassword('123')).rejects.toThrow();
    await expect(setPassword('abcdefghij')).rejects.toThrow();
  });

  it('resets a forgotten password with the one-time recovery code, keeping the data', async () => {
    await setPassword('director2026');
    await db.students.add(student());
    expect(await hasRecoveryCode()).toBe(false);
    const code = await createRecoveryCode();
    expect(code).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
    expect(JSON.stringify(await db.meta.get('auth'))).not.toContain(code.replace(/-/g, ''));

    // Changing the password normally keeps the code.
    await setPassword('changed2027');
    expect(await hasRecoveryCode()).toBe(true);

    await expect(resetPasswordWithRecoveryCode('AAAAA-AAAAA-AAAAA-AAAAA', 'newpass2028')).rejects.toThrow();
    // Lower case and missing dashes are accepted.
    const next = await resetPasswordWithRecoveryCode(code.toLowerCase().replace(/-/g, ' '), 'newpass2028');
    expect(await verifyPassword('newpass2028')).toBe(true);
    expect(await verifyPassword('changed2027')).toBe(false);
    expect(await db.students.count()).toBe(1);

    // The used code no longer works; the new one does.
    await expect(resetPasswordWithRecoveryCode(code, 'other2029x')).rejects.toThrow();
    expect(next).not.toBe(code);
    await resetPasswordWithRecoveryCode(next, 'other2029x');
    expect(await verifyPassword('other2029x')).toBe(true);
  });
});

describe('Computations', () => {
  const e1 = { ...exam(), id: 1, maxScore: 20, coefficient: 2 };
  const e2 = { ...exam(), id: 2, maxScore: 10, coefficient: 1 };
  const grades = [
    { examId: 1, studentId: 7, score: 14, absent: false, remark: '' },
    { examId: 2, studentId: 7, score: 5, absent: false, remark: '' },
    { examId: 1, studentId: 8, score: 8, absent: false, remark: '' },
    { examId: 2, studentId: 8, score: null, absent: true, remark: '' },
  ];

  it('computes a weighted average on the /20 scale, ignoring absences', () => {
    // (14*2 + 10*1) / 3 = 12.67
    expect(studentAverage(7, [e1, e2], grades)).toBe(12.67);
    expect(studentAverage(8, [e1, e2], grades)).toBe(8);
    expect(studentAverage(99, [e1, e2], grades)).toBeNull();
  });

  it('computes exam statistics', () => {
    const st = examStats(e1, grades, 10);
    expect(st).toMatchObject({ count: 2, average: 11, min: 8, max: 14, passCount: 1, passRate: 50 });
  });

  it('marks overdue unfinished tasks as late', () => {
    const t = { status: 'قيد الإنجاز', dueDate: '2026-01-01' } as Task;
    expect(effectiveTaskStatus(t, '2026-02-01')).toBe('متأخرة');
    expect(effectiveTaskStatus({ ...t, status: 'مكتملة' }, '2026-02-01')).toBe('مكتملة');
    expect(effectiveTaskStatus({ ...t, dueDate: '2026-03-01' }, '2026-02-01')).toBe('قيد الإنجاز');
  });

  it('detects repeated absences above a threshold', () => {
    const recs = [1, 2, 3].map((d) => ({ date: `2026-10-0${d}`, studentId: 5, status: 'absent' as const, reason: '', justified: d === 1, history: [] }));
    recs.push({ date: '2026-10-04', studentId: 6, status: 'absent', reason: '', justified: false, history: [] });
    const out = repeatedAbsences(recs, 3);
    expect(out).toEqual([{ studentId: 5, absent: 3, late: 0, unjustified: 2 }]);
  });
});

describe('Form validation', () => {
  it('reports required, email, phone and range errors', () => {
    const errors = validateFields(
      [
        { name: 'a', label: 'a', type: 'text', required: true },
        { name: 'b', label: 'b', type: 'email' },
        { name: 'c', label: 'c', type: 'tel' },
        { name: 'd', label: 'd', type: 'number', min: 0, max: 20 },
      ],
      { a: '  ', b: 'not-mail', c: 'abc', d: 25 },
    );
    expect(Object.keys(errors).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(validateFields([{ name: 'b', label: 'b', type: 'email' }], { b: 'x@y.tn' })).toEqual({});
  });
});
