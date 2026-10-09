/** Human labels and badge tones for every status in the product, in one place. Tones follow the
 *  mobile Badges component: lime = good/live, amber = busy/estimated, info = a person is involved,
 *  danger = broken, slate = unknown, dark = admin-set. */
import type {
  ConnectorStatus, ConnectorType, Confidence, DqType, IntegrationMethod, PartnerStatus, PaymentStatus, Publication, SessionMode,
  SettlementStatus, Severity, TicketCategory, TicketPriority, TicketStatus,
} from '@/api/types';

export type Tone = 'lime' | 'amber' | 'info' | 'slate' | 'danger' | 'dark';

export const CONNECTOR_STATUS: Record<ConnectorStatus, { label: string; tone: Tone }> = {
  available: { label: 'Available', tone: 'lime' },
  occupied: { label: 'Occupied', tone: 'amber' },
  offline: { label: 'Offline', tone: 'danger' },
  maintenance: { label: 'Maintenance', tone: 'slate' },
  unknown: { label: 'Unknown', tone: 'slate' },
};

export const CONFIDENCE_TONE: Record<Confidence, Tone> = { live: 'lime', estimated: 'amber', user: 'info', manual: 'dark', unknown: 'slate' };

export const PARTNER_STATUS: Record<PartnerStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'slate' },
  pending_review: { label: 'Pending review', tone: 'info' },
  active: { label: 'Active', tone: 'lime' },
  rejected: { label: 'Rejected', tone: 'danger' },
  suspended: { label: 'Suspended', tone: 'amber' },
};

export const PUBLICATION: Record<Publication, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'slate' },
  live: { label: 'Live in app', tone: 'lime' },
  hidden: { label: 'Hidden', tone: 'amber' },
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  paid: { label: 'Paid', tone: 'lime' },
  pending: { label: 'Pending', tone: 'amber' },
  failed: { label: 'Failed', tone: 'danger' },
  refunded: { label: 'Refunded', tone: 'info' },
  partially_refunded: { label: 'Part refunded', tone: 'info' },
  external: { label: 'Operator-paid', tone: 'slate' },
};

export const SETTLEMENT_STATUS: Record<SettlementStatus, { label: string; tone: Tone }> = {
  in_review: { label: 'In review', tone: 'info' },
  approved: { label: 'Approved', tone: 'amber' },
  paid: { label: 'Paid', tone: 'lime' },
  on_hold: { label: 'On hold', tone: 'danger' },
};

export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'danger' },
  in_review: { label: 'In review', tone: 'amber' },
  waiting_user: { label: 'Waiting for user', tone: 'info' },
  waiting_partner: { label: 'Waiting for partner', tone: 'info' },
  resolved: { label: 'Resolved', tone: 'lime' },
  closed: { label: 'Closed', tone: 'slate' },
};

export const TICKET_PRIORITY: Record<TicketPriority, { label: string; tone: Tone }> = {
  urgent: { label: 'Urgent', tone: 'danger' },
  high: { label: 'High', tone: 'amber' },
  medium: { label: 'Medium', tone: 'info' },
  low: { label: 'Low', tone: 'slate' },
};

export const TICKET_CATEGORY: Record<TicketCategory, string> = {
  charging_issue: 'Charging issue', payment_issue: 'Payment issue', charger_offline: 'Charger offline', broken_connector: 'Broken connector',
  wrong_pricing: 'Wrong pricing', access_blocked: 'Access blocked', location_problem: 'Location problem', refund_dispute: 'Refund / dispute', other: 'Other',
};

export const SEVERITY: Record<Severity | 'info', { label: string; tone: Tone }> = {
  critical: { label: 'Critical', tone: 'danger' },
  warning: { label: 'Warning', tone: 'amber' },
  healthy: { label: 'Healthy', tone: 'lime' },
  info: { label: 'Info', tone: 'info' },
};

export const INTEGRATION_METHOD: Record<IntegrationMethod, string> = { api: 'API', ocpp: 'OCPP', ocpi: 'OCPI', manual: 'Manual' };
export const SESSION_MODE: Record<SessionMode, string> = { integrated: 'Integrated', external: 'External (operator-paid)' };
export const CONNECTOR_TYPE: Record<ConnectorType, string> = { CCS2: 'CCS2', Type2: 'Type 2 (AC)', CHAdeMO: 'CHAdeMO', GBT: 'GB/T', LECCS: 'LECCS' };

export const COMMERCIAL_MODEL: Record<string, string> = { revenue_share: 'Revenue share', flat_fee_per_kwh: 'Flat fee per kWh', listing_only: 'Listing only' };

export const DQ_TYPE: Record<DqType, string> = {
  stale_status: 'Stale charger status', no_fresh_feed: 'No fresh feed', wrong_pricing: 'Wrong pricing', duplicate_station: 'Duplicate station',
  missing_connector_data: 'Missing connector data', conflicting_sources: 'Conflicting sources', user_fault_report: 'User fault reports',
};

/** The mobile app's `Amenity` ids, with the admin-facing wording from the brief (restroom shows as Washroom). */
export const AMENITY: Record<string, string> = {
  restroom: 'Washroom', cafe: 'Café', food: 'Food', shopping: 'Shopping', parking: 'Parking', wifi: 'Wi-Fi', lounge: 'Lounge', shade: 'Shade', open_24x7: '24×7',
};

export const REVIEW_STATE: Record<string, string> = { unverified: 'Unverified', pending: 'Pending', verified: 'Verified' };
