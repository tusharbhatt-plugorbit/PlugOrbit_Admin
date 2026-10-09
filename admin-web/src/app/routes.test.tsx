import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/domain/permissions';
import { EXTRA_ROUTES, NAV, navParent } from './routes';

describe('route table (the single source for sidebar and router)', () => {
  it('has the 15 destinations from the brief, in order', () => {
    expect(NAV.map((n) => n.label)).toEqual(['Overview', 'Partners', 'Stations', 'Map', 'Transactions', 'Settlements', 'Support', 'Users', 'Data Quality', 'Charger Health', 'Analytics', 'Notifications', 'Integrations', 'Audit Log', 'Settings']);
  });
  it('has no duplicate paths, so there are no broken or shadowed routes', () => {
    const paths = [...NAV.map((n) => n.path), ...EXTRA_ROUTES.map((r) => r.path)];
    expect(new Set(paths).size).toBe(paths.length);
  });
  it('guards every route with a real permission', () => {
    for (const r of [...NAV, ...EXTRA_ROUTES]) expect(PERMISSIONS).toContain(r.permission);
  });
  it('keeps every detail route under a sidebar item', () => {
    for (const r of EXTRA_ROUTES) expect(NAV.map((n) => n.path)).toContain(r.parent);
  });
  it('gates only the Phase 2 modules behind feature flags', () => {
    expect(NAV.filter((n) => n.flag).map((n) => n.label)).toEqual(['Analytics', 'Notifications']);
  });
  it('highlights the right sidebar item for nested paths', () => {
    expect(navParent('/')).toBe('/');
    expect(navParent('/stations/st-x/pricing')).toBe('/stations');
    expect(navParent('/transactions/PO-1')).toBe('/transactions');
    expect(navParent('/partners/new')).toBe('/partners');
    expect(navParent('/nope')).toBe('/');
  });
  it('every page is a lazy component, so each screen is its own chunk', () => {
    for (const r of [...NAV, ...EXTRA_ROUTES]) expect((r.page as unknown as { $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.lazy'));
  });
});
