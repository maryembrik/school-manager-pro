import { useState } from 'react';
import { Copy, Download, KeyRound } from 'lucide-react';
import { Button } from './ui';
import { downloadBlob } from '../lib/backup';

/** Shows a freshly created recovery code once, and only lets the director continue after confirming it was saved. */
export function RecoveryCodeNotice({ code, onDone, doneLabel = 'متابعة' }: { code: string; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <h2 className="mb-2 flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
        <KeyRound className="h-4 w-4" /> رمز الاسترجاع
      </h2>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        دوّن هذا الرمز واحفظه في مكان آمن خارج الحاسوب. إذا نسيت كلمة المرور، يسمح لك بتعيين كلمة مرور جديدة دون فقدان البيانات.
        <strong> لن يُعرض مرة أخرى.</strong>
      </p>
      <div dir="ltr" className="mb-3 select-all rounded-lg border-2 border-dashed border-primary-300 bg-primary-50 p-3 text-center font-mono text-xl font-bold tracking-wider text-primary-900 dark:bg-slate-900 dark:text-primary-100">
        {code}
      </div>
      <div className="mb-3 flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() =>
            navigator.clipboard
              .writeText(code)
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }
        >
          <Copy className="h-4 w-4" /> {copied ? 'تم النسخ' : 'نسخ'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() =>
            downloadBlob(
              new Blob([`School Manager Pro\r\nرمز الاسترجاع: ${code}\r\nأُنشئ في: ${new Date().toLocaleString('ar-TN')}\r\n`], { type: 'text/plain;charset=utf-8' }),
              'school-manager-recovery-code.txt',
            )
          }
        >
          <Download className="h-4 w-4" /> حفظ كملف
        </Button>
      </div>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        دوّنت الرمز وحفظته في مكان آمن
      </label>
      <Button type="button" className="w-full" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}
