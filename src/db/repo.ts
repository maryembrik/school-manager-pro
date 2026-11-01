import type { Table } from 'dexie';
import { db, type DataTableName } from './db';
import type { ActivityLog, BaseRecord, HistoryEntry, StudentAttendance, TeacherAttendance } from './types';

export const ENTITY_LABELS: Record<DataTableName, string> = {
  students: 'تلميذ',
  teachers: 'معلم',
  classes: 'قسم',
  studentAttendance: 'حضور تلميذ',
  teacherAttendance: 'حضور معلم',
  visits: 'زيارة صفية',
  pedagogy: 'متابعة بيداغوجية',
  exams: 'امتحان',
  grades: 'عدد',
  tasks: 'مهمة',
  events: 'حدث',
  meetings: 'اجتماع',
  documents: 'وثيقة',
  parentContacts: 'اتصال بولي',
  activity: 'سجل',
};

function table<T>(name: DataTableName): Table<T & BaseRecord, number> {
  return db.table(name) as Table<T & BaseRecord, number>;
}

export async function logActivity(action: ActivityLog['action'], entity: string, label: string) {
  try {
    await db.activity.add({ at: new Date().toISOString(), action, entity, label });
    // Keep the log bounded.
    const count = await db.activity.count();
    if (count > 500) {
      const old = await db.activity.orderBy('at').limit(count - 500).primaryKeys();
      await db.activity.bulkDelete(old);
    }
  } catch {
    // Logging must never break a user operation.
  }
}

/** Insert or update a record, stamping timestamps and recording the operation. Returns the id. */
export async function saveRecord<T extends BaseRecord>(
  name: DataTableName,
  record: T,
  label: string,
): Promise<number> {
  const now = new Date().toISOString();
  const t = table<T>(name);
  if (record.id) {
    const existing = await t.get(record.id);
    const merged = { ...existing, ...record, updatedAt: now };
    await t.put(merged as T);
    await logActivity('تعديل', ENTITY_LABELS[name], label);
    return record.id;
  }
  const { id: _omit, ...rest } = record;
  void _omit;
  const id = await t.add({ ...rest, createdAt: now, updatedAt: now } as T);
  await logActivity('إضافة', ENTITY_LABELS[name], label);
  return id as number;
}

/** Delete a record together with the records that depend on it. */
export async function deleteRecord(name: DataTableName, id: number, label: string) {
  await db.transaction(
    'rw',
    [
      db.table(name),
      db.studentAttendance,
      db.grades,
      db.parentContacts,
      db.teacherAttendance,
      db.files,
      db.documents,
      db.classes,
      db.students,
      db.activity,
    ],
    async () => {
      if (name === 'students') {
        await db.studentAttendance.where('studentId').equals(id).delete();
        await db.grades.where('studentId').equals(id).delete();
        await db.parentContacts.where('studentId').equals(id).modify({ studentId: undefined });
      }
      if (name === 'teachers') {
        await db.teacherAttendance.where('teacherId').equals(id).delete();
        await db.classes.where('teacherId').equals(id).modify({ teacherId: undefined });
      }
      if (name === 'classes') {
        await db.students.where('classId').equals(id).modify({ classId: undefined });
      }
      if (name === 'exams') {
        await db.grades.where('examId').equals(id).delete();
      }
      if (name === 'documents') {
        const doc = await db.documents.get(id);
        if (doc?.fileId) await db.files.delete(doc.fileId);
      }
      await db.table(name).delete(id);
    },
  );
  await logActivity('حذف', ENTITY_LABELS[name], label);
}

/**
 * Record a student's attendance for one day. A second call for the same day updates the
 * existing entry and appends the change to its history, keeping the modification date.
 */
export async function setStudentAttendance(
  entry: Pick<StudentAttendance, 'date' | 'studentId' | 'classId' | 'status' | 'reason' | 'justified'>,
) {
  const now = new Date().toISOString();
  const existing = await db.studentAttendance.where('[date+studentId]').equals([entry.date, entry.studentId]).first();
  if (existing) {
    const changes: string[] = [];
    if (existing.status !== entry.status) changes.push(`الحالة: ${statusLabel(existing.status)} ← ${statusLabel(entry.status)}`);
    if (existing.reason !== entry.reason) changes.push(`السبب: ${existing.reason || '—'} ← ${entry.reason || '—'}`);
    if (existing.justified !== entry.justified) changes.push(entry.justified ? 'تم التبرير' : 'إلغاء التبرير');
    if (!changes.length) return existing.id!;
    const history: HistoryEntry[] = [...(existing.history ?? []), { at: now, change: changes.join('، ') }];
    await db.studentAttendance.update(existing.id!, { ...entry, history, updatedAt: now });
    return existing.id!;
  }
  return db.studentAttendance.add({ ...entry, history: [], createdAt: now, updatedAt: now });
}

export async function saveTeacherAttendance(entry: TeacherAttendance, label: string) {
  const now = new Date().toISOString();
  if (entry.id) {
    const existing = await db.teacherAttendance.get(entry.id);
    const history = [...(existing?.history ?? []), { at: now, change: 'تعديل التسجيل' }];
    await db.teacherAttendance.put({ ...existing, ...entry, history, updatedAt: now });
    await logActivity('تعديل', ENTITY_LABELS.teacherAttendance, label);
    return entry.id;
  }
  const { id: _omit, ...rest } = entry;
  void _omit;
  const id = await db.teacherAttendance.add({ ...rest, history: [], createdAt: now, updatedAt: now });
  await logActivity('إضافة', ENTITY_LABELS.teacherAttendance, label);
  return id;
}

export function statusLabel(s: StudentAttendance['status']) {
  return s === 'present' ? 'حاضر' : s === 'absent' ? 'غائب' : 'متأخر';
}

/** Save an uploaded file blob and return its id. */
export async function storeFile(file: File): Promise<number> {
  return db.files.add({
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    blob: file,
    createdAt: new Date().toISOString(),
  });
}

/** Upsert a grade (one per exam and student). */
export async function setGrade(examId: number, studentId: number, score: number | null, absent: boolean, remark = '') {
  const now = new Date().toISOString();
  const existing = await db.grades.where('[examId+studentId]').equals([examId, studentId]).first();
  if (existing) {
    await db.grades.update(existing.id!, { score, absent, remark, updatedAt: now });
    return existing.id!;
  }
  return db.grades.add({ examId, studentId, score, absent, remark, createdAt: now, updatedAt: now });
}
