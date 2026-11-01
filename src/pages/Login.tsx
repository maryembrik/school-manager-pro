import { useEffect, useState } from 'react';
import { Lock, School, ShieldAlert } from 'lucide-react';
import {
  createRecoveryCode,
  getAuth,
  markUnlocked,
  resetPasswordWithRecoveryCode,
  setPassword,
  validatePasswordStrength,
  verifyPassword,
} from '../lib/auth';
import { Button, Label, Loading, SecretInput } from '../components/ui';
import { RecoveryCodeNotice } from '../components/RecoveryCode';
import { useApp } from '../context/AppContext';

type Mode = 'loading' | 'setup' | 'login' | 'recover' | 'code';

export function Login({ onUnlock }: { onUnlock: () => void }) {
  const { settings, logo } = useApp();
  const [mode, setMode] = useState<Mode>('loading');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [code, setCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [hasRecovery, setHasRecovery] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    getAuth()
      .then((a) => {
        setHasRecovery(!!a?.recovery);
        setMode(a ? 'login' : 'setup');
      })
      .catch(() => {
        setError('تعذر الوصول إلى قاعدة البيانات المحلية. تأكد من أن المتصفح يسمح بالتخزين (ليس في وضع التصفح الخاص المقيد).');
        setMode('setup');
      });
  }, []);

  const go = (m: Mode) => {
    setMode(m);
    setError('');
    setPw('');
    setPw2('');
    setCode('');
  };

  const unlock = () => {
    markUnlocked(true);
    onUnlock();
  };

  // Small growing delay after failed attempts to slow down guessing.
  const throttle = () => (attempts > 2 ? new Promise((r) => setTimeout(r, Math.min(attempts * 500, 5000))) : Promise.resolve());

  const checkNewPassword = () => validatePasswordStrength(pw) ?? (pw !== pw2 ? 'كلمتا المرور غير متطابقتين.' : null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'setup') {
        const err = checkNewPassword();
        if (err) return setError(err);
        await setPassword(pw);
        setNewCode(await createRecoveryCode());
        setMode('code');
      } else if (mode === 'recover') {
        const err = checkNewPassword();
        if (err) return setError(err);
        await throttle();
        try {
          setNewCode(await resetPasswordWithRecoveryCode(code, pw));
          setMode('code');
        } catch (e2) {
          setAttempts((a) => a + 1);
          throw e2;
        }
      } else {
        await throttle();
        if (await verifyPassword(pw)) unlock();
        else {
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

  const title = mode === 'setup' ? 'إنشاء كلمة مرور المدير' : mode === 'recover' ? 'تعيين كلمة مرور جديدة' : 'الدخول إلى لوحة القيادة';

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
        ) : mode === 'code' ? (
          <RecoveryCodeNotice code={newCode} onDone={unlock} doneLabel="الدخول إلى التطبيق" />
        ) : (
          <>
            <h2 className="mb-4 flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
              <Lock className="h-4 w-4" /> {title}
            </h2>
            {mode === 'recover' && !hasRecovery ? (
              <div className="mb-3 space-y-2 rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <p>لم يتم إنشاء رمز استرجاع على هذا الجهاز، لذلك لا يمكن تعيين كلمة مرور جديدة مع الحفاظ على البيانات.</p>
                <p>
                  الحل: أغلق التطبيق، وغيّر اسم المجلد <span dir="ltr">%APPDATA%\School Manager Pro</span>، ثم افتح التطبيق وأنشئ كلمة مرور جديدة واستورد آخر نسخة
                  احتياطية من الإعدادات.
                </p>
              </div>
            ) : (
              <>
                {mode === 'recover' && (
                  <label className="mb-3 block">
                    <Label>رمز الاسترجاع</Label>
                    <SecretInput dir="ltr" autoFocus className="font-mono uppercase" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
                  </label>
                )}
                <label className="mb-3 block">
                  <Label>{mode === 'recover' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}</Label>
                  <SecretInput
                    key={mode} // start hidden again when switching between login and recovery
                    autoFocus={mode !== 'recover'}
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                </label>
                {mode !== 'login' && (
                  <label className="mb-3 block">
                    <Label>تأكيد كلمة المرور</Label>
                    <SecretInput value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
                  </label>
                )}
                {error && <p className="mb-3 whitespace-pre-line rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
                <Button type="submit" className="w-full" loading={busy}>
                  {mode === 'setup' ? 'إنشاء والمتابعة' : mode === 'recover' ? 'تعيين كلمة المرور' : 'دخول'}
                </Button>
              </>
            )}
            {mode === 'login' && (
              <button type="button" className="mt-3 w-full text-center text-sm text-primary-700 hover:underline dark:text-primary-100" onClick={() => go('recover')}>
                نسيت كلمة المرور؟
              </button>
            )}
            {mode === 'recover' && (
              <button type="button" className="mt-3 w-full text-center text-sm text-slate-500 hover:underline" onClick={() => go('login')}>
                العودة إلى الدخول
              </button>
            )}
            <div className="mt-5 flex gap-2 rounded-lg bg-orange-50 p-3 text-xs leading-relaxed text-orange-900 dark:bg-orange-950 dark:text-orange-100">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <p>
                كلمة المرور محفوظة بصيغة مُجزّأة (PBKDF2-SHA256) ولا تُخزَّن كنص. هذه الشاشة تحمي الواجهة فقط: البيانات محفوظة على هذا الجهاز
                <strong> دون تشفير</strong>، ولا تتم مزامنتها تلقائيًا مع أجهزة أخرى. احفظ نسخًا احتياطية بانتظام.
              </p>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
