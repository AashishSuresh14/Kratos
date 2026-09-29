import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { setUnauthorizedHandler } from './api/client';
import { useAuth } from './auth/AuthContext';
import { RequireAuth, RequireRole } from './auth/guards';
import { homePathFor, PERMISSIONS } from './auth/permissions';
import { AppShell } from './components/AppShell';
import { SkeletonLines } from './components/States';
import { LoginPage } from './features/auth/LoginPage';
import { ForbiddenPage, NotFoundPage } from './features/errors/ErrorPages';

const PortfolioPage = lazy(() => import('./features/portfolio/PortfolioPage'));
const NbdPage = lazy(() => import('./features/portfolio/NbdPage'));
const EbdPage = lazy(() => import('./features/portfolio/EbdPage'));
const AccountPage = lazy(() => import('./features/account/AccountPage'));
const ActionsPage = lazy(() => import('./features/actions/ActionsPage'));
const ImportPage = lazy(() => import('./features/import/ImportPage'));
const ExportsPage = lazy(() => import('./features/exports/ExportsPage'));
const BriefPage = lazy(() => import('./features/brief/BriefPage'));
const AdminPage = lazy(() => import('./features/admin/AdminPage'));

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}

const guard = (roles: readonly (typeof PERMISSIONS)[keyof typeof PERMISSIONS][number][], el: ReactNode) => (
  <RequireRole roles={roles}>
    <Suspense fallback={<SkeletonLines lines={8} />}>{el}</Suspense>
  </RequireRole>
);

export function App() {
  const navigate = useNavigate();

  // A 401 from any call clears the session (in the client) and lands here.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      const here = window.location.pathname + window.location.search;
      if (!window.location.pathname.startsWith('/login')) {
        navigate(`/login?expired=1&next=${encodeURIComponent(here)}`, { replace: true });
      }
    });
  }, [navigate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="portfolio" element={guard(PERMISSIONS['plan.view'], <PortfolioPage />)} />
        <Route path="nbd" element={guard(PERMISSIONS['plan.view'], <NbdPage />)} />
        <Route path="ebd" element={guard(PERMISSIONS['plan.view'], <EbdPage />)} />
        <Route path="accounts/:id" element={guard(PERMISSIONS['plan.view'], <AccountPage />)} />
        <Route path="actions" element={guard(PERMISSIONS['actions.view'], <ActionsPage />)} />
        <Route path="import" element={guard(PERMISSIONS['import.run'], <ImportPage />)} />
        <Route
          path="exports"
          element={guard(['Executive', 'GroupLead', 'AccountManager'] as const, <ExportsPage />)}
        />
        <Route path="brief" element={guard(PERMISSIONS['ai.brief'], <BriefPage />)} />
        <Route path="admin" element={guard(PERMISSIONS['admin.masterData'], <AdminPage />)} />
        <Route path="403" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
