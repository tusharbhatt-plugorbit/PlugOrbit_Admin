/**
 * Permission names. The role -> permission matrix is NOT here: it lives only on the server and
 * is delivered by /auth/me, so changing a role changes the UI with no front-end release. These
 * constants just give guards and `can()` calls type-safety (a typo is a compile error).
 */
export const PERMISSIONS = [
  'overview:read',
  'partners:read', 'partners:write', 'partners:review',
  'stations:read', 'stations:write', 'stations:publish', 'stations:override',
  'connectors:write', 'pricing:write',
  'transactions:read', 'refunds:issue',
  'settlements:read', 'settlements:run', 'settlements:approve', 'settlements:pay',
  'support:read', 'support:write',
  'users:read', 'users:restrict', 'users:reveal',
  'dataquality:read', 'dataquality:resolve',
  'health:read', 'analytics:read',
  'notifications:read', 'notifications:write',
  'integrations:read', 'integrations:write',
  'audit:read', 'settings:read', 'settings:write', 'roles:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type Role = 'super_admin' | 'operations' | 'finance' | 'support';
