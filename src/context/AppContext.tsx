import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { applyTheme, loadSettings, saveSettings, type AppSettings } from '../lib/settings';
import { db } from '../db/db';
import type { PrintHeader } from '../lib/exporters';

type ToastKind = 'success' | 'error' | 'warning' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface AppContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  reloadSettings: () => void;
  logo: string | null;
  printHeader: PrintHeader;
  toast: (message: string, kind?: ToastKind) => void;
  /** Run an async operation, showing a success toast or a clear error toast. Returns true on success. */
  run: (op: () => Promise<unknown>, success?: string) => Promise<boolean>;
}

const Ctx = createContext<AppContextValue | null>(null);

export function describeError(e: unknown): string {
  const err = e as { name?: string; message?: string };
  if (err?.name === 'QuotaExceededError' || err?.name === 'Dexie.QuotaExceededError' || /quota/i.test(err?.message ?? '')) {
    return 'مساحة التخزين في المتصفح ممتلئة. احذف بعض الملفات المرفقة أو صدّر نسخة احتياطية ثم أفرغ الأرشيف.';
  }
  if (err?.name === 'ConstraintError') return 'تعذر الحفظ: يوجد سجل مكرر.';
  return err?.message ? `حدث خطأ: ${err.message}` : 'حدث خطأ غير متوقع. لم يتم تغيير البيانات.';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const logo = useLiveQuery(async () => ((await db.meta.get('logo'))?.value as string | undefined) ?? null, [], null);

  useEffect(() => applyTheme(settings), [settings]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        saveSettings(next);
      } catch {
        // surfaced through the toast below
        setTimeout(() => toastRef('تعذر حفظ الإعدادات في المتصفح.', 'error'));
      }
      return next;
    });
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500);
  }, []);
  toastRef = toast;

  const run = useCallback(
    async (op: () => Promise<unknown>, success?: string) => {
      try {
        await op();
        if (success) toast(success, 'success');
        return true;
      } catch (e) {
        console.error(e);
        toast(describeError(e), 'error');
        return false;
      }
    },
    [toast],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      settings,
      updateSettings,
      reloadSettings: () => setSettings(loadSettings()),
      logo: logo ?? null,
      printHeader: { schoolName: settings.schoolName, schoolYear: settings.schoolYear, logo },
      toast,
      run,
    }),
    [settings, updateSettings, logo, toast, run],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 left-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2 no-print" aria-live="polite">
        {toasts.map((t) => (
          <ToastView key={t.id} item={t} onClose={() => setToasts((x) => x.filter((y) => y.id !== t.id))} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

let toastRef: (m: string, k?: ToastKind) => void = () => {};

function ToastView({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const styles: Record<ToastKind, string> = {
    success: 'border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100',
    error: 'border-red-500 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100',
    warning: 'border-orange-500 bg-orange-50 text-orange-900 dark:bg-orange-950 dark:text-orange-100',
    info: 'border-primary-600 bg-primary-50 text-primary-900 dark:bg-slate-800 dark:text-slate-100',
  };
  const Icon = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info }[item.kind];
  return (
    <div role="status" className={`flex items-start gap-2 rounded-lg border-r-4 p-3 shadow-lg ${styles[item.kind]}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <p className="flex-1 whitespace-pre-line text-sm">{item.message}</p>
      <button onClick={onClose} aria-label="إغلاق" className="opacity-60 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp must be used inside AppProvider');
  return c;
}
