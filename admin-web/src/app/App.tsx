import { Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthProvider';
import { ToastProvider } from '@/ui/Toast';
import { EmptyState } from '@/ui/States';
import { Button } from '@/ui/Button';
import { AdminShell } from './AdminShell';
import { RequireAuth, RequirePermission, SplashScreen } from './guards';
import { EXTRA_ROUTES, NAV } from './routes';
import LoginPage from './LoginPage';
import { usePageMeta } from '@/ui/Page';

function NotFound() {
  usePageMeta('Page not found');
  return <div className="card"><EmptyState icon="map-pin" title="That page does not exist" body="The link may be old, or the page may have moved." action={<Button label="Go to Overview" onClick={() => window.location.assign('/')} />} /></div>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth><AdminShell /></RequireAuth>}>
        {NAV.map((n) => (
          <Route key={n.path} path={n.path} element={<RequirePermission permission={n.permission} flag={n.flag} what={n.label}><n.page /></RequirePermission>} />
        ))}
        {EXTRA_ROUTES.map((r) => (
          <Route key={r.path} path={r.path} element={<RequirePermission permission={r.permission}><r.page /></RequirePermission>} />
        ))}
        <Route path="/overview" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<SplashScreen />}><AppRoutes /></Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
