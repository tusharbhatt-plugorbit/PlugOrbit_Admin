import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { IconName } from '@/ui/Icon';
import type { Permission } from '@/domain/permissions';

type Page = LazyExoticComponent<ComponentType>;

export interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  /** The caller needs this permission to see the item and open the page. */
  permission: Permission;
  /** Phase-gated modules are hidden (and their route refuses) until the feature flag is on. */
  flag?: string;
  subtitle: string;
  page: Page;
}

// Pages are code-split: an admin only downloads the screens they open.
const Overview = lazy(() => import('@/features/overview/OverviewPage'));
const Partners = lazy(() => import('@/features/partners/PartnersPage'));
const Stations = lazy(() => import('@/features/stations/StationsPage'));
const NetworkMap = lazy(() => import('@/features/map/MapPage'));
const Transactions = lazy(() => import('@/features/transactions/TransactionsPage'));
const Settlements = lazy(() => import('@/features/settlements/SettlementsPage'));
const Support = lazy(() => import('@/features/support/SupportPage'));
const Users = lazy(() => import('@/features/users/UsersPage'));
const DataQuality = lazy(() => import('@/features/dataQuality/DataQualityPage'));
const ChargerHealth = lazy(() => import('@/features/chargerHealth/ChargerHealthPage'));
const Analytics = lazy(() => import('@/features/analytics/AnalyticsPage'));
const Notifications = lazy(() => import('@/features/notifications/NotificationsPage'));
const Integrations = lazy(() => import('@/features/integrations/IntegrationsPage'));
const AuditLog = lazy(() => import('@/features/audit/AuditLogPage'));
const Settings = lazy(() => import('@/features/settings/SettingsPage'));

/** The sidebar, in the order from the brief. Keep navigation simple: 15 destinations, no nesting. */
export const NAV: readonly NavItem[] = [
  { path: '/', label: 'Overview', icon: 'dashboard', permission: 'overview:read', subtitle: 'What needs attention right now', page: Overview },
  { path: '/partners', label: 'Partners', icon: 'handshake', permission: 'partners:read', subtitle: 'Internal partner records, verification and commercial terms', page: Partners },
  { path: '/stations', label: 'Stations', icon: 'plug', permission: 'stations:read', subtitle: 'Manage every charging location from one place', page: Stations },
  { path: '/map', label: 'Map', icon: 'map', permission: 'stations:read', subtitle: 'See all PlugOrbit stations and their live status', page: NetworkMap },
  { path: '/transactions', label: 'Transactions', icon: 'receipt-text', permission: 'transactions:read', subtitle: 'Charging sessions and payments', page: Transactions },
  { path: '/settlements', label: 'Settlements', icon: 'wallet', permission: 'settlements:read', subtitle: 'Review and pay what partners are owed', page: Settlements },
  { path: '/support', label: 'Support', icon: 'lifebuoy', permission: 'support:read', subtitle: 'Tickets and issue management', page: Support },
  { path: '/users', label: 'Users', icon: 'users', permission: 'users:read', subtitle: 'Driver accounts, with personal data minimised', page: Users },
  { path: '/data-quality', label: 'Data Quality', icon: 'shield', permission: 'dataquality:read', subtitle: 'Find and fix data the app should not trust', page: DataQuality },
  { path: '/charger-health', label: 'Charger Health', icon: 'activity', permission: 'health:read', subtitle: 'Heartbeats, fault rates and integration uptime', page: ChargerHealth },
  { path: '/analytics', label: 'Analytics', icon: 'chart', permission: 'analytics:read', flag: 'analytics', subtitle: 'Sessions, revenue and reliability (Phase 2)', page: Analytics },
  { path: '/notifications', label: 'Notifications', icon: 'megaphone', permission: 'notifications:read', flag: 'notifications', subtitle: 'Service messages and charger outage notices (Phase 2)', page: Notifications },
  { path: '/integrations', label: 'Integrations', icon: 'cable', permission: 'integrations:read', subtitle: 'Charging networks, maps, payments and messaging', page: Integrations },
  { path: '/audit-log', label: 'Audit Log', icon: 'scroll', permission: 'audit:read', subtitle: 'Every sensitive change, traceable and tamper-evident', page: AuditLog },
  { path: '/settings', label: 'Settings', icon: 'settings', permission: 'settings:read', subtitle: 'Roles, rules and platform configuration', page: Settings },
];

// Detail / form routes: reachable from the lists above, not shown in the sidebar.
const PartnerForm = lazy(() => import('@/features/partners/PartnerFormPage'));
const StationForm = lazy(() => import('@/features/stations/StationFormPage'));
const StationDetail = lazy(() => import('@/features/stations/StationDetailPage'));
const TransactionDetail = lazy(() => import('@/features/transactions/TransactionDetailPage'));

export interface ExtraRoute { path: string; permission: Permission; page: Page; /** a NAV path this route belongs under (keeps the sidebar highlight) */ parent: string }

export const EXTRA_ROUTES: readonly ExtraRoute[] = [
  { path: '/partners/new', permission: 'partners:write', page: PartnerForm, parent: '/partners' },
  { path: '/partners/:partnerId', permission: 'partners:read', page: PartnerForm, parent: '/partners' },
  { path: '/stations/new', permission: 'stations:write', page: StationForm, parent: '/stations' },
  { path: '/stations/:stationId/edit', permission: 'stations:write', page: StationForm, parent: '/stations' },
  { path: '/stations/:stationId', permission: 'stations:read', page: StationDetail, parent: '/stations' },
  { path: '/stations/:stationId/:tab', permission: 'stations:read', page: StationDetail, parent: '/stations' },
  { path: '/transactions/:sessionId', permission: 'transactions:read', page: TransactionDetail, parent: '/transactions' },
];

export function navParent(pathname: string): string {
  const hit = [...NAV].sort((a, b) => b.path.length - a.path.length).find((n) => (n.path === '/' ? pathname === '/' : pathname === n.path || pathname.startsWith(`${n.path}/`)));
  return hit?.path ?? '/';
}
