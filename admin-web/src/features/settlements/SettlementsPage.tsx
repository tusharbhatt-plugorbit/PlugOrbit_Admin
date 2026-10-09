import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Settlement, SettlementDetail, SettlementStatus } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, formatDateTime, formatInr, formatInrCompact } from '@/domain/format';
import { useResource } from '@/hooks/useResource';
import { useUrlState } from '@/hooks/useUrlState';
import { adminConfigService } from '@/services/adminConfigService';
import { adminSettlementService } from '@/services/adminSettlementService';
import { AsyncView, AuditTimeline, Button, Card, ConfirmDialog, DataTable, Dialog, Drawer, EmptyState, FilterBar, FilterSelect, KeyValue, KpiCard, NoResults, Notice, NumberField, Chip, SettlementBadge, TextField, useToast, usePageMeta, type Column } from '@/ui';
import { useSave } from '../common/useSave';

const CHIPS: [SettlementStatus | '', string][] = [['', 'All'], ['in_review', 'In review'], ['approved', 'Approved'], ['paid', 'Paid'], ['on_hold', 'On hold']];
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const localMidnight = (v: string) => new Date(`${v}T00:00:00`).getTime();

function RunDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [start, setStart] = useState(() => day(Date.now() - 30 * 86_400_000));
  const [end, setEnd] = useState(() => day(Date.now()));
  const { saving, formError, run } = useSave();
  const submit = async () => {
    const r = await run(() => adminSettlementService.run({ periodStart: localMidnight(start), periodEnd: localMidnight(end) }));
    if (!r) return;
    toast.success(`${r.created.length} settlement${r.created.length === 1 ? '' : 's'} created${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}`);
    onDone();
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="Run a settlement" footer={<><Button variant="secondary" label="Cancel" onClick={onClose} /><Button label="Calculate settlements" loading={saving} disabled={!start || !end || end <= start} onClick={submit} /></>}>
      <div className="stack">
        <p className="soft">Calculates what each active partner is owed for sessions that ended in this period and have not been settled before. Nothing is paid yet: each result goes to review first.</p>
        <div className="grid grid--2"><TextField label="From (inclusive)" type="date" value={start} onChange={setStart} /><TextField label="To (exclusive)" type="date" value={end} onChange={setEnd} /></div>
        {formError && <Notice tone="danger" title={formError} />}
      </div>
    </Dialog>
  );
}

function Line({ label, value, sign, bold }: { label: string; value: number; sign?: '+' | '−'; bold?: boolean }) {
  return <div className="kv"><div className="kv__label">{label}</div><div className={`kv__value ${bold ? 'kv__value--emph' : ''}`}>{sign ? `${sign} ` : ''}{formatInr(Math.abs(value))}</div></div>;
}

function SettlementDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { can } = useAuth();
  const detail = useResource((s) => adminSettlementService.get(id, s), [id]);
  const cfg = useResource((s) => adminConfigService.get(s), [], { enabled: can('settings:read') });
  const [dialog, setDialog] = useState<'adjust' | 'approve' | 'hold' | 'paid' | null>(null);
  const [adj, setAdj] = useState({ label: '', amount: null as number | null });
  const [utr, setUtr] = useState('');
  const d = detail.data;
  const update = (next: SettlementDetail) => { detail.set(next); onChanged(); };
  const editable = d && (d.status === 'in_review' || d.status === 'on_hold');

  return (
    <Drawer open onClose={onClose} wide title={d ? `${d.partnerName} settlement` : 'Settlement'} subtitle={d ? `${formatDate(d.periodStart)} – ${formatDate(d.periodEnd - 1)} · ${d.sessionCount} sessions` : undefined}
      footer={d && (
        <>
          {can('settlements:approve') && (d.status === 'in_review' || d.status === 'approved') && <Button variant="ghost-danger" label="Put on hold" onClick={() => setDialog('hold')} />}
          {can('settlements:approve') && d.status === 'on_hold' && <Button variant="secondary" label="Release hold" onClick={() => setDialog('hold')} />}
          {can('settlements:run') && editable && <Button variant="secondary" icon="plus" label="Add adjustment" onClick={() => setDialog('adjust')} />}
          {can('settlements:approve') && d.status === 'in_review' && <Button label="Approve" icon="check" onClick={() => setDialog('approve')} />}
          {can('settlements:pay') && d.status === 'approved' && <Button label="Mark as paid" icon="banknote" onClick={() => setDialog('paid')} />}
        </>
      )}>
      <AsyncView resource={detail} skeleton="detail">
        {(s) => (
          <>
            <Card pad>
              <div className="row row--between"><SettlementBadge status={s.status} /><span className="caption">Created by {s.createdByName} · {formatDateTime(s.createdAt)}</span></div>
              <div style={{ marginTop: 8 }}>
                <Line label="Gross charging value" value={s.grossValue} />
                <Line label="Refunds" value={s.refunds} sign="−" />
                <Line label={`PlugOrbit fee (${s.terms.model === 'revenue_share' ? `${s.terms.commissionPercent ?? 0}%` : s.terms.model === 'flat_fee_per_kwh' ? `₹${s.terms.flatFeePerKwh}/kWh` : 'listing only'})`} value={s.fee} sign="−" />
                <Line label={`GST on fee (${cfg.data?.platformFeeGstPercent ?? 18}%)`} value={s.taxes} sign="−" />
                <Line label="Adjustments" value={s.adjustments} sign={s.adjustments < 0 ? '−' : '+'} />
                <Line label="Net payable" value={s.netPayable} bold />
              </div>
              {s.payoutReference && <KeyValue label="Payout reference" value={<span className="mono">{s.payoutReference}</span>} />}
              {s.holdReason && s.status === 'on_hold' && <KeyValue label="Hold reason" value={s.holdReason} />}
              {s.approvedByName && <KeyValue label="Approved by" value={`${s.approvedByName}${s.approvedAt ? ` · ${formatDateTime(s.approvedAt)}` : ''}`} />}
            </Card>
            {s.excludedExternal.count > 0 && <Notice tone="info" title={`${s.excludedExternal.count} operator-paid session${s.excludedExternal.count > 1 ? 's' : ''} not included`}>{formatInr(s.excludedExternal.value)} was paid directly to the operator, so PlugOrbit does not settle it.</Notice>}
            <Notice tone="warn" title="Tax treatment is pending finance sign-off">{s.taxNote ?? 'GST is calculated on the PlugOrbit fee only.'} Have your CA confirm this before the first real payout.</Notice>
            {s.adjustmentLines.length > 0 && (
              <Card pad><h3 className="section-title">Adjustments</h3>{s.adjustmentLines.map((a) => <div key={a.id} className="kv"><div><div className="strong">{a.label}</div><div className="caption">{a.reason} · {a.byName}</div></div><div className="kv__value">{a.amount < 0 ? '−' : '+'} {formatInr(Math.abs(a.amount))}</div></div>)}</Card>
            )}
            <Card pad>
              <h3 className="section-title">Sessions included ({s.sessionCount})</h3>
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>{s.sessions.map((x) => <Link key={x.id} to={`/transactions/${x.id}`} className="kv" style={{ color: 'inherit' }}><span><span className="mono">{x.id}</span> <span className="muted">{x.stationName}</span></span><span className="kv__value">{formatInr(x.gross - x.refunded)}</span></Link>)}</div>
            </Card>
            {can('audit:read') && s.audit.length > 0 && <Card pad><h3 className="section-title">History</h3><AuditTimeline entries={s.audit} showEntity={false} /></Card>}

            <ConfirmDialog open={dialog === 'adjust'} onClose={() => setDialog(null)} title="Add an adjustment" confirmLabel="Add adjustment" minReason={3} canConfirm={adj.label.trim().length >= 2 && !!adj.amount} successMessage="Adjustment added"
              body="Use a negative amount for a deduction (e.g. −250) and a positive one for a credit."
              extra={<div className="grid grid--2"><TextField label="What is it for?" value={adj.label} onChange={(v) => setAdj((a) => ({ ...a, label: v }))} /><NumberField label="Amount" affix="₹" step="0.01" value={adj.amount} onChange={(v) => setAdj((a) => ({ ...a, amount: v }))} /></div>}
              onConfirm={async (reason) => { update(await adminSettlementService.adjust(s.id, { label: adj.label.trim(), amount: adj.amount!, reason })); setAdj({ label: '', amount: null }); }} />
            <ConfirmDialog open={dialog === 'approve'} onClose={() => setDialog(null)} title="Approve this settlement?" confirmLabel="Approve" successMessage="Settlement approved"
              body={<>You are approving <strong>{formatInr(s.netPayable)}</strong> for {s.partnerName}. {cfg.data?.settlementMakerChecker !== false ? 'The person who ran the settlement cannot approve it (maker-checker).' : ''}</>}
              onConfirm={async () => update(await adminSettlementService.approve(s.id))} />
            <ConfirmDialog open={dialog === 'hold'} onClose={() => setDialog(null)} title={s.status === 'on_hold' ? 'Release the hold?' : 'Put this settlement on hold?'} confirmLabel={s.status === 'on_hold' ? 'Release hold' : 'Put on hold'} tone={s.status === 'on_hold' ? 'primary' : 'danger'} minReason={3} successMessage={s.status === 'on_hold' ? 'Hold released' : 'Settlement on hold'}
              body={s.status === 'on_hold' ? 'It goes back to review.' : 'Nothing is paid while it is on hold.'} onConfirm={async (reason) => update(await adminSettlementService.hold(s.id, reason))} />
            <ConfirmDialog open={dialog === 'paid'} onClose={() => setDialog(null)} title="Mark as paid" confirmLabel={`Mark ${formatInr(s.netPayable)} as paid`} successMessage="Marked as paid" canConfirm={utr.trim().length >= 4}
              body="Do this after the transfer has been made. PlugOrbit does not move the money in Phase 1: it records the payout reference."
              extra={<TextField label="Payout reference (UTR / transaction ID)" required value={utr} onChange={setUtr} help="Never enter a bank account number here." />}
              onConfirm={async () => { update(await adminSettlementService.markPaid(s.id, utr.trim())); setUtr(''); }} />
          </>
        )}
      </AsyncView>
    </Drawer>
  );
}

export default function SettlementsPage() {
  usePageMeta('Settlements', 'Review and pay what partners are owed');
  const { can } = useAuth();
  const [f, setF] = useUrlState({ status: '', partnerId: '', settlement: '' });
  const list = useResource((s) => adminSettlementService.list({ status: f.status, partnerId: f.partnerId }, s), [f.status, f.partnerId]);
  const lookups = useResource((s) => adminConfigService.lookups(s), []);
  const [running, setRunning] = useState(false);
  const sum = list.data?.summary;

  const columns: Column<Settlement>[] = [
    { key: 'partner', header: 'Partner', sortValue: (s) => s.partnerName, render: (s) => <><div className="cell-main">{s.partnerName}</div><div className="cell-sub">{s.sessionCount} sessions</div></> },
    { key: 'period', header: 'Period', sortValue: (s) => s.periodEnd, render: (s) => `${formatDate(s.periodStart)} – ${formatDate(s.periodEnd - 1)}` },
    { key: 'gross', header: 'Gross charging value', align: 'right', sortValue: (s) => s.grossValue, render: (s) => formatInr(s.grossValue) },
    { key: 'fee', header: 'PlugOrbit fee', align: 'right', render: (s) => formatInr(s.fee) },
    { key: 'tax', header: 'Taxes', align: 'right', render: (s) => formatInr(s.taxes) },
    { key: 'ref', header: 'Refunds', align: 'right', render: (s) => (s.refunds ? `−${formatInr(s.refunds)}` : '—') },
    { key: 'adj', header: 'Adjustments', align: 'right', render: (s) => (s.adjustments ? `${s.adjustments < 0 ? '−' : '+'}${formatInr(Math.abs(s.adjustments))}` : '—') },
    { key: 'net', header: 'Net payable', align: 'right', sortValue: (s) => s.netPayable, render: (s) => <span className="strong">{formatInr(s.netPayable)}</span> },
    { key: 'status', header: 'Payout status', sortValue: (s) => s.status, render: (s) => <SettlementBadge status={s.status} /> },
    { key: 'utr', header: 'Payout reference', render: (s) => (s.payoutReference ? <span className="mono">{s.payoutReference}</span> : <span className="muted">—</span>) },
  ];

  return (
    <>
      <div className="grid grid--4">
        <KpiCard label="Payable to partners" value={formatInrCompact(sum?.payable)} note={sum ? `${sum.awaitingApproval} awaiting approval` : ' '} noteTone={sum && sum.awaitingApproval ? 'warn' : 'neutral'} />
        <KpiCard label="Paid" value={formatInrCompact(sum?.paid)} note="Marked paid with a reference" />
        <KpiCard label="On hold" value={formatInrCompact(sum?.onHold)} noteTone="bad" note={sum && sum.onHold > 0 ? 'Needs a decision' : 'Nothing on hold'} />
        <KpiCard label="Awaiting approval" value={sum?.awaitingApproval ?? '—'} note="Maker-checker: a second person approves" />
      </div>
      <FilterBar>
        <div className="chips" role="group" aria-label="Status">{CHIPS.map(([v, l]) => <Chip key={v || 'all'} label={l} selected={f.status === v} onClick={() => setF({ status: v })} />)}</div>
        <div className="filterbar__selects"><FilterSelect label="All partners" value={f.partnerId} onChange={(v) => setF({ partnerId: v })} options={(lookups.data?.partners ?? []).map((p) => ({ value: p.id, label: p.name }))} /></div>
        <span className="grow" />
        {can('settlements:run') && <Button icon="wallet" label="Run settlement" onClick={() => setRunning(true)} />}
      </FilterBar>
      <Notice tone="info" title="Admin-reviewed in Phase 1">Settlements are calculated on request, checked by a person, then marked paid with the payout reference. Automatic scheduled payouts are a Phase 2 feature.</Notice>
      <Card>
        <AsyncView resource={list} isEmpty={(d) => d.items.length === 0}
          empty={f.status || f.partnerId ? <NoResults what="settlements" onClear={() => setF({ status: '', partnerId: '' })} /> : <EmptyState icon="wallet" title="No settlements yet" body="Run a settlement for a period to see what each partner is owed." action={can('settlements:run') && <Button icon="wallet" label="Run settlement" onClick={() => setRunning(true)} />} />}>
          {(d) => <DataTable caption="Settlements" columns={columns} rows={d.items} rowKey={(s) => s.id} selectedKey={f.settlement || null} onRowClick={(s) => setF({ settlement: s.id })} pageSize={20} />}
        </AsyncView>
      </Card>
      {running && <RunDialog onClose={() => setRunning(false)} onDone={list.reload} />}
      {f.settlement && <SettlementDrawer id={f.settlement} onClose={() => setF({ settlement: '' })} onChanged={list.reload} />}
    </>
  );
}
