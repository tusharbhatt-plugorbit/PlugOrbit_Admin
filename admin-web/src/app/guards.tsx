import { Suspense, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import type { Permission } from '@/domain/permissions';
import { BrandLogo } from '@/ui/BrandLogo';
import { EmptyState, LoadingState, NoPermission } from '@/ui/States';

export function SplashScreen() {
  return (
    <div className="login" role="status" aria-label="Loading PlugOrbit Admin">
      <div style={{ position: 'relative', zIndex: 1 }}><BrandLogo size={72} glow /></div>
    </div>
  );
}

/** Admin routes need a signed-in administrator; otherwise go to sign-in and come back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <SplashScreen />;
  if (status === 'signedOut') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** Least privilege in the UI: a role that lacks the permission sees an explanation, never the page. The API enforces the same rule. */
export function RequirePermission({ permission, flag, children, what }: { permission: Permission; flag?: string; children: ReactNode; what?: string }) {
  const { can, featureOn } = useAuth();
  if (!can(permission)) return <NoPermission what={what} />;
  if (flag && !featureOn(flag)) {
    return <div className="card"><EmptyState icon="rocket" title="This module is not switched on" body="It belongs to a later phase. A Super Admin can enable it under Settings → Feature flags." /></div>;
  }
  return <Suspense fallback={<LoadingState variant="detail" />}>{children}</Suspense>;
}
