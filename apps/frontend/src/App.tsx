import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { api } from './lib/api';
import { useAuthStore } from './stores/auth.store';
import Login from './pages/Login';
import ForcePasswordChange from './pages/ForcePasswordChange';
import Dashboard from './pages/Dashboard';
import Welcome from './pages/Welcome';
import Docs from './pages/Docs';
import Account from './pages/Account';
import Containers from './pages/Containers';
import AuditLog from './pages/AuditLog';
import Users from './pages/Users';
import Status from './pages/Status';
import ProjectLayout from './pages/ProjectPage/Layout';
import ProjectOverview from './pages/ProjectPage/Overview';
import ProjectBuilds from './pages/ProjectPage/Builds';
import ProjectFiles from './pages/ProjectPage/Files';
import ProjectMetrics from './pages/ProjectPage/Metrics';
import ProjectConsole from './pages/ProjectPage/Console';
import NewProject from './pages/NewProject';
import EditProject from './pages/EditProject';

type AuthState = 'loading' | 'authed' | 'anon';

export default function App() {
  const [auth, setAuth] = useState<AuthState>('loading');
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    api
      .me()
      .then((me) => {
        useAuthStore.getState().setUser(me);
        setAuth('authed');
      })
      .catch(() => setAuth('anon'));
  }, []);

  if (auth === 'loading') {
    return null;
  }

  if (auth === 'anon') {
    return (
      <Routes>
        <Route path="/status" element={<Status />} />
        <Route path="*" element={<Login onLoggedIn={() => setAuth('authed')} />} />
      </Routes>
    );
  }

  // Пароль выдан системой (первый admin или созданный/сброшенный в админке) —
  // до смены на свой бэкенд всё равно отвечает 403 на всё, кроме смены пароля.
  if (user?.mustChangePassword) {
    return (
      <Routes>
        <Route path="/status" element={<Status />} />
        <Route path="*" element={<ForcePasswordChange />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/status" element={<Status />} />
      <Route path="/" element={<Dashboard />}>
        <Route index element={<Welcome />} />
        <Route path="docs" element={<Docs />} />
        <Route path="account" element={<Account />} />
        <Route path="containers" element={<Containers />} />
        <Route path="audit-log" element={<AuditLog />} />
        <Route path="users" element={<Users />} />
        <Route path="projects/new" element={<NewProject />} />
        <Route path="projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<ProjectOverview />} />
          <Route path="edit" element={<EditProject />} />
          <Route path="builds" element={<ProjectBuilds />} />
          <Route path="files" element={<ProjectFiles />} />
          <Route path="metrics" element={<ProjectMetrics />} />
          <Route path="console" element={<ProjectConsole />} />
        </Route>
      </Route>
    </Routes>
  );
}
