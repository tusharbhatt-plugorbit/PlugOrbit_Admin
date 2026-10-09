import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PaymentEvent, SessionDetail } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { SESSION_MODE } from '@/domain/labels';
import { formatDateTime, formatDuration, formatInr, formatKwh } from '@/domain/format';
import { useResource } from '@/hooks/useResource';
import { adminTransactionService } from '@/services/adminTransactionService';
import { AsyncView, AuditTimeline, Button, Card, CardBody, CardHeader, ConfirmDialog, KeyValue, NumberField, Notice, PageHeader, PaymentBadge, Pill, Segmented, TicketStatusBadge, usePageMeta } from '@/ui';

const EVENT: Record<PaymentEvent['type'], { label: string; dot: string }> = {
  preauth: { label: 'Pre-authorised', dot: 'lime' }, capture: { label: 'Captured', dot: 'lime' }, release: { label: 'Hold released', dot: 'info' },
  refund: { label: 'Refund', dot: 'amber' }, failure: { label: 'Failed', dot: 'danger' },
};

function RefundDialog({ t, open, onClose, onDone }: { t: SessionDetail; open: boolean; onClose: () => void; onDone: (t: SessionDetail) => void }) {
  const [mode, setMode] = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState<number | null>(null);
  // One key per dialog opening: a double-click or a retry after a flaky network can never refund twice.
  const key = useRef(crypto.randomUUID());
  const value = mode === 'full' ? t.refundableAmount : amount ?? 0;
  const valid = value > 0 && value <= t.refundableAmount + 1e-9;
  return (
    <ConfirmDialog open={open} onClose={onClose} title={`Issue a refund for ${t.id}`} tone="danger" confirmLabel={`Refund ${formatInr(value)}`} minReason={3} canConfirm={valid} successMessage="Refund issued"
      reasonHelp="Recorded in the audit log and shown on the transaction."
      body={<>Refunds go back to the original payment method{t.gatewaySimulated ? ' (this demo uses a simulated gateway: no real money moves)' : ''}. You can refund up to <strong>{formatInr(t.refundableAmount)}</strong>.</>}
      extra={<div className="stack">
        <Segmented label="Refund type" value={mode} onChange={setMode} options={[{ value: 'full', label: `Full · ${formatInr(t.refundableAmount)}` }, { value: 'partial', label: 'Partial amount' }]} />
        {mode === 'partial' && <NumberField label="Amount" affix="₹" min={0.01} max={t.refundableAmount} step="0.01" value={amount} onChange={setAmount} error={amount !== null && !valid ? `Enter an amount up to ${formatInr(t.refundableAmount)}` : null} />}
      </div>}
      onConfirm={async (reason) => { onDone(await adminTransactionService.refund(t.id, { amount: mode === 'full' ? undefined : value, reason }, key.current)); key.current = crypto.randomUUID(); }} />
  );
}

function Body({ t, onChanged }: { t: SessionDetail; onChanged: (t: SessionDetail) => void }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [refund, setRefund] = useState(false);
  const external = t.integrationMode === 'external';
  const canRefund = can('refunds:issue');
  const open = t.tickets.filter((x) => x.status !== 'resolved' && x.status !== 'closed');

  return (
    <>
      <PageHeader back={{ to: '/transactions', label: 'All transactions' }}>
        <span className="row row--wrap"><PaymentBadge status={t.paymentStatus} />{external ? <Pill label="Operator-paid" tone="slate" icon="building" /> : <Pill label="Integrated" tone="lime" />}</span>
      </PageHeader>
      {external && <Notice tone="info" title="Paid directly to the operator">This session was started and paid outside PlugOrbit, so there is no payment flow, no refund and no settlement here. Raise issues with the operator.</Notice>}
      {t.failureReason && <Notice tone="danger" title="This session failed">{t.failureReason}</Notice>}

      <div className="grid grid--split-even" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card>
            <CardHeader title="Session" />
            <CardBody>
              <KeyValue label="Station" value={<Link to={`/stations/${t.stationId}`}>{t.stationName}</Link>} />
              <KeyValue label="User" value={<span>{t.userPhone} · {t.userName}</span>} />
              <KeyValue label="Vehicle" value={t.vehicle ? `${t.vehicle.make} ${t.vehicle.model}` : '—'} />
              <KeyValue label="Connector" value={`${t.connectorLabel} · ${t.connectorType} · ${t.powerKw} kW`} />
              <KeyValue label="Started" value={formatDateTime(t.startedAt, true)} />
              <KeyValue label="Ended" value={formatDateTime(t.endedAt, true)} />
              <KeyValue label="Energy delivered" value={formatKwh(t.energyKwh)} />
              <KeyValue label="Duration" value={formatDuration(t.durationMin)} />
              <KeyValue label="Integration" value={SESSION_MODE[t.integrationMode]} />
              <KeyValue label="Gross amount" value={formatInr(t.grossAmount)} emphasis />
              <KeyValue label="Gateway reference" value={t.gateway ? <span className="mono">{t.gateway.reference}</span> : '—'} />
              <KeyValue label="Payment method" value={t.paymentMethod} />
            </CardBody>
          </Card>
          {t.breakdown && (
            <Card>
              <CardHeader title="Tariff & price" subtitle={t.tariff ? `₹${t.tariff.pricePerKwh}/kWh at the time of the session` : undefined} />
              <CardBody>
                <KeyValue label="Energy" value={formatInr(t.breakdown.energy)} />
                {t.breakdown.time > 0 && <KeyValue label="Time" value={formatInr(t.breakdown.time)} />}
                {t.breakdown.session > 0 && <KeyValue label="Session fee" value={formatInr(t.breakdown.session)} />}
                {t.breakdown.idle > 0 && <KeyValue label="Idle fee" value={formatInr(t.breakdown.idle)} />}
                {t.breakdown.parking > 0 && <KeyValue label="Parking" value={formatInr(t.breakdown.parking)} />}
                <KeyValue label="Subtotal" value={formatInr(t.breakdown.subtotal)} />
                <KeyValue label="GST / taxes" value={formatInr(t.breakdown.tax)} />
              </CardBody>
            </Card>
          )}
        </div>

        <div className="stack">
          <Card>
            <CardHeader title="Payment flow" subtitle={external ? 'Not handled by PlugOrbit' : 'Pre-authorisation, capture, release and refunds'} />
            <CardBody>
              {t.paymentEvents.length === 0 ? <p className="muted">No payment events{external ? ': the operator collected payment.' : ' yet.'}</p> : (
                <ol className="timeline" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {t.paymentEvents.map((e) => (
                    <li key={e.id} className="timeline__item">
                      <span className={`timeline__dot timeline__dot--${EVENT[e.type].dot}`} />
                      <div className="timeline__main">
                        <div className="timeline__title"><span>{EVENT[e.type].label}</span><span className="num">{e.type === 'failure' ? '—' : formatInr(e.amount)}</span></div>
                        <div className="timeline__meta">{formatDateTime(e.at, true)}{e.ref ? <> · <span className="mono">{e.ref}</span></> : null}{e.simulated ? ' · simulated' : ''}</div>
                        {(e.reason || e.note) && <div style={{ marginTop: 3 }}>“{e.reason ?? e.note}”{e.actorName ? ` (${e.actorName})` : ''}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>

          <Card tone={t.paymentStatus === 'failed' || t.paymentStatus === 'pending' ? 'warn' : 'lime'} pad>
            <h2 className="card__title">Reconciliation</h2>
            <div className="stack stack--sm" style={{ marginTop: 8 }}>
              {external ? <span>Operator collected payment. Not settled by PlugOrbit.</span> : (
                <>
                  <span><strong>Gateway:</strong> {t.paymentStatus === 'paid' || t.paymentStatus.endsWith('refunded') ? 'matched' : t.paymentStatus === 'pending' ? 'capture pending' : 'no capture (failed)'}</span>
                  <span><strong>Partner payable:</strong> {t.settlementId ? <>included in <code className="mono">{t.settlementId}</code></> : t.paymentStatus === 'paid' ? 'not settled yet' : 'not applicable'}</span>
                  {t.refundedAmount > 0 && <span><strong>Refunded:</strong> {formatInr(t.refundedAmount)} of {formatInr(t.capturedAmount)}</span>}
                </>
              )}
            </div>
            {canRefund && !external && (
              <div className="row row--wrap" style={{ marginTop: 14 }}>
                <Button variant="secondary" label="Issue full refund" disabled={!t.refundSupported || t.refundableAmount <= 0} onClick={() => setRefund(true)} />
                <Button variant="secondary" label="Issue partial refund" disabled={!t.refundSupported || t.refundableAmount <= 0} onClick={() => setRefund(true)} />
              </div>
            )}
            {canRefund && !external && !t.refundSupported && <p className="caption" style={{ marginTop: 8 }}>Refunds are unavailable: no payment gateway is connected.</p>}
            {canRefund && !external && t.refundSupported && t.refundableAmount <= 0 && <p className="caption" style={{ marginTop: 8 }}>Nothing left to refund on this session.</p>}
            {!canRefund && !external && <p className="caption" style={{ marginTop: 8 }}>Only Finance and Super Admin can issue refunds. Open a ticket to request one.</p>}
          </Card>

          <Card>
            <CardHeader title="Related" />
            <CardBody>
              <div className="stack stack--sm">
                {t.tickets.length > 0 ? t.tickets.map((x) => <Link key={x.id} to={`/support?ticket=${x.id}`} className="row row--between" style={{ color: 'inherit' }}><span><span className="strong">{x.id}</span> {x.subject}</span><TicketStatusBadge status={x.status} /></Link>) : <span className="muted">No linked support tickets.</span>}
                <div className="row row--wrap" style={{ marginTop: 6 }}>
                  {can('support:write') && <Button small variant="secondary" icon="lifebuoy" label={open.length ? 'Open another ticket' : 'Open linked ticket'} onClick={() => navigate(`/support?new=1&session=${t.id}`)} />}
                  {can('users:read') && <Button small variant="secondary" icon="user" label="Open user" onClick={() => navigate(`/users?user=${t.userId}`)} />}
                  <Button small variant="secondary" icon="plug" label="Open station" onClick={() => navigate(`/stations/${t.stationId}`)} />
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {can('audit:read') && (
        <Card>
          <CardHeader title="Audit trail" subtitle="Refunds and other actions on this session" />
          <CardBody>{t.audit.length === 0 ? <p className="muted">No admin actions have been taken on this session.</p> : <AuditTimeline entries={t.audit} showEntity={false} />}</CardBody>
        </Card>
      )}
      <RefundDialog t={t} open={refund} onClose={() => setRefund(false)} onDone={onChanged} />
    </>
  );
}

export default function TransactionDetailPage() {
  const { sessionId = '' } = useParams();
  const resource = useResource((s) => adminTransactionService.get(sessionId, s), [sessionId]);
  usePageMeta(`Transaction ${sessionId}`, resource.data ? (resource.data.integrationMode === 'integrated' ? 'Integrated charging session' : 'Operator-paid charging session') : undefined);
  return <AsyncView resource={resource} skeleton="detail">{(t) => <Body t={t} onChanged={(next) => resource.set(next)} />}</AsyncView>;
}
