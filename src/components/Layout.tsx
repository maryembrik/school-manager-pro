import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Archive,
  BarChart3,
  Bell,
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  NotebookPen,
  PanelRightClose,
  PanelRightOpen,
  Phone,
  Plus,
  School,
  Settings,
  Sun,
  Users,
  UsersRound,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useNotifications } from '../hooks/notifications';
import { dayName, formatDate, todayISO } from '../lib/utils';
import { markUnlocked } from '../lib/auth';

export const NAV: { to: string; label: string; icon: ReactNode }[] = [
  { to: '/', label: 'لوحة القيادة', icon: <LayoutDashboard className="h-5 w-5" /> },
  { to: '/students', label: 'إدارة التلاميذ', icon: <GraduationCap className="h-5 w-5" /> },
  { to: '/teachers', label: 'إدارة المعلمين', icon: <Users className="h-5 w-5" /> },
  { to: '/classes', label: 'إدارة الأقسام', icon: <School className="h-5 w-5" /> },
  { to: '/attendance', label: 'الحضور والغياب', icon: <ClipboardCheck className="h-5 w-5" /> },
  { to: '/pedagogy', label: 'المتابعة البيداغوجية', icon: <BookOpenCheck className="h-5 w-5" /> },
  { to: '/exams', label: 'الامتحانات والتقييم', icon: <NotebookPen className="h-5 w-5" /> },
  { to: '/tasks', label: 'المهام الإدارية', icon: <ClipboardList className="h-5 w-5" /> },
  { to: '/calendar', label: 'الروزنامة السنوية', icon: <CalendarDays className="h-5 w-5" /> },
  { to: '/meetings', label: 'الاجتماعات والمحاضر', icon: <UsersRound className="h-5 w-5" /> },
  { to: '/documents', label: 'المراسلات والوثائق', icon: <FileText className="h-5 w-5" /> },
  { to: '/parents', label: 'متابعة الأولياء', icon: <Phone className="h-5 w-5" /> },
  { to: '/reports', label: 'الإحصائيات والتقارير', icon: <BarChart3 className="h-5 w-5" /> },
  { to: '/archive', label: 'الأرشيف الرقمي', icon: <Archive className="h-5 w-5" /> },
  { to: '/settings', label: 'إعدادات النظام', icon: <Settings className="h-5 w-5" /> },
];

const QUICK_ADD = [
  { label: 'تلميذ', to: '/students?new=1' },
  { label: 'معلم', to: '/teachers?new=1' },
  { label: 'مهمة', to: '/tasks?new=1' },
  { label: 'حدث في الروزنامة', to: '/calendar?new=1' },
  { label: 'اجتماع', to: '/meetings?new=1' },
  { label: 'وثيقة', to: '/documents?new=1' },
  { label: 'اتصال بولي', to: '/parents?new=1' },
  { label: 'تسجيل الغياب', to: '/attendance' },
];

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOutside();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onOutside]);
  return ref;
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const today = todayISO(now);
  return (
    <div className="hidden text-left leading-tight lg:block">
      <div dir="ltr" className="font-mono text-lg font-bold text-primary-700 dark:text-primary-100">
        {now.toLocaleTimeString('fr-FR', { hour12: false })}
      </div>
      <div className="text-xs text-slate-500">
        {dayName(today)} {formatDate(today)}
      </div>
    </div>
  );
}

export function Layout({ onLock }: { onLock: () => void }) {
  const { settings, updateSettings, logo } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifications = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const collapsed = settings.sidebarCollapsed;
  const quickRef = useClickOutside(() => setQuickOpen(false));
  const notifRef = useClickOutside(() => setNotifOpen(false));

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const urgent = notifications?.filter((n) => n.level !== 'info').length ?? 0;

  const sidebar = (
    <nav className="flex h-full flex-col bg-primary-900 text-white">
      <div className={`flex items-center gap-3 border-b border-white/10 p-4 ${collapsed ? 'md:justify-center md:p-3' : ''}`}>
        {logo ? <img src={logo} alt="الشعار" className="h-10 w-10 rounded-lg bg-white object-contain p-0.5" /> : <School className="h-9 w-9 shrink-0" />}
        <div className={`min-w-0 ${collapsed ? 'md:hidden' : ''}`}>
          <div className="truncate text-sm font-bold">{settings.schoolName}</div>
          <div className="text-xs text-white/60">School Manager Pro</div>
        </div>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              title={item.label}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${collapsed ? 'md:justify-center md:px-2' : ''} ${
                  isActive ? 'bg-white/15 font-bold text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {item.icon}
              <span className={collapsed ? 'md:hidden' : ''}>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="border-t border-white/10 p-2">
        <button
          onClick={() => updateSettings({ sidebarCollapsed: !collapsed })}
          className="hidden w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 md:flex"
          title={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
        >
          {collapsed ? <PanelRightOpen className="h-5 w-5" /> : <PanelRightClose className="h-5 w-5" />}
          {!collapsed && 'طي القائمة'}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-900">
      {/* Desktop sidebar */}
      <aside className={`no-print sticky top-0 hidden h-screen shrink-0 transition-all md:block ${collapsed ? 'w-[72px]' : 'w-64'}`}>{sidebar}</aside>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-64">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-800/95 md:px-6">
          <button className="rounded p-2 md:hidden" onClick={() => setMobileOpen(true)} aria-label="القائمة">
            <Menu className="h-5 w-5 text-slate-600 dark:text-slate-200" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-slate-800 dark:text-white md:text-base">{settings.schoolName}</div>
            <div className="text-xs text-slate-500">السنة الدراسية {settings.schoolYear}</div>
          </div>
          <Clock />

          <div className="relative" ref={quickRef}>
            <button
              onClick={() => setQuickOpen((v) => !v)}
              className="flex items-center gap-1 rounded-lg bg-primary-700 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-800"
            >
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">إضافة سريعة</span>
            </button>
            {quickOpen && (
              <div className="absolute left-0 mt-2 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                {QUICK_ADD.map((q) => (
                  <button
                    key={q.to}
                    onClick={() => {
                      setQuickOpen(false);
                      navigate(q.to);
                    }}
                    className="block w-full px-4 py-2 text-right text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative" ref={notifRef}>
            <button onClick={() => setNotifOpen((v) => !v)} className="relative rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="الإشعارات">
              <Bell className="h-5 w-5 text-slate-600 dark:text-slate-200" />
              {!!notifications?.length && (
                <span className={`absolute -top-0.5 -left-0.5 rounded-full px-1.5 text-[10px] font-bold text-white ${urgent ? 'bg-red-600' : 'bg-primary-600'}`}>
                  {notifications.length}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute left-0 mt-2 max-h-[70vh] w-[min(90vw,360px)] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
                <div className="border-b border-slate-200 px-4 py-2 text-sm font-bold dark:border-slate-700 dark:text-white">مركز الإشعارات</div>
                {!notifications?.length && <p className="p-4 text-sm text-slate-400">لا توجد إشعارات حاليًا.</p>}
                {notifications?.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      setNotifOpen(false);
                      navigate(n.link);
                    }}
                    className="flex w-full gap-2 border-b border-slate-100 px-4 py-2 text-right last:border-0 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.level === 'danger' ? 'bg-red-500' : n.level === 'warning' ? 'bg-orange-500' : 'bg-primary-500'}`} />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{n.title}</span>
                      <span className="block text-xs text-slate-500">{n.detail}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
            className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="تبديل الوضع"
            title="الوضع النهاري/الليلي"
          >
            {settings.theme === 'dark' ? <Sun className="h-5 w-5 text-yellow-400" /> : <Moon className="h-5 w-5 text-slate-600" />}
          </button>
          <button
            onClick={() => {
              markUnlocked(false);
              onLock();
            }}
            className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="قفل التطبيق"
            title="خروج / قفل"
          >
            <LogOut className="h-5 w-5 text-slate-600 dark:text-slate-200" />
          </button>
        </header>

        <main className="flex-1 p-3 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
