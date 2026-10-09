import type { Confidence, ConnectorStatus, PartnerStatus, PaymentStatus, Publication, SettlementStatus, Severity, TicketPriority, TicketStatus } from '@/api/types';
import {
  CONFIDENCE_TONE, CONNECTOR_STATUS, PARTNER_STATUS, PAYMENT_STATUS, PUBLICATION, SETTLEMENT_STATUS, SEVERITY, TICKET_PRIORITY, TICKET_STATUS, type Tone,
} from '@/domain/labels';
import { CONFIDENCE_LABEL, effectiveConfidence, isStale } from '@/domain/trust';
import { useNow } from '@/hooks/useNow';
import { Icon, type IconName } from './Icon';

export function Pill({ label, tone = 'slate', dot, icon, upper = true }: { label: string; tone?: Tone; dot?: boolean; icon?: IconName; upper?: boolean }) {
  return (
    <span className={`pill pill--${tone} ${upper ? 'pill--upper' : ''}`}>
      {dot && <span className="pill__dot" />}
      {icon && <Icon name={icon} size={12} strokeWidth={2.4} />}
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: ConnectorStatus }) {
  const s = CONNECTOR_STATUS[status];
  return <Pill label={s.label} tone={s.tone} dot={status !== 'maintenance'} icon={status === 'maintenance' ? 'wrench' : undefined} />;
}

/**
 * The one component allowed to print LIVE (same rule as the mobile ConfidenceBadge). The server
 * decides the confidence; this re-checks the timestamp so an old tab or cached payload can never
 * show a stale feed as Live.
 */
export function ConfidenceBadge({ confidence, updatedAt, now, liveMaxAgeMs, staleAfterMs, showStale = true }: {
  confidence: Confidence; updatedAt?: number | null; now?: number; liveMaxAgeMs?: number; staleAfterMs?: number; showStale?: boolean;
}) {
  const tick = useNow(30_000);
  const clock = now ?? tick;
  const shown = updatedAt === undefined ? confidence : effectiveConfidence(confidence, updatedAt, clock, liveMaxAgeMs);
  const stale = showStale && updatedAt !== undefined && shown !== 'manual' && shown !== 'unknown' && isStale(updatedAt, clock, staleAfterMs);
  return (
    <span className="pill-group" aria-label={`Data confidence: ${CONFIDENCE_LABEL[shown]}${stale ? ', stale' : ''}`}>
      <Pill label={CONFIDENCE_LABEL[shown]} tone={CONFIDENCE_TONE[shown]} dot={shown === 'live'} />
      {stale && <Pill label="Stale" tone="amber" icon="clock" />}
    </span>
  );
}

export function PartnerStatusBadge({ status }: { status: PartnerStatus }) {
  const s = PARTNER_STATUS[status];
  return <Pill label={s.label} tone={s.tone} dot />;
}
export function PublicationBadge({ publication }: { publication: Publication }) {
  const s = PUBLICATION[publication];
  return <Pill label={s.label} tone={s.tone} />;
}
export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const s = PAYMENT_STATUS[status];
  return <Pill label={s.label} tone={s.tone} icon={status === 'external' ? 'building' : undefined} />;
}
export function SettlementBadge({ status }: { status: SettlementStatus }) {
  const s = SETTLEMENT_STATUS[status];
  return <Pill label={s.label} tone={s.tone} dot />;
}
export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const s = TICKET_STATUS[status];
  return <Pill label={s.label} tone={s.tone} />;
}
export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const s = TICKET_PRIORITY[priority];
  return <Pill label={s.label} tone={s.tone} />;
}
export function SeverityBadge({ severity }: { severity: Severity | 'info' }) {
  const s = SEVERITY[severity];
  return <Pill label={s.label} tone={s.tone} dot />;
}
