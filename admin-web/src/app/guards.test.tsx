import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeAuth, renderAt } from '@/test/utils';

let auth = fakeAuth([]);
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => auth }));
const { RequirePermission } = await import('./guards');

describe('RequirePermission', () => {
  it('renders the page for a role that holds the permission', async () => {
    auth = fakeAuth(['settlements:read']);
    renderAt(<RequirePermission permission="settlements:read"><div>Settlements page</div></RequirePermission>);
    expect(await screen.findByText('Settlements page')).toBeInTheDocument();
  });
  it('shows an explanation, never the page, for a role without it', () => {
    auth = fakeAuth(['support:read']);
    renderAt(<RequirePermission permission="settlements:read" what="Settlements"><div>Settlements page</div></RequirePermission>);
    expect(screen.queryByText('Settlements page')).not.toBeInTheDocument();
    expect(screen.getByText("You don't have access")).toBeInTheDocument();
  });
  it('refuses a Phase 2 route whose flag is off, explaining why', () => {
    auth = fakeAuth(['analytics:read'], { analytics: false });
    renderAt(<RequirePermission permission="analytics:read" flag="analytics"><div>Analytics page</div></RequirePermission>);
    expect(screen.queryByText('Analytics page')).not.toBeInTheDocument();
    expect(screen.getByText('This module is not switched on')).toBeInTheDocument();
  });
});
