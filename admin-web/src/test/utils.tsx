import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { Permission } from '@/domain/permissions';

/** A minimal stand-in for the AuthProvider value, so components can be tested for any role. */
export function fakeAuth(permissions: Permission[], flags: Record<string, boolean> = { analytics: true, notifications: true }) {
  const perms = new Set<string>(permissions);
  return {
    status: 'signedIn' as const, mode: 'demo' as const, meta: null, error: null, notice: null, featureFlags: flags,
    principal: { uid: 'u1', email: 'a@b.co', name: 'Test Admin', role: 'operations' as const, roleLabel: 'Operations', permissions },
    can: (p: Permission) => perms.has(p), canAny: (...ps: Permission[]) => ps.some((p) => perms.has(p)), featureOn: (f: string) => flags[f] === true,
    signInWithPassword: async () => {}, signInAsDemoRole: async () => {}, signOut: async () => {}, retry: () => {},
  };
}

export function renderAt(ui: ReactElement, path = '/') {
  return render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{ui}</MemoryRouter>);
}
