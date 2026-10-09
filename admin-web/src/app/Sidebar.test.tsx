import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Permission } from '@/domain/permissions';
import { fakeAuth, renderAt } from '@/test/utils';

let auth = fakeAuth([]);
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => auth }));

const { Sidebar } = await import('./Sidebar');
const links = () => screen.getAllByRole('link').map((a) => a.textContent);

const SUPPORT: Permission[] = ['overview:read', 'partners:read', 'stations:read', 'transactions:read', 'support:read', 'support:write', 'users:read', 'users:restrict', 'notifications:read'];

describe('Sidebar shows only what the role may open (least privilege)', () => {
  it('support sees operations-light navigation and none of money, platform or audit', () => {
    auth = fakeAuth(SUPPORT);
    renderAt(<Sidebar open={false} onNavigate={() => {}} />);
    expect(links()).toEqual(['Overview', 'Partners', 'Stations', 'Map', 'Transactions', 'Support', 'Users', 'Notifications']);
  });
  it('hides a Phase 2 module when its feature flag is off, even if the role could use it', () => {
    auth = fakeAuth([...SUPPORT, 'analytics:read'], { analytics: false, notifications: true });
    renderAt(<Sidebar open={false} onNavigate={() => {}} />);
    expect(links()).not.toContain('Analytics');
    expect(links()).toContain('Notifications');
  });
  it('marks the current page for assistive tech', () => {
    auth = fakeAuth(SUPPORT);
    renderAt(<Sidebar open={false} onNavigate={() => {}} />, '/stations/st-x/pricing');
    expect(screen.getByRole('link', { name: 'Stations' })).toHaveAttribute('aria-current', 'page');
  });
  it('shows who is signed in', () => {
    auth = fakeAuth(SUPPORT);
    renderAt(<Sidebar open={false} onNavigate={() => {}} />);
    expect(screen.getByText('Test Admin')).toBeInTheDocument();
    expect(screen.getByText('Operations')).toBeInTheDocument();
  });
});
