import Dexie, { type Table } from 'dexie';
import type {
  ActivityLog,
  CalendarEvent,
  ClassVisit,
  DocumentRecord,
  Exam,
  Grade,
  Meeting,
  MetaEntry,
  ParentContact,
  PedagogyRecord,
  SchoolClass,
  StoredFile,
  Student,
  StudentAttendance,
  Task,
  Teacher,
  TeacherAttendance,
} from './types';
import { MAX_CLASS_TEACHERS } from './types';

export class SchoolDB extends Dexie {
  students!: Table<Student, number>;
  teachers!: Table<Teacher, number>;
  classes!: Table<SchoolClass, number>;
  studentAttendance!: Table<StudentAttendance, number>;
  teacherAttendance!: Table<TeacherAttendance, number>;
  visits!: Table<ClassVisit, number>;
  pedagogy!: Table<PedagogyRecord, number>;
  exams!: Table<Exam, number>;
  grades!: Table<Grade, number>;
  tasks!: Table<Task, number>;
  events!: Table<CalendarEvent, number>;
  meetings!: Table<Meeting, number>;
  documents!: Table<DocumentRecord, number>;
  files!: Table<StoredFile, number>;
  parentContacts!: Table<ParentContact, number>;
  activity!: Table<ActivityLog, number>;
  meta!: Table<MetaEntry, string>;

  constructor(name = 'school-manager-pro') {
    super(name);
    this.version(1).stores({
      students: '++id, lastName, firstName, level, classId, needsFollowUp',
      teachers: '++id, lastName, specialty, needsFollowUp',
      classes: '++id, name, level, teacherId',
      studentAttendance: '++id, date, studentId, classId, status, [date+studentId]',
      teacherAttendance: '++id, date, teacherId, type',
      visits: '++id, teacherId, classId, date',
      pedagogy: '++id, kind, teacherId, classId, studentId, date, status',
      exams: '++id, level, classId, subject, date',
      grades: '++id, examId, studentId, [examId+studentId]',
      tasks: '++id, status, priority, dueDate, category, sortOrder',
      events: '++id, date, type',
      meetings: '++id, date, type',
      documents: '++id, category, date, schoolYear, classId, teacherId, archived',
      files: '++id',
      parentContacts: '++id, studentId, date, closed',
      activity: '++id, at',
      meta: 'key',
    });
    // v2: a class has a list of up to 5 teachers instead of a first and a second teacher.
    this.version(2)
      .stores({ classes: '++id, name, level, *teacherIds' })
      .upgrade((tx) =>
        tx
          .table('classes')
          .toCollection()
          .modify((c: Record<string, unknown>) => {
            Object.assign(c, normalizeClass(c));
            delete c.teacherId;
            delete c.secondTeacherId;
          }),
      );
  }
}

/**
 * Bring a class record from any version (database v1 or an older backup, with `teacherId` /
 * `secondTeacherId`) to the current shape with `teacherIds`.
 */
export function normalizeClass<T extends Record<string, unknown>>(c: T): T & { teacherIds: number[] } {
  const legacy = [c.teacherId, c.secondTeacherId].filter((x): x is number => typeof x === 'number');
  const ids = Array.isArray(c.teacherIds) ? (c.teacherIds as unknown[]).filter((x): x is number => typeof x === 'number') : legacy;
  const { teacherId: _a, secondTeacherId: _b, ...rest } = c;
  void _a;
  void _b;
  return { ...(rest as T), teacherIds: [...new Set(ids)].slice(0, MAX_CLASS_TEACHERS) };
}

export const db = new SchoolDB();

/** Tables included in a JSON backup, in restore order. `files` is handled separately. */
export const DATA_TABLES = [
  'students',
  'teachers',
  'classes',
  'studentAttendance',
  'teacherAttendance',
  'visits',
  'pedagogy',
  'exams',
  'grades',
  'tasks',
  'events',
  'meetings',
  'documents',
  'parentContacts',
  'activity',
] as const;

export type DataTableName = (typeof DATA_TABLES)[number];
