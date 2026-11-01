import { useEffect, useState } from 'react';
import { Lock, School, ShieldAlert } from 'lucide-react';
import { getAuth, markUnlocked, setPassword, validatePasswordStrength, verifyPassword } from '../lib/auth';
import { Button, Label, Loading, inputClass } from '../components/ui';
import { useApp } from '../context/AppContext';

export function Login({ onUnlock }: { onUnlock: () => void }) {
  const { settings, logo } = useApp();
  const [mode, setMode] = useState<'loading' | 'setup' | 'login'>('loading');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    getAuth()
      .then((a) => setMode(a ? 'login' : 'setup'))
      .catch(() => {
        setError('تعذر الوصول إلى قاعدة البيانات المحلية. تأكد من أن المتصفح يسمح بالتخزين (ليس في وضع التصفح الخاص المقيد).');
        setMode('setup');
      });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'setup') {
        const err = validatePasswordStrength(pw);
        if (err) return setError(err);
        if (pw !== pw2) return setError('كلمتا المرور غير متطابقتين.');
        await setPassword(pw);
        markUnlocked(true);
        onUnlock();
      } else {
        // Small growing delay after failed attempts to slow down guessing.
        if (attempts > 2) await new Promise((r) => setTimeout(r, Math.min(attempts * 500, 5000)));
        if (await verifyPassword(pw)) {
          markUnlocked(true);
          onUnlock();
        } else {
          setAttempts((a) => a + 1);
          setError('كلمة المرور غير صحيحة.');
        }
      }
    } catch (e2) {
      setError((e2 as Error).message || 'حدث خطأ.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-900 to-primary-700 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-slate-800">
        <div className="mb-6 text-center">
          {logo ? <img src={logo} alt="" className="mx-auto mb-3 h-16 w-16 object-contain" /> : <School className="mx-auto mb-3 h-14 w-14 text-primary-700" />}
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-white">School Manager Pro</h1>
          <p className="text-sm text-slate-500">{settings.schoolName}</p>
        </div>
        {mode === 'loading' ? (
          <Loading />
        ) : (
          <>
            <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
              <Lock className="h-4 w-4" /> {mode === 'setup' ? 'إنشاء كلمة مرور المدير' : 'الدخول إلى لوحة القيادة'}
            </h2>
            <label className="mb-3 block">
              <Label>كلمة المرور</Label>
              <input type="password" autoFocus className={inputClass} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} />
            </label>
            {mode === 'setup' && (
              <label className="mb-3 block">
                <Label>تأكيد كلمة المرور</Label>
                <input type="password" className={inputClass} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
              </label>
            )}
            {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
            <Button type="submit" className="w-full" loading={busy}>
              {mode === 'setup' ? 'إنشاء والدخول' : 'دخول'}
            </Button>
            <div className="mt-5 flex gap-2 rounded-lg bg-orange-50 p-3 text-xs leading-relaxed text-orange-900 dark:bg-orange-950 dark:text-orange-100">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <p>
                كلمة المرور محفوظة بصيغة مُجزّأة (PBKDF2-SHA256) ولا تُخزَّن كنص. هذه الشاشة تحمي الواجهة فقط: البيانات محفوظة في متصفح هذا الجهاز
                <strong> دون تشفير</strong>، ولا تتم مزامنتها تلقائيًا مع أجهزة أخرى. احفظ نسخًا احتياطية بانتظام.
              </p>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
