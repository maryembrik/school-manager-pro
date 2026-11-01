import { useEffect, useState, type ReactNode } from 'react';
import { Button, Label, Modal, inputClass } from './ui';

export interface Option {
  value: string | number;
  label: string;
}

export interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'time' | 'select' | 'checkbox' | 'email' | 'tel' | 'range';
  required?: boolean;
  options?: Option[];
  /** For selects bound to numeric ids. */
  numeric?: boolean;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  full?: boolean; // span both columns
  help?: string;
}

export type Values = Record<string, unknown>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\s-]{6,20}$/;

/** Validate values against field definitions. Returns a map of field -> error message. */
export function validateFields(fields: FieldDef[], values: Values): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = values[f.name];
    const empty = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    if (f.required && empty && f.type !== 'checkbox') {
      errors[f.name] = 'هذا الحقل إلزامي.';
      continue;
    }
    if (empty) continue;
    if (f.type === 'email' && !EMAIL_RE.test(String(v))) errors[f.name] = 'البريد الإلكتروني غير صالح.';
    if (f.type === 'tel' && !PHONE_RE.test(String(v))) errors[f.name] = 'رقم الهاتف غير صالح.';
    if (f.type === 'number' || f.type === 'range') {
      const n = Number(v);
      if (Number.isNaN(n)) errors[f.name] = 'يجب إدخال رقم.';
      else if (f.min !== undefined && n < f.min) errors[f.name] = `القيمة الدنيا ${f.min}.`;
      else if (f.max !== undefined && n > f.max) errors[f.name] = `القيمة القصوى ${f.max}.`;
    }
    if (f.type === 'text' && String(v).length > 200) errors[f.name] = 'النص طويل جدًا (200 حرف كحد أقصى).';
  }
  return errors;
}

export function FieldInput({ field, value, onChange, error }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const id = `f-${field.name}`;
  let control: ReactNode;
  const str = value === undefined || value === null ? '' : String(value);
  switch (field.type) {
    case 'textarea':
      control = <textarea id={id} rows={3} className={inputClass} value={str} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'select':
      control = (
        <select
          id={id}
          className={inputClass}
          value={str}
          onChange={(e) => onChange(e.target.value === '' ? (field.numeric ? undefined : '') : field.numeric ? Number(e.target.value) : e.target.value)}
        >
          <option value="">— اختر —</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'checkbox':
      control = (
        <label className="flex items-center gap-2 py-2 text-sm text-slate-700 dark:text-slate-200">
          <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--p-700))]" />
          {field.help ?? field.label}
        </label>
      );
      break;
    case 'number':
      control = (
        <input
          id={id}
          type="number"
          className={inputClass}
          value={str}
          min={field.min}
          max={field.max}
          step={field.step ?? 'any'}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      );
      break;
    case 'range':
      control = (
        <div className="flex items-center gap-3">
          <input id={id} type="range" className="flex-1" min={field.min ?? 0} max={field.max ?? 100} step={field.step ?? 5} value={Number(value) || 0} onChange={(e) => onChange(Number(e.target.value))} />
          <span className="w-12 text-sm font-bold">{Number(value) || 0}%</span>
        </div>
      );
      break;
    default:
      control = (
        <input
          id={id}
          type={field.type}
          dir={field.type === 'email' || field.type === 'tel' ? 'ltr' : undefined}
          className={`${inputClass} ${field.type === 'tel' || field.type === 'email' ? 'text-right' : ''}`}
          value={str}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
  return (
    <div className={field.full || field.type === 'textarea' ? 'md:col-span-2' : ''}>
      {field.type !== 'checkbox' && (
        <label htmlFor={id}>
          <Label required={field.required}>{field.label}</Label>
        </label>
      )}
      {control}
      {field.help && field.type !== 'checkbox' && <p className="mt-1 text-xs text-slate-400">{field.help}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Modal form generated from field definitions. */
export function EntityFormModal({
  open,
  title,
  fields,
  initial,
  onClose,
  onSubmit,
  extraValidate,
  children,
}: {
  open: boolean;
  title: string;
  fields: FieldDef[];
  initial: Values;
  onClose: () => void;
  onSubmit: (values: Values) => Promise<boolean>;
  extraValidate?: (values: Values) => Record<string, string | undefined>;
  children?: (values: Values, set: (name: string, v: unknown) => void) => ReactNode;
}) {
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(initial);
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (name: string, v: unknown) => setValues((s) => ({ ...s, [name]: v }));

  const submit = async () => {
    const extra = Object.fromEntries(Object.entries(extraValidate?.(values) ?? {}).filter(([, m]) => !!m)) as Record<string, string>;
    const errs = { ...validateFields(fields, values), ...extra };
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const ok = await onSubmit(values);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} loading={saving}>
            حفظ
          </Button>
        </>
      }
    >
      <form
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {fields.map((f) => (
          <FieldInput key={f.name} field={f} value={values[f.name]} onChange={(v) => set(f.name, v)} error={errors[f.name]} />
        ))}
        {children?.(values, set)}
        {Object.keys(errors).length > 0 && <p className="text-sm text-red-600 md:col-span-2">يرجى تصحيح الحقول المشار إليها.</p>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export const opts = (list: string[]): Option[] => list.map((v) => ({ value: v, label: v }));
