import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { Overview } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { useResource, type Resource } from '@/hooks/useResource';
import { adminHealthService } from '@/services/adminHealthService';

const Ctx = createContext<Resource<Overview> | null>(null);

/** One shared, auto-refreshing Overview: feeds the top-bar health pill, the attention bell and the Overview page. */
export function ShellDataProvider({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  const overview = useResource((signal) => adminHealthService.overview(signal), [], { enabled: can('overview:read') });
  const { reload } = overview;
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, 60_000);
    return () => clearInterval(id);
  }, [reload]);
  return <Ctx.Provider value={overview}>{children}</Ctx.Provider>;
}

export function useShellOverview(): Resource<Overview> {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useShellOverview must be used inside <ShellDataProvider>.');
  return ctx;
}
