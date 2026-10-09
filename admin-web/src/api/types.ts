/** TypeScript mirror of the Admin API payloads (see docs/API.md). Timestamps are epoch ms. */
import type { Permission, Role } from '@/domain/permissions';

export type { Permission, Role };

export type Page<T, S = undefined> = { items: T[]; total: number; limit: number; offset: number } & (S extends undefined ? object : { summary: S });

// ------------------------------------------------------------------------------ shared ----
export type Confidence = 'live' | 'estimated' | 'user' | 'manual' | 'unknown';
export type AppTrust = 'live' | 'estimated' | 'user' | 'unknown';
export type ConnectorStatus = 'available' | 'occupied' | 'offline' | 'maintenance' | 'unknown';
export type StationStatus = ConnectorStatus;
export type ConnectorType = 'CCS2' | 'Type2' | 'CHAdeMO' | 'GBT' | 'LECCS';
export type IntegrationMethod = 'api' | 'ocpp' | 'ocpi' | 'manual';
export type SessionMode = 'integrated' | 'external';
export type Publication = 'draft' | 'live' | 'hidden';
export type Amenity = 'restroom' | 'cafe' | 'food' | 'shopping' | 'parking' | 'wifi' | 'lounge' | 'shade' | 'open_24x7';

// --------------------------------------------------------------------------------- auth ----
export interface Principal { uid: string; email: string | null; name: string; role: Role; roleLabel: string; permissions: Permission[] }
export interface SessionInfo { principal: Principal; idleTimeoutMinutes: number; featureFlags: Record<string, boolean> }
export interface Meta {
  name: string; version: string; environment: string; dataMode: 'demo' | 'live'; store: string;
  auth: { firebase: boolean; devAuth: boolean }; paymentGateway: { name: string; simulated: boolean };
}
export interface DevRole { role: Role; roleLabel: string; name: string }

// ------------------------------------------------------------------------------ partners ---
export type PartnerStatus = 'draft' | 'pending_review' | 'active' | 'rejected' | 'suspended';
export type CommercialModel = 'revenue_share' | 'flat_fee_per_kwh' | 'listing_only';
export interface Partner {
  id: string; name: string; legalName: string; displayName: string | null; contactName: string; phone: string; email: string;
  pan: string; gstin: string | null; payoutReference: string | null; payoutReferenceMasked: string | null;
  /** True when the API masked PAN, GSTIN and the payout reference because the caller may not see them. */
  taxIdsMasked: boolean;
  commercialModel: CommercialModel; commissionPercent: number | null; flatFeePerKwh: number | null; commissionPlanId: string | null;
  integrationMethod: IntegrationMethod; notes: string | null; status: PartnerStatus; statusReason?: string | null;
  verification: { panVerified: boolean; gstinVerified: boolean; reviewedBy: string | null; reviewedAt: number | null; rejectionReason: string | null };
  stationCount: number; liveStationCount: number; isDemo?: boolean; version: number; createdAt: number; updatedAt: number;
}
export type PartnerInput = Pick<Partner, 'legalName' | 'displayName' | 'contactName' | 'phone' | 'email' | 'pan' | 'gstin' | 'payoutReference' | 'commercialModel' | 'commissionPercent' | 'flatFeePerKwh' | 'commissionPlanId' | 'integrationMethod' | 'notes'>;

// ------------------------------------------------------------------------------ stations ----
export interface Counts { available: number; occupied: number; offline: number; maintenance: number; unknown: number; total: number }
export interface Station {
  id: string; name: string; partnerId: string; partnerName: string; partnerStatus: PartnerStatus | null;
  address: string; city: string; state: string; latitude: number; longitude: number; hours: string;
  accessInstructions: string | null; photos: string[]; amenities: Amenity[]; parkingInfo: string | null;
  sessionMode: SessionMode; integrationMethod: IntegrationMethod; operatorInstructions: string | null;
  verification: 'unverified' | 'pending' | 'verified'; publication: Publication; visibleInApp: boolean; mergedInto?: string;
  connectorCount: number; status: StationStatus; confidence: Confidence; appTrust: AppTrust; stale: boolean; counts: Counts;
  lastUpdatedAt: number | null; reliabilityPct: number | null; openIssues: number; needsReview: boolean;
  connectorTypes: ConnectorType[]; maxPowerKw: number; version: number; createdAt: number; updatedAt: number; isDemo?: boolean;
}
export interface Readiness { ready: boolean; checks: { id: string; label: string; ok: boolean; detail: string | null }[] }
export interface StationDetail extends Station { connectors: Connector[]; readiness: Readiness }
export type StationInput = Pick<Station, 'name' | 'partnerId' | 'address' | 'city' | 'state' | 'latitude' | 'longitude' | 'hours' | 'accessInstructions' | 'photos' | 'amenities' | 'parkingInfo' | 'sessionMode' | 'integrationMethod' | 'operatorInstructions' | 'verification'>;

export interface EffectiveState { status: ConnectorStatus; source: string; updatedAt: number | null; confidence: Confidence; appTrust: AppTrust; stale: boolean; overridden: boolean; heartbeatAgeMs: number | null }
export interface Override { status: ConnectorStatus; reason: string; by: string; byName: string; at: number; expiresAt: number | null }
export interface TariffSnapshot { pricePerKwh: number; pricePerMin: number; pricePerSession: number; parkingFeePerHour: number; idleFeePerMin: number; gstPercent: number; tariffId: string; effectiveFrom: number }
export interface Connector {
  id: string; stationId: string; evseId: string; label: string; chargerId: string; type: ConnectorType; powerKw: number;
  integrationMode: IntegrationMethod; qrCode: string; status: ConnectorStatus; statusSource: string; statusUpdatedAt: number | null;
  lastHeartbeatAt: number | null; override: Override | null; effective: EffectiveState; tariff: TariffSnapshot | null;
  sessions30d: number; failedSessions30d: number; uptimePct: number | null; version: number;
}
export type ConnectorInput = Pick<Connector, 'evseId' | 'label' | 'chargerId' | 'type' | 'powerKw' | 'integrationMode'>;

export interface Tariff {
  id: string; stationId: string; connectorId: string | null; pricePerKwh: number; pricePerMin: number; pricePerSession: number;
  parkingFeePerHour: number; idleFeePerMin: number; gstPercent: number; effectiveFrom: number; reason: string;
  previous: TariffSnapshot | null; createdAt: number; createdBy: string; createdByName: string; state: 'active' | 'scheduled' | 'superseded' | 'cancelled';
}
export interface TariffHistory { items: Tariff[]; current: Record<string, TariffSnapshot | null>; stationWide: TariffSnapshot | null }
export interface TariffInput { connectorId: string | null; pricePerKwh: number; pricePerMin: number; pricePerSession: number; parkingFeePerHour: number; idleFeePerMin: number; gstPercent: number; effectiveFrom: number | null; reason: string; confirmLargeChange?: boolean }

export interface MapStation {
  id: string; name: string; city: string; state: string; latitude: number; longitude: number; partnerId: string; partnerName: string;
  publication: Publication; status: StationStatus; confidence: Confidence; stale: boolean; counts: Counts; lastUpdatedAt: number | null;
  integrationMethod: IntegrationMethod; sessionMode: SessionMode; reliabilityPct: number | null; connectorTypes: ConnectorType[]; maxPowerKw: number;
  connectors: { label: string; type: ConnectorType; powerKw: number; status: ConnectorStatus }[];
}

// --------------------------------------------------------------------------- transactions ---
export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'refunded' | 'partially_refunded' | 'external';
export interface PaymentEvent { id: string; type: 'preauth' | 'capture' | 'release' | 'refund' | 'failure'; amount: number; at: number; ref: string | null; note?: string; reason?: string; actorName?: string; simulated?: boolean }
export interface SessionRow {
  id: string; stationId: string; stationName: string; partnerId: string | null; connectorId: string; connectorLabel: string; connectorType: ConnectorType;
  powerKw: number; energyKwh: number; durationMin: number; grossAmount: number; refundedAmount: number; paymentMethod: string; paymentStatus: PaymentStatus;
  integrationMode: SessionMode; startedAt: number; endedAt: number | null; userId: string; userName: string; userPhone: string | null; userEmail: string | null;
}
export interface SessionSummary { count: number; gross: number; paid: number; pending: number; failed: number; refunded: number; external: number }
export interface AuditEntry {
  id: string; seq: number; at: number; actor: { uid: string; email: string | null; name: string; role: string }; action: string; actionLabel: string; category: string;
  entityType: string; entityId: string; entityLabel: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  reason: string | null; source: string; requestId: string; prevHash: string; hash: string;
}
export interface SessionDetail extends SessionRow {
  vehicle: { make: string; model: string } | null; tariff: Record<string, number | string | null> | null; breakdown: { energy: number; time: number; session: number; idle: number; parking: number; subtotal: number; tax: number; gross: number } | null;
  gateway: { name: string; reference: string } | null; paymentEvents: PaymentEvent[]; preauthAmount: number | null; capturedAmount: number; releasedAmount: number;
  failureReason: string | null; stationCity: string | null; refundableAmount: number; refundSupported: boolean; gatewaySimulated: boolean; settlementId: string | null;
  tickets: { id: string; subject: string; status: TicketStatus }[]; audit: AuditEntry[];
}

// ---------------------------------------------------------------------------- settlements ---
export type SettlementStatus = 'in_review' | 'approved' | 'paid' | 'on_hold';
export interface Settlement {
  id: string; partnerId: string; partnerName: string; periodStart: number; periodEnd: number; sessionCount: number; grossValue: number; refunds: number;
  fee: number; taxes: number; adjustments: number; netPayable: number; status: SettlementStatus; payoutReference: string | null; terms: { model: CommercialModel; commissionPercent: number | null; flatFeePerKwh: number | null };
  excludedExternal: { count: number; value: number }; adjustmentLines: { id: string; label: string; amount: number; reason: string; byName: string; at: number }[];
  createdAt: number; createdByName: string; approvedByName?: string; approvedAt?: number; paidAt?: number; holdReason?: string | null; taxNote?: string;
}
export interface SettlementSummary { payable: number; paid: number; onHold: number; awaitingApproval: number }
export interface SettlementDetail extends Settlement { sessions: { id: string; stationName: string; endedAt: number | null; gross: number; refunded: number; energyKwh: number }[]; audit: AuditEntry[] }

// ------------------------------------------------------------------------------- support ----
export type TicketStatus = 'open' | 'in_review' | 'waiting_user' | 'waiting_partner' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketCategory = 'charging_issue' | 'payment_issue' | 'charger_offline' | 'broken_connector' | 'wrong_pricing' | 'access_blocked' | 'location_problem' | 'refund_dispute' | 'other';
export interface Ticket {
  id: string; category: TicketCategory; categoryLabel: string; priority: TicketPriority; status: TicketStatus; subject: string; description?: string | null;
  sessionId: string | null; stationId: string | null; stationName: string | null; userId: string | null; userName: string | null; userPhone: string | null; userEmail: string | null;
  ownerId: string | null; ownerName: string | null; noteCount: number; slaDueAt: number | null; slaBreached: boolean; createdAt: number; updatedAt: number; resolvedAt: number | null; version: number;
  notes?: { id: string; body: string; byName: string; at: number; internal: boolean }[];
}
export interface TicketSummary { open: number; urgent: number; breached: number; unassigned: number }

// --------------------------------------------------------------------------------- users ----
export interface UserRow {
  id: string; displayName: string; phoneMasked: string | null; emailMasked: string | null; vehicles: { id: string; label: string; connector: string }[];
  status: 'active' | 'restricted'; restriction: { reason: string; by: string; byName: string; at: number } | null; sessionCount: number; spend: number;
  unpaidIntegratedSessions: number; lastSessionAt: number | null; openTickets: number; createdAt: number | null;
}
export interface UserDetail extends UserRow {
  restrictionHistory: { action: string; reason: string; byName: string; at: number }[];
  recentSessions: { id: string; stationName: string; startedAt: number; grossAmount: number; paymentStatus: PaymentStatus; integrationMode: SessionMode }[];
  tickets: { id: string; subject: string; status: TicketStatus; priority: TicketPriority }[];
}

// --------------------------------------------------------------------------- data quality ---
export type DqType = 'stale_status' | 'no_fresh_feed' | 'wrong_pricing' | 'duplicate_station' | 'missing_connector_data' | 'conflicting_sources' | 'user_fault_report';
export interface DqIssue {
  id: string; type: DqType; typeLabel: string; severity: 'critical' | 'warning' | 'info'; stationId: string; stationName: string; title: string; detail: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed'; connectorId?: string; relatedStationId?: string; detectedAt: number; lastSeenAt: number; resolvedAt?: number;
  resolution?: { action: string; byName?: string; at: number; reason: string } | null;
}
export interface DqSummary { freshPct: number | null; liveStations: number; openIssues: number; critical: number; byType: { type: DqType; label: string; count: number }[]; lastScan: { at: number; result: Record<string, number> } | null; thresholds: { liveSec: number; staleSec: number } }
export type DqActionName = 'mark_verified' | 'downgrade_confidence' | 'hide_station' | 'dismiss' | 'mark_reviewed';

// ---------------------------------------------------------------------------- charger health -
export type Severity = 'healthy' | 'warning' | 'critical';
export interface HealthRow {
  connectorId: string; label: string; type: ConnectorType; powerKw: number; stationId: string; stationName: string; city: string; partnerId: string; partnerName: string;
  status: ConnectorStatus; confidence: Confidence; statusSource: string; integrationMode: IntegrationMethod; lastHeartbeatAt: number | null; heartbeatAgeMs: number | null;
  faultRatePct: number | null; faults30d: number; sessions30d: number; uptimePct: number | null; repeatedFailures: number; severity: Severity; reasons: string[]; overridden: boolean;
}
export interface HealthSummary { total: number; onlinePct: number | null; offline: number; maintenance: number; critical: number; warning: number; integrationUptimePct: number | null; byMethod: { method: IntegrationMethod; connectors: number; online: number }[]; generatedAt: number }

// -------------------------------------------------------------------------- integrations ----
export interface IntegrationItem {
  key: string; group: string; name: string; desc: string; hint: string; secretNames: string[]; connection: 'connected' | 'disconnected' | 'not_configured' | 'unknown' | 'later';
  health: 'healthy' | 'degraded' | 'down' | 'unknown'; mode: 'live' | 'derived' | 'simulated' | 'client' | 'not_wired'; lastSyncAt: number | null; error: string | null; detail: string;
  enabled: boolean; settings: Record<string, string>; notes: string | null; lastTestAt: number | null; lastTestOk: boolean | null;
}
export interface IntegrationsResponse { items: IntegrationItem[]; groups: { name: string; items: IntegrationItem[] }[]; gateway: { name: string; simulated: boolean } }
export interface IntegrationTest { key: string; ok: boolean; mode: string; connection: string; health: string; message: string }

// ---------------------------------------------------------------------------- notifications --
export type NotificationKind = 'service_message' | 'charger_outage' | 'payment' | 'support' | 'route_alert' | 'faq' | 'banner';
export interface NotificationItem {
  id: string; kind: NotificationKind; title: string; body: string; channels: ('in_app' | 'push' | 'email' | 'sms')[]; audience: string; stationId: string | null;
  startsAt: number | null; endsAt: number | null; status: 'draft' | 'published' | 'archived'; publishedAt?: number | null; deliveryNote: string | null; version: number; updatedAt: number; createdAt: number;
}
export interface NotificationsPage extends Page<NotificationItem> { marketing: { enabled: boolean; note: string } }
export type NotificationInput = Pick<NotificationItem, 'kind' | 'title' | 'body' | 'channels' | 'audience' | 'stationId' | 'startsAt' | 'endsAt'>;

// ---------------------------------------------------------------------------------- config --
export interface CommissionPlan { id: string; name: string; model: CommercialModel; commissionPercent: number | null; flatFeePerKwh: number | null; note: string | null }
export interface PlatformConfig {
  liveMaxAgeSec: number; staleAfterSec: number; minRouteBatteryReservePct: number; adminIdleTimeoutMinutes: number; platformFeeGstPercent: number; settlementMakerChecker: boolean;
  rankingWeights: Record<string, Record<string, number>>; featureFlags: Record<string, boolean>; commissionPlans: CommissionPlan[];
  featureCatalog: Record<string, { label: string; phase: number; built: boolean }>; version: number;
}
export interface AdminRow { id: string; email: string | null; name: string | null; role: Role; roleLabel: string; status: 'active' | 'invited' | 'disabled'; lastLoginAt: number | null; createdAt: number | null; invitedBy: string | null }
export interface RoleInfo { role: Role; label: string; summary: string; permissions: Permission[] }

// ------------------------------------------------------------------- overview / analytics ---
export interface Overview {
  generatedAt: number;
  kpis: { liveStations: number; totalStations: number; onlineStations: number; sessions7d: number; sessionsChangePct: number | null; gmv7d: number; gmvChangePct: number | null; openIssues: number; openTickets: number; openDataIssues: number; highPriority: number };
  trend: { date: string; sessions: number }[];
  health: { liveFeedsPct: number | null; paymentSuccessPct: number | null; stationDataFreshPct: number | null; offlineStations: number };
  attention: { kind: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; href: string }[];
  recentActivity: AuditEntry[];
}
export interface AnalyticsKpis {
  attemptedSessions: number; successfulSessions: number; gmv: number; refundCount: number; refundValue: number; activeUsers: number; repeatUsers: number;
  paymentFailureRatePct: number | null; faultRatePct: number | null; revenuePerSession: number | null; energyKwh: number;
  platformRevenue: number; stationUtilisationPct: number | null; partnerRetentionPct: number | null; stationsLive: number;
}
export interface Analytics {
  range: string; days: number; generatedAt: number; kpis: AnalyticsKpis; previous: Partial<AnalyticsKpis>; previousComplete: boolean; series: { date: string; sessions: number; gmv: number }[];
  byPartner: { partnerId: string; partnerName: string; sessions: number; gmv: number; failed: number }[]; byConnectorType: { type: string; sessions: number }[];
  unavailable: { id: string; label: string; reason: string }[];
}
export interface Lookups { partners: { id: string; name: string; status: PartnerStatus }[]; cities: string[]; stations: { id: string; name: string }[]; admins: { id: string; name: string; role: Role }[] }
