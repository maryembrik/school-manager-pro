// Data model shared by the whole application.
// All dates are stored as ISO strings: 'YYYY-MM-DD' for days, full ISO for timestamps.

export interface BaseRecord {
  id?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Student extends BaseRecord {
  firstName: string;
  lastName: string;
  gender: 'ذكر' | 'أنثى' | '';
  birthDate: string;
  level: string;
  classId?: number;
  registrationNumber: string;
  guardianName: string;
  guardianRelation: string;
  guardianPhone: string;
  guardianPhone2: string;
  guardianEmail: string;
  address: string;
  healthNotes: string;
  notes: string;
  needsFollowUp: boolean;
}

export interface Teacher extends BaseRecord {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  specialty: string;
  levels: string;
  hireDate: string;
  notes: string;
  needsFollowUp: boolean;
}

export interface ScheduleSlot {
  day: string;
  period: number;
  subject: string;
  teacherId?: number;
}

export const MAX_CLASS_TEACHERS = 5;

export interface SchoolClass extends BaseRecord {
  name: string;
  level: string;
  /** Up to MAX_CLASS_TEACHERS teachers, in order; the first is the main teacher. */
  teacherIds: number[];
  room: string;
  capacity: number;
  schedule: ScheduleSlot[];
  notes: string;
}

export type StudentAttendanceStatus = 'present' | 'absent' | 'late';

export interface HistoryEntry {
  at: string;
  change: string;
}

export interface StudentAttendance extends BaseRecord {
  date: string;
  studentId: number;
  classId?: number;
  status: StudentAttendanceStatus;
  reason: string;
  justified: boolean;
  history: HistoryEntry[];
}

export type TeacherAttendanceType = 'absent' | 'late' | 'leave';

export interface TeacherAttendance extends BaseRecord {
  date: string;
  endDate: string;
  teacherId: number;
  type: TeacherAttendanceType;
  reason: string;
  durationMinutes: number;
  justified: boolean;
  history: HistoryEntry[];
}

export interface VisitAxisScore {
  axis: string;
  score: number; // 0..maxScore of the axis set in settings
  comment: string;
}

export interface ClassVisit extends BaseRecord {
  teacherId?: number;
  classId?: number;
  subject: string;
  date: string;
  visitType: string;
  axes: VisitAxisScore[];
  strengths: string;
  improvements: string;
  recommendations: string;
  overallRating: string;
  signedBy: string;
  signed: boolean;
}

export type PedagogyKind =
  | 'lessonPlans'
  | 'programProgress'
  | 'learning'
  | 'assessments'
  | 'results'
  | 'difficulties'
  | 'remediation'
  | 'projects';

export interface PedagogyRecord extends BaseRecord {
  kind: PedagogyKind;
  title: string;
  teacherId?: number;
  classId?: number;
  studentId?: number;
  subject: string;
  date: string;
  endDate: string;
  status: string;
  progress: number;
  details: string;
  actions: string;
}

export interface Exam extends BaseRecord {
  title: string;
  level: string;
  classId?: number;
  subject: string;
  term: string;
  date: string;
  maxScore: number;
  coefficient: number;
  teacherId?: number;
  subjectDueDate: string;
  subjectReceived: boolean;
  subjectReceivedDate: string;
  correctionStatus: 'لم يبدأ' | 'قيد الإصلاح' | 'مكتمل';
  notes: string;
  /** The exam paper itself, stored in `files`. Optional: older exams have none. */
  fileId?: number;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}

export interface Grade extends BaseRecord {
  examId: number;
  studentId: number;
  score: number | null;
  absent: boolean;
  remark: string;
}

export type TaskStatus = 'لم تبدأ' | 'قيد الإنجاز' | 'مكتملة' | 'متأخرة';
export type Priority = 'عاجلة' | 'عالية' | 'متوسطة' | 'منخفضة';

export interface Task extends BaseRecord {
  title: string;
  description: string;
  category: string;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
  assigneeTeacherId?: number;
  notes: string;
  sortOrder: number;
  completedAt: string;
}

export interface CalendarEvent extends BaseRecord {
  title: string;
  type: string;
  date: string;
  endDate: string;
  time: string;
  location: string;
  description: string;
  reminderDays: number;
}

export interface MeetingAction {
  action: string;
  owner: string;
  deadline: string;
  done: boolean;
}

export interface Meeting extends BaseRecord {
  title: string;
  type: string;
  date: string;
  time: string;
  location: string;
  chair: string;
  attendees: string;
  absentees: string;
  agenda: string;
  discussion: string;
  decisions: string;
  recommendations: string;
  actions: MeetingAction[];
}

export interface DocumentRecord extends BaseRecord {
  title: string;
  category: string;
  reference: string;
  date: string;
  schoolYear: string;
  classId?: number;
  teacherId?: number;
  sender: string;
  description: string;
  fileId?: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  archived: boolean;
}

export interface StoredFile {
  id?: number;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  createdAt: string;
}

export interface ParentContact extends BaseRecord {
  studentId?: number;
  guardianName: string;
  phone: string;
  date: string;
  channel: string;
  initiatedBy: string;
  subject: string;
  notes: string;
  actions: string;
  outcome: string;
  followUpDate: string;
  closed: boolean;
}

export interface ActivityLog {
  id?: number;
  at: string;
  action: 'إضافة' | 'تعديل' | 'حذف' | 'استيراد' | 'نظام';
  entity: string;
  label: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}
