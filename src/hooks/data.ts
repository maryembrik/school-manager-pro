import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import { byId, fullName } from '../lib/utils';
import type { Option } from '../components/EntityForm';

export const useStudents = () => useLiveQuery(() => db.students.toArray(), []);
export const useTeachers = () => useLiveQuery(() => db.teachers.toArray(), []);
export const useClasses = () => useLiveQuery(() => db.classes.toArray(), []);

/** Common lookups (id → record) and select options for students, teachers and classes. */
export function useRefs() {
  const students = useStudents();
  const teachers = useTeachers();
  const classes = useClasses();
  return useMemo(() => {
    const studentMap = byId(students);
    const teacherMap = byId(teachers);
    const classMap = byId(classes);
    const teacherOptions: Option[] = (teachers ?? []).map((t) => ({ value: t.id!, label: fullName(t) }));
    const classOptions: Option[] = (classes ?? []).map((c) => ({ value: c.id!, label: `${c.name} (${c.level})` }));
    const studentOptions: Option[] = (students ?? [])
      .map((s) => ({ value: s.id!, label: `${fullName(s)}${s.classId && classMap.get(s.classId) ? ' — ' + classMap.get(s.classId)!.name : ''}` }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ar'));
    return {
      students,
      teachers,
      classes,
      studentMap,
      teacherMap,
      classMap,
      teacherOptions,
      classOptions,
      studentOptions,
      teacherName: (id?: number) => (id ? fullName(teacherMap.get(id)) : '—'),
      className: (id?: number) => (id ? classMap.get(id)?.name ?? '—' : '—'),
      studentName: (id?: number) => (id ? fullName(studentMap.get(id)) : '—'),
      loaded: students !== undefined && teachers !== undefined && classes !== undefined,
    };
  }, [students, teachers, classes]);
}
