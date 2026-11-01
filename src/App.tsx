import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { ConfirmProvider } from './components/ui';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { isUnlocked } from './lib/auth';
import { Dashboard } from './pages/Dashboard';
import { StudentsPage, StudentProfile } from './pages/Students';
import { TeachersPage, TeacherProfile } from './pages/Teachers';
import { ClassesPage, ClassDetail } from './pages/Classes';
import { AttendancePage } from './pages/Attendance';
import { PedagogyPage } from './pages/Pedagogy';
import { ExamsPage } from './pages/Exams';
import { TasksPage } from './pages/Tasks';
import { CalendarPage } from './pages/Calendar';
import { MeetingsPage } from './pages/Meetings';
import { DocumentsPage } from './pages/Documents';
import { ParentsPage } from './pages/Parents';
import { ReportsPage } from './pages/Reports';
import { ArchivePage } from './pages/Archive';
import { SettingsPage } from './pages/Settings';

function StorageGuard() {
  const { toast } = useApp();
  useEffect(() => {
    // Ask the browser to keep IndexedDB data even under storage pressure.
    navigator.storage?.persist?.().catch(() => undefined);
    if (!('indexedDB' in window)) toast('هذا المتصفح لا يدعم IndexedDB، لا يمكن حفظ البيانات.', 'error');
  }, [toast]);
  return null;
}

function Shell() {
  const [unlocked, setUnlocked] = useState(isUnlocked());
  if (!unlocked) return <Login onUnlock={() => setUnlocked(true)} />;
  return (
    <HashRouter>
      <StorageGuard />
      <Routes>
        <Route element={<Layout onLock={() => setUnlocked(false)} />}>
          <Route index element={<Dashboard />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="students/:id" element={<StudentProfile />} />
          <Route path="teachers" element={<TeachersPage />} />
          <Route path="teachers/:id" element={<TeacherProfile />} />
          <Route path="classes" element={<ClassesPage />} />
          <Route path="classes/:id" element={<ClassDetail />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="pedagogy" element={<PedagogyPage />} />
          <Route path="exams" element={<ExamsPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="meetings" element={<MeetingsPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="parents" element={<ParentsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="archive" element={<ArchivePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export function App() {
  return (
    <AppProvider>
      <ConfirmProvider>
        <Shell />
      </ConfirmProvider>
    </AppProvider>
  );
}
