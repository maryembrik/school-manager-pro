// Simple user preferences, persisted in localStorage (structured data lives in IndexedDB).

export interface EvaluationAxis {
  name: string;
  maxScore: number;
}

export type DashboardWidget =
  | 'stats'
  | 'attendanceChart'
  | 'levelChart'
  | 'taskProgress'
  | 'urgentTasks'
  | 'upcoming'
  | 'activity';

export const ALL_WIDGETS: { id: DashboardWidget; label: string }[] = [
  { id: 'stats', label: 'البطاقات الإحصائية' },
  { id: 'attendanceChart', label: 'مخطط الحضور اليومي' },
  { id: 'levelChart', label: 'توزيع التلاميذ حسب المستوى' },
  { id: 'taskProgress', label: 'مؤشرات إنجاز المهام' },
  { id: 'urgentTasks', label: 'المهام العاجلة' },
  { id: 'upcoming', label: 'المواعيد القادمة' },
  { id: 'activity', label: 'آخر العمليات المسجلة' },
];

export type StatCardId =
  | 'students'
  | 'teachers'
  | 'classes'
  | 'absentStudents'
  | 'absentTeachers'
  | 'openTasks'
  | 'upcomingMeetings'
  | 'followUps';

export const ALL_STAT_CARDS: { id: StatCardId; label: string }[] = [
  { id: 'students', label: 'العدد الجملي للتلاميذ' },
  { id: 'teachers', label: 'العدد الجملي للمعلمين' },
  { id: 'classes', label: 'عدد الأقسام' },
  { id: 'absentStudents', label: 'التلاميذ الغائبون اليوم' },
  { id: 'absentTeachers', label: 'المعلمون الغائبون اليوم' },
  { id: 'openTasks', label: 'المهام غير المكتملة' },
  { id: 'upcomingMeetings', label: 'الاجتماعات القادمة' },
  { id: 'followUps', label: 'ملفات تستوجب المتابعة' },
];

export interface AppSettings {
  schoolName: string;
  schoolYear: string;
  directorName: string;
  address: string;
  phone: string;
  theme: 'light' | 'dark';
  primaryColor: string; // hex
  levels: string[];
  subjects: string[];
  documentCategories: string[];
  taskCategories: string[];
  eventTypes: string[];
  meetingTypes: string[];
  evaluationAxes: EvaluationAxis[];
  dashboardWidgets: DashboardWidget[]; // ordered & visible
  statCards: StatCardId[];
  absenceAlertThreshold: number;
  passMark: number;
  maxGrade: number;
  sidebarCollapsed: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  schoolName: 'المدرسة الابتدائية',
  schoolYear: defaultSchoolYear(),
  directorName: '',
  address: '',
  phone: '',
  theme: 'light',
  primaryColor: '#1e3a8a',
  levels: ['السنة الأولى', 'السنة الثانية', 'السنة الثالثة', 'السنة الرابعة', 'السنة الخامسة', 'السنة السادسة'],
  subjects: [
    'اللغة العربية',
    'الرياضيات',
    'الإيقاظ العلمي',
    'اللغة الفرنسية',
    'اللغة الإنجليزية',
    'التربية الإسلامية',
    'التربية المدنية',
    'التاريخ والجغرافيا',
    'التربية التكنولوجية',
    'التربية التشكيلية',
    'التربية الموسيقية',
    'التربية البدنية',
  ],
  documentCategories: [
    'المراسلات الواردة',
    'المراسلات الصادرة',
    'محاضر الجلسات',
    'التقارير',
    'القرارات',
    'مطالب الأولياء',
    'الوثائق التنظيمية',
    'الوثائق التربوية',
  ],
  taskCategories: ['إدارية', 'بيداغوجية', 'مالية', 'صيانة وتجهيز', 'تواصل', 'أخرى'],
  eventTypes: ['موعد إداري', 'اجتماع', 'امتحان', 'نشاط مدرسي', 'عطلة', 'مناسبة', 'موعد نهائي', 'تذكير'],
  meetingTypes: ['مجلس المعلمين', 'مجلس القسم', 'اجتماع الأولياء', 'مجلس المؤسسة', 'اجتماع تنسيقي', 'أخرى'],
  evaluationAxes: [
    { name: 'التخطيط والإعداد', maxScore: 5 },
    { name: 'تسيير الحصة', maxScore: 5 },
    { name: 'التمكن من المادة', maxScore: 5 },
    { name: 'التواصل مع التلاميذ', maxScore: 5 },
    { name: 'التقييم والمتابعة', maxScore: 5 },
    { name: 'استعمال الوسائل', maxScore: 5 },
  ],
  dashboardWidgets: ['stats', 'attendanceChart', 'levelChart', 'taskProgress', 'urgentTasks', 'upcoming', 'activity'],
  statCards: ['students', 'teachers', 'classes', 'absentStudents', 'absentTeachers', 'openTasks', 'upcomingMeetings', 'followUps'],
  absenceAlertThreshold: 3,
  passMark: 10,
  maxGrade: 20,
  sidebarCollapsed: false,
};

const KEY = 'smp.settings';

export function defaultSchoolYear(d = new Date()) {
  const y = d.getFullYear();
  return d.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: AppSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** Validate settings coming from a backup file: keep only known keys with matching types. */
export function sanitizeSettings(input: unknown): AppSettings {
  const out = { ...DEFAULT_SETTINGS };
  if (!input || typeof input !== 'object') return out;
  const src = input as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    const def = DEFAULT_SETTINGS[key];
    const val = src[key];
    if (val === undefined) continue;
    if (Array.isArray(def) ? Array.isArray(val) : typeof val === typeof def) {
      (out as Record<string, unknown>)[key] = val;
    }
  }
  return out;
}

// ---- Theme color helpers ----

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x1e3a8a;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(c: [number, number, number], target: number, amount: number) {
  return c.map((v) => Math.round(v + (target - v) * amount)) as [number, number, number];
}

/** Write the primary palette CSS variables derived from a single base color. */
export function applyTheme(s: Pick<AppSettings, 'primaryColor' | 'theme'>) {
  const base = hexToRgb(s.primaryColor);
  const shades: Record<string, [number, number, number]> = {
    '50': mix(base, 255, 0.92),
    '100': mix(base, 255, 0.82),
    '500': mix(base, 255, 0.3),
    '600': mix(base, 255, 0.15),
    '700': base,
    '800': mix(base, 0, 0.15),
    '900': mix(base, 0, 0.3),
  };
  const root = document.documentElement;
  for (const [k, v] of Object.entries(shades)) root.style.setProperty(`--p-${k}`, v.join(' '));
  root.classList.toggle('dark', s.theme === 'dark');
}
