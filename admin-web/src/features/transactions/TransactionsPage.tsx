import { useNavigate } from 'react-router-dom';
import type { PaymentStatus, SessionRow } from '@/api/types';
import { SESSION_MODE } from '@/domain/labels';
import { formatDateTime, formatDuration, formatInr, formatKwh } from '@/domain/format';
import { useDebounced } from '@/hooks/useDebounced';
import { useResource } from '@/hooks/useResource';
import { useUrlState } from '@/hooks/useUrlState';
import { adminConfigService } from '@/services/adminConfigService';
import { adminTransactionService } from '@/services/adminTransactionService';
import { AsyncView, Card, Chip, DataTable, EmptyState, FilterBar, FilterSelect, NoResults, Notice, PaymentBadge, Pill, SearchField, usePageMeta, type Column } from '@/ui';

const CHIPS: [PaymentStatus | '', string][] = [['', 'All'], ['paid', 'Paid'], ['pending', 'Pending'], ['failed', 'Failed'], ['refunded', 'Refunded'], ['external', 'Operator-paid']];
const RANGES = [['', 'All time'], ['1', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days']] as const;

export default function TransactionsPage() {
  usePageMeta('Transactions', 'Charging sessions and payments');
  const navigate = useNavigate();
  const [f, setF] = useUrlState({ q: '', status: '', mode: '', stationId: '', range: '' });
  const q = useDebounced(f.q);
  const list = useResource((s) => adminTransactionService.list({ q, status: f.status, mode: f.mode, stationId: f.stationId, since: f.range ? Date.now() - Number(f.range) * 86_400_000 : undefined, limit: 200 }, s), [q, f.status, f.mode, f.stationId, f.range]);
  const lookups = useResource((s) => adminConfigService.lookups(s), []);
  const filtered = !!(f.q || f.status || f.mode || f.stationId || f.range);

  const columns: Column<SessionRow>[] = [
    { key: 'id', header: 'Session', sortValue: (r) => r.startedAt, render: (r) => <><div className="cell-main mono">{r.id}</div><div className="cell-sub">{formatDateTime(r.startedAt)}</div></> },
    { key: 'station', header: 'Station', sortValue: (r) => r.stationName, render: (r) => r.stationName },
    { key: 'user', header: 'User', render: (r) => <><div>{r.userPhone ?? '—'}</div><div className="cell-sub">{r.userName}</div></> },
    { key: 'conn', header: 'Connector', render: (r) => `${r.connectorLabel} · ${r.connectorType}` },
    { key: 'kwh', header: 'kWh', align: 'right', sortValue: (r) => r.energyKwh, render: (r) => formatKwh(r.energyKwh) },
    { key: 'dur', header: 'Duration', align: 'right', sortValue: (r) => r.durationMin, render: (r) => formatDuration(r.durationMin) },
    { key: 'gross', header: 'Gross value', align: 'right', sortValue: (r) => r.grossAmount, render: (r) => <><span className="strong">{formatInr(r.grossAmount)}</span>{r.refundedAmount > 0 && <div className="cell-sub">−{formatInr(r.refundedAmount)} refunded</div>}</> },
    { key: 'method', header: 'Payment', render: (r) => r.paymentMethod },
    { key: 'status', header: 'Status', sortValue: (r) => r.paymentStatus, render: (r) => <PaymentBadge status={r.paymentStatus} /> },
    { key: 'mode', header: 'Integration', render: (r) => (r.integrationMode === 'external' ? <Pill label="External" tone="slate" icon="building" /> : <Pill label="Integrated" tone="lime" />) },
  ];

  return (
    <>
      <FilterBar>
        <SearchField value={f.q} onChange={(v) => setF({ q: v })} placeholder="Search session ID, station, gateway ref" />
        <div className="chips" role="group" aria-label="Payment status">
          {CHIPS.map(([v, l]) => <Chip key={v || 'all'} label={l} selected={f.status === v} onClick={() => setF({ status: v })} />)}
        </div>
      </FilterBar>
      <FilterBar>
        <div className="filterbar__selects">
          <select className="select" aria-label="Date range" value={f.range} onChange={(e) => setF({ range: e.target.value })}>{RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <FilterSelect label="Any integration" value={f.mode} onChange={(v) => setF({ mode: v })} options={Object.entries(SESSION_MODE).map(([value, label]) => ({ value, label }))} />
          <FilterSelect label="All stations" value={f.stationId} onChange={(v) => setF({ stationId: v })} options={(lookups.data?.stations ?? []).map((s) => ({ value: s.id, label: s.name }))} />
        </div>
      </FilterBar>
      <Notice tone="info" title="Operator-paid sessions are different">Sessions at external stations are started and paid at the operator&apos;s own app or counter. PlugOrbit records them but did not collect the money, so they cannot be refunded or settled here.</Notice>
      <Card>
        <AsyncView resource={list} isEmpty={(d) => d.items.length === 0}
          empty={filtered ? <NoResults what="transactions" onClear={() => setF({ q: '', status: '', mode: '', stationId: '', range: '' })} /> : <EmptyState icon="receipt-text" title="No charging sessions yet" body="Sessions appear here as drivers charge." />}>
          {(d) => (
            <>
              <div className="table-summary">
                <div className="table-summary__item"><span className="table-summary__label">Sessions</span><span className="table-summary__value">{d.summary.count}</span></div>
                <div className="table-summary__item"><span className="table-summary__label">Collected by PlugOrbit</span><span className="table-summary__value">{formatInr(d.summary.gross)}</span></div>
                <div className="table-summary__item"><span className="table-summary__label">Failed</span><span className="table-summary__value" style={{ color: d.summary.failed ? 'var(--po-color-danger)' : undefined }}>{d.summary.failed}</span></div>
                <div className="table-summary__item"><span className="table-summary__label">Pending</span><span className="table-summary__value">{d.summary.pending}</span></div>
                <div className="table-summary__item"><span className="table-summary__label">Operator-paid</span><span className="table-summary__value">{d.summary.external}</span></div>
              </div>
              <DataTable caption="Transactions" columns={columns} rows={d.items} rowKey={(r) => r.id} pageSize={25} onRowClick={(r) => navigate(`/transactions/${r.id}`)}
                footer={d.total > d.items.length ? <span>Showing the latest {d.items.length} of {d.total}. Narrow the filters to see others.</span> : undefined} />
            </>
          )}
        </AsyncView>
      </Card>
    </>
  );
}
