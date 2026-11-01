import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, Database, Download, Image, KeyRound, Plus, Settings as SettingsIcon, ShieldAlert, Trash2, Upload } from 'lucide-react';
import { Button, Card, IconButton, Label, PageHeader, Tabs, inputClass, useConfirm } from '../components/ui';
import { useApp } from '../context/AppContext';
import { db } from '../db/db';
import { logActivity } from '../db/repo';
import { ALL_STAT_CARDS, ALL_WIDGETS, type AppSettings, type EvaluationAxis } from '../lib/settings';
import { createBackup, downloadJson, restoreBackup, validateBackup, wipeAllData, type BackupPayload, type ValidationResult } from '../lib/backup';
import { setPassword, verifyPassword } from '../lib/auth';
import { formatDateTime, formatSize } from '../lib/utils';

type TabId = 'school' | 'lists' | 'evaluation' | 'dashboard' | 'security' | 'backup';
const LAST_BACKUP_KEY = 'smp.lastBackup';

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>('school');
  return (
    <div>
      <PageHeader title="إعدادات النظام" subtitle="تخصيص المؤسسة والواجهة والقوائم والنسخ الاحتياطي" icon={<SettingsIcon />} />
      <Tabs<TabId>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'school', label: 'المؤسسة والمظهر' },
          { id: 'lists', label: 'المستويات والقوائم' },
          { id: 'evaluation', label: 'محاور التقييم والعتبات' },
          { id: 'dashboard', label: 'لوحة القيادة' },
          { id: 'security', label: 'كلمة المرور' },
          { id: 'backup', label: 'النسخ الاحتياطي والبيانات' },
        ]}
      />
      {tab === 'school' && <SchoolSettings />}
      {tab === 'lists' && <ListsSettings />}
      {tab === 'evaluation' && <EvaluationSettings />}
      {tab === 'dashboard' && <DashboardSettings />}
      {tab === 'security' && <SecuritySettings />}
      {tab === 'backup' && <BackupSettings />}
    </div>
  );
}

/** Text input that saves on blur, so typing does not write on every keystroke. */
function BlurInput({ value, onSave, type = 'text', placeholder }: { value: string; onSave: (v: string) => void; type?: string; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input type={type} className={inputClass} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      {children}
    </label>
  );
}

async function resizeImage(file: File, max = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new window.Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('تعذرت قراءة الصورة.'));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

const COLOR_PRESETS = ['#1e3a8a', '#0f4c81', '#065f46', '#7c2d12', '#581c87', '#334155', '#0e7490'];

function SchoolSettings() {
  const { settings, updateSettings, logo, run } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const save = (patch: Partial<AppSettings>) => {
    updateSettings(patch);
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="بيانات المؤسسة">
        <div className="space-y-3">
          <Row label="اسم المدرسة">
            <BlurInput value={settings.schoolName} onSave={(v) => v.trim() && save({ schoolName: v.trim() })} />
          </Row>
          <Row label="السنة الدراسية">
            <BlurInput value={settings.schoolYear} placeholder="2025-2026" onSave={(v) => /^\d{4}-\d{4}$/.test(v.trim()) ? save({ schoolYear: v.trim() }) : run(async () => { throw new Error('الصيغة المطلوبة: 2025-2026'); })} />
          </Row>
          <Row label="اسم المدير">
            <BlurInput value={settings.directorName} onSave={(v) => save({ directorName: v })} />
          </Row>
          <Row label="العنوان">
            <BlurInput value={settings.address} onSave={(v) => save({ address: v })} />
          </Row>
          <Row label="الهاتف">
            <BlurInput value={settings.phone} onSave={(v) => save({ phone: v })} />
          </Row>
          <p className="text-xs text-slate-400">تُحفظ التغييرات تلقائيًا عند مغادرة الخانة.</p>
        </div>
      </Card>
      <Card title="الشعار والمظهر">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-900">
              {logo ? <img src={logo} alt="الشعار" className="h-full w-full object-contain p-1" /> : <Image className="h-8 w-8 text-slate-300" />}
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  run(async () => {
                    if (f.size > 5 * 1024 * 1024) throw new Error('حجم الصورة كبير جدًا (5 م.ب كحد أقصى).');
                    const dataUrl = await resizeImage(f);
                    await db.meta.put({ key: 'logo', value: dataUrl });
                  }, 'تم تحديث الشعار.');
                }}
              />
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> تغيير الشعار
              </Button>
              {logo && (
                <Button variant="ghost" onClick={() => run(() => db.meta.delete('logo'), 'تم حذف الشعار.')}>
                  حذف
                </Button>
              )}
            </div>
          </div>
          <div>
            <Label>الوضع</Label>
            <div className="flex gap-2">
              <Button variant={settings.theme === 'light' ? 'primary' : 'secondary'} onClick={() => save({ theme: 'light' })}>
                نهاري
              </Button>
              <Button variant={settings.theme === 'dark' ? 'primary' : 'secondary'} onClick={() => save({ theme: 'dark' })}>
                ليلي
              </Button>
            </div>
          </div>
          <div>
            <Label>اللون الأساسي للواجهة</Label>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => save({ primaryColor: c })}
                  className={`h-8 w-8 rounded-full border-2 ${settings.primaryColor === c ? 'border-slate-900 dark:border-white' : 'border-transparent'}`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
              <input type="color" value={settings.primaryColor} onChange={(e) => save({ primaryColor: e.target.value })} className="h-8 w-12 cursor-pointer rounded" title="لون مخصص" />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/** Editable ordered list of names. `onRename` lets callers propagate renames to stored records. */
function ListEditor({ title, items, onChange, onRename }: { title: string; items: string[]; onChange: (v: string[]) => void; onRename?: (from: string, to: string) => Promise<void> }) {
  const { run, toast } = useApp();
  const [newItem, setNewItem] = useState('');
  const add = () => {
    const v = newItem.trim();
    if (!v) return;
    if (items.includes(v)) return toast('العنصر موجود مسبقًا.', 'warning');
    onChange([...items, v]);
    setNewItem('');
  };
  const rename = (i: number, v: string) => {
    const to = v.trim();
    const from = items[i];
    if (!to || to === from) return;
    if (items.includes(to)) return toast('العنصر موجود مسبقًا.', 'warning');
    run(async () => {
      await onRename?.(from, to);
      onChange(items.map((x, j) => (j === i ? to : x)));
    }, 'تم التعديل.');
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <Card title={title}>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={it} className="flex items-center gap-1">
            <BlurInput value={it} onSave={(v) => rename(i, v)} />
            <IconButton title="أعلى" onClick={() => move(i, -1)}>
              <ArrowUp className="h-4 w-4" />
            </IconButton>
            <IconButton title="أسفل" onClick={() => move(i, 1)}>
              <ArrowDown className="h-4 w-4" />
            </IconButton>
            <IconButton title="حذف" tone="danger" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <input className={inputClass} value={newItem} placeholder="عنصر جديد" onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {onRename && <p className="mt-2 text-xs text-slate-400">إعادة التسمية تُحدّث السجلات المرتبطة تلقائيًا. الحذف لا يغيّر السجلات القديمة.</p>}
    </Card>
  );
}

function ClassNames() {
  const { run } = useApp();
  const classes = useLiveQuery(() => db.classes.toArray(), []);
  return (
    <Card title="أسماء الأقسام">
      {!classes?.length ? (
        <p className="text-sm text-slate-400">لا توجد أقسام. أنشئها من صفحة إدارة الأقسام.</p>
      ) : (
        <ul className="space-y-1.5">
          {classes.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <BlurInput
                value={c.name}
                onSave={(v) =>
                  v.trim() &&
                  run(async () => {
                    if (classes.some((x) => x.id !== c.id && x.name === v.trim())) throw new Error('يوجد قسم بنفس الاسم.');
                    await db.classes.update(c.id!, { name: v.trim(), updatedAt: new Date().toISOString() });
                    await logActivity('تعديل', 'قسم', `${c.name} ← ${v.trim()}`);
                  }, 'تمت إعادة تسمية القسم.')
                }
              />
              <span className="whitespace-nowrap text-xs text-slate-500">{c.level}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ListsSettings() {
  const { settings, updateSettings } = useApp();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <ListEditor
        title="المستويات الدراسية"
        items={settings.levels}
        onChange={(levels) => updateSettings({ levels })}
        onRename={async (from, to) => {
          await db.transaction('rw', [db.students, db.classes, db.exams], async () => {
            await db.students.where('level').equals(from).modify({ level: to });
            await db.classes.where('level').equals(from).modify({ level: to });
            await db.exams.where('level').equals(from).modify({ level: to });
          });
        }}
      />
      <ClassNames />
      <ListEditor
        title="المواد"
        items={settings.subjects}
        onChange={(subjects) => updateSettings({ subjects })}
        onRename={async (from, to) => {
          await db.transaction('rw', [db.exams, db.visits, db.pedagogy, db.classes], async () => {
            await db.exams.where('subject').equals(from).modify({ subject: to });
            await db.visits.filter((v) => v.subject === from).modify({ subject: to });
            await db.pedagogy.filter((p) => p.subject === from).modify({ subject: to });
            await db.classes.toCollection().modify((c) => {
              c.schedule = (c.schedule ?? []).map((s) => (s.subject === from ? { ...s, subject: to } : s));
            });
          });
        }}
      />
      <ListEditor
        title="أنواع الوثائق"
        items={settings.documentCategories}
        onChange={(documentCategories) => updateSettings({ documentCategories })}
        onRename={async (from, to) => {
          await db.documents.where('category').equals(from).modify({ category: to });
        }}
      />
      <ListEditor
        title="تصنيفات المهام"
        items={settings.taskCategories}
        onChange={(taskCategories) => updateSettings({ taskCategories })}
        onRename={async (from, to) => {
          await db.tasks.where('category').equals(from).modify({ category: to });
        }}
      />
      <ListEditor
        title="أنواع أحداث الروزنامة"
        items={settings.eventTypes}
        onChange={(eventTypes) => updateSettings({ eventTypes })}
        onRename={async (from, to) => {
          await db.events.where('type').equals(from).modify({ type: to });
        }}
      />
      <ListEditor
        title="أنواع الاجتماعات"
        items={settings.meetingTypes}
        onChange={(meetingTypes) => updateSettings({ meetingTypes })}
        onRename={async (from, to) => {
          await db.meetings.where('type').equals(from).modify({ type: to });
        }}
      />
    </div>
  );
}

function EvaluationSettings() {
  const { settings, updateSettings, toast } = useApp();
  const [axes, setAxes] = useState<EvaluationAxis[]>(settings.evaluationAxes);
  const save = () => {
    const clean = axes.map((a) => ({ name: a.name.trim(), maxScore: Math.max(1, Math.min(20, Math.round(a.maxScore) || 1)) })).filter((a) => a.name);
    if (new Set(clean.map((a) => a.name)).size !== clean.length) return toast('أسماء المحاور يجب أن تكون مختلفة.', 'error');
    setAxes(clean);
    updateSettings({ evaluationAxes: clean });
    toast('تم حفظ محاور التقييم.');
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="محاور ومعايير الزيارة الصفية" actions={<Button onClick={save}>حفظ المحاور</Button>}>
        <p className="mb-3 text-xs text-slate-500">حدّد محاور الملاحظة وسلّم التنقيط حسب المرجع المعتمد لديك. لا يدّعي النظام مطابقة أي مرجع رسمي غير مُدخل هنا.</p>
        <ul className="space-y-2">
          {axes.map((a, i) => (
            <li key={i} className="flex items-center gap-2">
              <input className={inputClass} value={a.name} onChange={(e) => setAxes(axes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <span className="text-xs text-slate-500">من</span>
              <input type="number" min={1} max={20} className={`${inputClass} w-20`} value={a.maxScore} onChange={(e) => setAxes(axes.map((x, j) => (j === i ? { ...x, maxScore: Number(e.target.value) } : x)))} />
              <IconButton title="حذف" tone="danger" onClick={() => setAxes(axes.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
        <Button className="mt-3" variant="secondary" onClick={() => setAxes([...axes, { name: '', maxScore: 5 }])}>
          <Plus className="h-4 w-4" /> إضافة محور
        </Button>
      </Card>
      <Card title="العتبات والسلّم">
        <div className="space-y-3">
          <Row label="العدد الأقصى للسلّم (المعدلات تُحسب عليه)">
            <BlurInput type="number" value={String(settings.maxGrade)} onSave={(v) => Number(v) > 0 && updateSettings({ maxGrade: Number(v) })} />
          </Row>
          <Row label="معدل النجاح / عتبة الدعم">
            <BlurInput type="number" value={String(settings.passMark)} onSave={(v) => Number(v) >= 0 && updateSettings({ passMark: Number(v) })} />
          </Row>
          <Row label="عتبة تنبيه الغيابات المتكررة (خلال 30 يومًا)">
            <BlurInput type="number" value={String(settings.absenceAlertThreshold)} onSave={(v) => Number(v) >= 1 && updateSettings({ absenceAlertThreshold: Math.round(Number(v)) })} />
          </Row>
        </div>
      </Card>
    </div>
  );
}

function OrderedToggleList<T extends string>({ all, active, onChange }: { all: { id: T; label: string }[]; active: T[]; onChange: (v: T[]) => void }) {
  const ordered = [...active.map((id) => all.find((a) => a.id === id)!).filter(Boolean), ...all.filter((a) => !active.includes(a.id))];
  const move = (id: T, d: number) => {
    const i = active.indexOf(id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= active.length) return;
    const next = [...active];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <ul className="space-y-1.5">
      {ordered.map((w) => {
        const on = active.includes(w.id);
        return (
          <li key={w.id} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 dark:border-slate-700 ${on ? '' : 'opacity-50'}`}>
            <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? [...active, w.id] : active.filter((x) => x !== w.id))} />
            <span className="flex-1 text-sm">{w.label}</span>
            {on && (
              <>
                <IconButton title="أعلى" onClick={() => move(w.id, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </IconButton>
                <IconButton title="أسفل" onClick={() => move(w.id, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </IconButton>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DashboardSettings() {
  const { settings, updateSettings } = useApp();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="عناصر الصفحة الرئيسية وترتيبها">
        <OrderedToggleList all={ALL_WIDGETS} active={settings.dashboardWidgets} onChange={(dashboardWidgets) => updateSettings({ dashboardWidgets })} />
      </Card>
      <Card title="المؤشرات الظاهرة في البطاقات الإحصائية">
        <OrderedToggleList all={ALL_STAT_CARDS} active={settings.statCards} onChange={(statCards) => updateSettings({ statCards })} />
      </Card>
    </div>
  );
}

function SecuritySettings() {
  const { run } = useApp();
  const [old, setOld] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const submit = () =>
    run(async () => {
      if (!(await verifyPassword(old))) throw new Error('كلمة المرور الحالية غير صحيحة.');
      if (pw !== pw2) throw new Error('كلمتا المرور الجديدتان غير متطابقتين.');
      await setPassword(pw);
      await logActivity('نظام', 'الأمان', 'تغيير كلمة المرور');
      setOld('');
      setPw('');
      setPw2('');
    }, 'تم تغيير كلمة المرور.');
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="تغيير كلمة المرور">
        <div className="space-y-3">
          <Row label="كلمة المرور الحالية">
            <input type="password" className={inputClass} value={old} onChange={(e) => setOld(e.target.value)} autoComplete="current-password" />
          </Row>
          <Row label="كلمة المرور الجديدة (8 أحرف على الأقل، أرقام وحروف)">
            <input type="password" className={inputClass} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </Row>
          <Row label="تأكيد كلمة المرور الجديدة">
            <input type="password" className={inputClass} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </Row>
          <Button onClick={submit} disabled={!old || !pw}>
            <KeyRound className="h-4 w-4" /> تغيير
          </Button>
        </div>
      </Card>
      <Card title="حدود الحماية">
        <div className="flex gap-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <ShieldAlert className="h-5 w-5 shrink-0 text-orange-500" />
          <ul className="list-disc space-y-1 pr-4">
            <li>كلمة المرور مخزّنة بصيغة مُجزّأة PBKDF2-SHA256 مع ملح عشوائي (210000 تكرار)، ولا تُحفظ كنص واضح.</li>
            <li>شاشة الدخول تحمي الواجهة فقط. البيانات في IndexedDB غير مشفّرة، ويمكن لمن يملك صلاحية الوصول إلى هذا الحساب في الجهاز وأدوات المطوّر قراءتها.</li>
            <li>ملفات النسخ الاحتياطية JSON غير مشفّرة: احفظها في مكان آمن.</li>
            <li>في حال نسيان كلمة المرور لا يمكن استرجاعها. يمكن مسح بيانات الموقع من المتصفح ثم استعادة نسخة احتياطية.</li>
            <li>البيانات لا تُزامَن تلقائيًا بين الأجهزة؛ استعمل التصدير والاستيراد لنقلها.</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}

function BackupSettings() {
  const { run, reloadSettings, toast } = useApp();
  const confirm = useConfirm();
  const [includeFiles, setIncludeFiles] = useState(true);
  const [pending, setPending] = useState<{ data: BackupPayload; check: ValidationResult; name: string } | null>(null);
  const [lastBackup, setLastBackup] = useState(() => localStorage.getItem(LAST_BACKUP_KEY));
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const counts = useLiveQuery(async () => ({ students: await db.students.count(), teachers: await db.teachers.count(), documents: await db.documents.count(), files: await db.files.count() }), []);

  useEffect(() => {
    (async () => {
      const est = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      setStorage({ usage: est?.usage, quota: est?.quota, persisted });
    })().catch(() => undefined);
  }, [counts]);

  const doExport = () =>
    run(async () => {
      const payload = await createBackup(includeFiles);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      downloadJson(payload, `school-manager-backup-${stamp}${includeFiles ? '-files' : ''}.json`);
      const now = new Date().toISOString();
      localStorage.setItem(LAST_BACKUP_KEY, now);
      setLastBackup(now);
      await logActivity('نظام', 'نسخة احتياطية', `تصدير${includeFiles ? ' مع الملفات' : ''}`);
    }, 'تم تصدير النسخة الاحتياطية.');

  const onPick = async (f: File) => {
    try {
      const text = await f.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('الملف ليس بصيغة JSON صالحة.');
      }
      const check = validateBackup(data);
      setPending({ data: data as BackupPayload, check, name: f.name });
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const doRestore = async () => {
    if (!pending?.check.ok) return;
    const ok = await confirm({
      title: 'استبدال جميع البيانات',
      message: 'ستُحذف جميع البيانات الحالية وتُستبدل بمحتوى النسخة الاحتياطية.\nيُنصح بتصدير نسخة من البيانات الحالية أولًا.\nهل تريد المتابعة؟',
      confirmLabel: 'استعادة النسخة',
    });
    if (!ok) return;
    const done = await run(() => restoreBackup(pending.data), 'تمت استعادة النسخة الاحتياطية بنجاح.');
    if (done) {
      reloadSettings();
      setPending(null);
    }
  };

  const wipe = async () => {
    if (!(await confirm({ title: 'حذف جميع البيانات', message: 'سيتم حذف كل التلاميذ والمعلمين والأقسام والوثائق وغيرها نهائيًا من هذا المتصفح.\nكلمة المرور والإعدادات تُحفظ.' }))) return;
    if (!(await confirm({ title: 'تأكيد نهائي', message: 'هل أنت متأكد؟ لا يمكن التراجع إلا باستعادة نسخة احتياطية.' }))) return;
    await run(async () => {
      await wipeAllData();
      await logActivity('نظام', 'البيانات', 'حذف جميع البيانات');
    }, 'تم حذف جميع البيانات.');
  };

  const daysSince = lastBackup ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86_400_000) : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="تصدير نسخة احتياطية كاملة">
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
          آخر نسخة: <strong>{lastBackup ? formatDateTime(lastBackup) : 'لم يتم التصدير بعد'}</strong>
          {daysSince !== null && daysSince > 7 && <span className="mr-2 text-orange-600">(منذ {daysSince} يومًا)</span>}
        </p>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} />
          تضمين الملفات المرفقة ({counts?.files ?? 0} ملف) في النسخة
        </label>
        <Button onClick={doExport}>
          <Download className="h-4 w-4" /> تصدير JSON
        </Button>
        <p className="mt-3 text-xs text-slate-400">بدون الملفات تكون النسخة أصغر حجمًا، لكن استعادتها لا تعيد المرفقات (تبقى المرفقات الموجودة في المتصفح كما هي).</p>
      </Card>
      <Card title="استيراد / استعادة نسخة احتياطية">
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onPick(f);
          }}
        />
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> اختيار ملف النسخة
        </Button>
        {pending && (
          <div className={`mt-3 rounded-lg border p-3 text-sm ${pending.check.ok ? 'border-green-300 bg-green-50 dark:bg-green-950' : 'border-red-300 bg-red-50 dark:bg-red-950'}`}>
            <p className="font-bold">{pending.name}</p>
            {pending.check.ok ? (
              <>
                <p className="mt-1">النسخة صالحة. المحتوى:</p>
                <ul className="mt-1 grid grid-cols-2 gap-x-4 text-xs">
                  {Object.entries(pending.check.summary).map(([k, v]) => (
                    <li key={k}>
                      {k}: {v}
                    </li>
                  ))}
                  <li>الملفات المرفقة: {pending.check.fileCount}</li>
                </ul>
                <div className="mt-3 flex gap-2">
                  <Button variant="danger" onClick={doRestore}>
                    استبدال البيانات الحالية
                  </Button>
                  <Button variant="secondary" onClick={() => setPending(null)}>
                    إلغاء
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-red-700 dark:text-red-300">لا يمكن استعادة هذا الملف:</p>
                <ul className="list-disc pr-5 text-xs">
                  {pending.check.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">يتم التحقق من بنية الملف قبل أي تغيير. الاستعادة تتم في عملية واحدة: إذا فشلت تبقى البيانات الحالية دون تغيير.</p>
      </Card>
      <Card title="التخزين المحلي">
        <div className="flex gap-2 text-sm">
          <Database className="h-5 w-5 shrink-0 text-primary-700" />
          <div className="space-y-1">
            <p>
              التلاميذ: {counts?.students ?? '…'} — المعلمون: {counts?.teachers ?? '…'} — الوثائق: {counts?.documents ?? '…'}
            </p>
            {storage.usage !== undefined && (
              <p>
                المساحة المستعملة: {formatSize(storage.usage)}
                {storage.quota ? ` من ${formatSize(storage.quota)} متاحة` : ''}
              </p>
            )}
            <p>التخزين الدائم: {storage.persisted ? 'مفعّل (لن يحذفه المتصفح تلقائيًا)' : 'غير مضمون — قد يحذف المتصفح البيانات عند نقص المساحة'}</p>
            <p className="text-xs text-slate-500">البيانات محفوظة في هذا المتصفح على هذا الجهاز فقط (IndexedDB)، ولا تُزامَن مع أجهزة أخرى. مسح بيانات التصفح يحذفها.</p>
          </div>
        </div>
      </Card>
      <Card title="منطقة الخطر">
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">حذف جميع السجلات من هذا المتصفح (مثلًا قبل استعادة نسخة أو بداية سنة جديدة).</p>
        <Button variant="danger" onClick={wipe}>
          <Trash2 className="h-4 w-4" /> حذف جميع البيانات
        </Button>
      </Card>
    </div>
  );
}
