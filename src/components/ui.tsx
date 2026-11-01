import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2, X } from 'lucide-react';

// ---------- Button ----------
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-primary-700 text-white hover:bg-primary-800 focus-visible:ring-primary-500',
  secondary:
    'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600 dark:hover:bg-slate-700',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
  success: 'bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-500',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'
      } ${variants[variant]} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function IconButton({ title, onClick, children, tone = 'default' }: { title: string; onClick: () => void; children: ReactNode; tone?: 'default' | 'danger' }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded-md p-1.5 transition ${
        tone === 'danger' ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950' : 'text-slate-500 hover:bg-slate-100 hover:text-primary-700 dark:hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

// ---------- Card ----------
export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{title}</h3>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, icon, actions }: { title: string; subtitle?: string; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && <div className="rounded-xl bg-primary-100 p-2.5 text-primary-700 dark:bg-slate-700 dark:text-primary-100">{icon}</div>}
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-white md:text-2xl">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const toneMap = {
  blue: 'bg-primary-50 text-primary-700 dark:bg-slate-700 dark:text-primary-100',
  green: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  orange: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  gray: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};
export type Tone = keyof typeof toneMap;

export function StatCard({ label, value, icon, tone = 'blue', hint, onClick }: { label: string; value: ReactNode; icon: ReactNode; tone?: Tone; hint?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
    >
      <div className={`rounded-xl p-3 ${toneMap[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-2xl font-extrabold text-slate-800 dark:text-white">{value}</div>
        <div className="truncate text-sm text-slate-500 dark:text-slate-400">{label}</div>
        {hint && <div className="text-xs text-slate-400">{hint}</div>}
      </div>
    </button>
  );
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${toneMap[tone]}`}>{children}</span>;
}

export function ProgressBar({ value, tone = 'green' }: { value: number; tone?: 'green' | 'orange' | 'red' | 'blue' }) {
  const color = { green: 'bg-green-500', orange: 'bg-orange-500', red: 'bg-red-500', blue: 'bg-primary-600' }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      <div className={`h-full ${color} transition-all`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function EmptyState({ message = 'لا توجد بيانات بعد.', action }: { message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-slate-400">
      <Inbox className="h-10 w-10" />
      <p className="text-sm">{message}</p>
      {action}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
      <Loader2 className="h-5 w-5 animate-spin" /> جارٍ التحميل…
    </div>
  );
}

// ---------- Modal ----------
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'lg',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-5xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-2 pt-8 md:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${width} rounded-xl bg-white shadow-2xl dark:bg-slate-800`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">{title}</h2>
          <button onClick={onClose} aria-label="إغلاق" className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Confirm dialog ----------
interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}
const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>();
  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => (resolver.current = resolve));
  }, []);
  const close = (v: boolean) => {
    resolver.current?.(v);
    setOpts(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!opts}
        size="md"
        title={opts?.title ?? 'تأكيد العملية'}
        onClose={() => close(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              إلغاء
            </Button>
            <Button variant={opts?.danger === false ? 'primary' : 'danger'} onClick={() => close(true)}>
              {opts?.confirmLabel ?? 'تأكيد الحذف'}
            </Button>
          </>
        }
      >
        <div className="flex gap-3">
          <AlertTriangle className="h-6 w-6 shrink-0 text-orange-500" />
          <p className="whitespace-pre-line text-slate-700 dark:text-slate-200">{opts?.message}</p>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

// ---------- Form controls ----------
export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-slate-700';

export function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <span className="mb-1 block text-sm font-semibold text-slate-600 dark:text-slate-300">
      {children}
      {required && <span className="text-red-500"> *</span>}
    </span>
  );
}

export function SearchInput({ value, onChange, placeholder = 'بحث…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputClass} md:w-64`} />;
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} md:w-auto ${className}`}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition ${
            value === t.id ? 'border-primary-700 text-primary-700 dark:border-primary-100 dark:text-primary-100' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
