import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { HealthRow, Severity } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { CONNECTOR_TYPE, INTEGRATION_METHOD } from '@/domain/labels';
import { formatKw, formatPct } from '@/domain/format';
import { timeAgo } from '@/domain/trust';
import { useDebounced } from '@/hooks/useDebounced';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { useUrlState } from '@/hooks/useUrlState';
import { adminConfigService } from '@/services/adminConfigService';
import { adminConnectorService } from '@/services/adminConnectorService';
import { adminHealthService } from '@/services/adminHealthService';
import { ActionMenu, AsyncView, BarList, Button, Card, CardBody, CardHeader, Chip, ConfidenceBadge, ConfirmDialog, ConnectorImage, DataTable, EmptyState, FilterBar, FilterSelect, KpiCard, NoResults, SearchField, SeverityBadge, StatusBadge, usePageMeta, type Column } from '@/ui';

const CHIPS: [Severity | '', string][] = [['', 'All'], ['critical', 'Critical'], ['warning', 'Warning'], ['healthy', 'Healthy']];

export default function ChargerHealthPage() {
  usePageMeta('Charger Health', 'Heartbeats, fault rates and integration uptime');
  const navigate = useNavigate();
  const { can } = useAuth();
  const now = useNow();
  const [f, setF] = useUrlState({ q: '', severity: '', partnerId: '', status: '' });
  const q = useDebounced(f.q);
  const summary = useResource((s) => adminHealthService.summary(s), []);
  const rows = useResource((s) => adminHealthService.chargers({ q, severity: f.severity, partnerId: f.partnerId, status: f.status }, s), [q, f.severity, f.partnerId, f.status]);
  const lookups = useResource((s) => adminConfigService.lookups(s), []);
  const [maint, setMaint] = useState<HealthRow | null>(null);
  const s = summary.data;
  const filtered = !!(f.q || f.severity || f.partnerId || f.status);

  const columns: Column<HealthRow>[] = [
    { key: 'sev', header: 'Health', sortValue: (r) => ({ critical: 0, warning: 1, healthy: 2 })[r.severity], render: (r) => <SeverityBadge severity={r.severity} /> },
    { key: 'conn', header: 'Connector', minWidth: '250px', sortValue: (r) => `${r.stationName}${r.label}`, render: (r) => <div className="row"><ConnectorImage type={r.type} size={36} /><div><div className="cell-main nowrap">{r.label} · {CONNECTOR_TYPE[r.type]} · {formatKw(r.powerKw)}</div><div className="cell-sub"><Link to={`/stations/${r.stationId}`}>{r.stationName}</Link> · {r.city}</div></div></div> },
    { key: 'status', header: 'Status · source', render: (r) => <div className="stack stack--sm" style={{ alignItems: 'flex-start' }}><StatusBadge status={r.status} /><ConfidenceBadge confidence={r.confidence} /><span className="caption">{INTEGRATION_METHOD[r.integrationMode]}{r.overridden ? ' · override' : ''}</span></div> },
    { key: 'hb', header: 'Last heartbeat', sortValue: (r) => r.heartbeatAgeMs ?? 1e15, render: (r) => <span className="nowrap muted">{r.integrationMode === 'manual' ? 'Manual: none expected' : timeAgo(r.lastHeartbeatAt, now)}</span> },
    { key: 'fault', header: 'Fault rate · uptime', align: 'right', minWidth: '130px', sortValue: (r) => r.faultRatePct ?? -1, render: (r) => (
      <>
        <div>{r.faultRatePct === null ? <span className="muted">No sessions</span> : <span className="strong num">{formatPct(r.faultRatePct, 1)}</span>}</div>
        <div className="cell-sub nowrap">{r.faultRatePct === null ? '' : `${r.faults30d} of ${r.sessions30d} · 30 d · `}{r.uptimePct === null ? 'no uptime data' : `${formatPct(r.uptimePct, 1)} up`}</div>
        {r.repeatedFailures > 0 && <div className="cell-sub nowrap" style={{ color: r.repeatedFailures >= 3 ? 'var(--po-color-danger)' : 'var(--po-color-amber)', fontWeight: 700 }}>{r.repeatedFailures} failed this week</div>}
      </>) },
    { key: 'why', header: 'Why', minWidth: '240px', render: (r) => (r.reasons.length ? <ul style={{ margin: 0, paddingLeft: 16 }}>{r.reasons.map((x) => <li key={x} className="caption" style={{ color: 'var(--po-color-ink-soft)' }}>{x}</li>)}</ul> : <span className="muted">All good</span>) },
  ];

  return (
    <>
      <div className="grid grid--4">
        <KpiCard label="Connectors online" value={formatPct(s?.onlinePct ?? null, 1)} note={s ? `${s.total} connectors monitored` : ' '} noteTone={s && s.onlinePct !== null && s.onlinePct < 90 ? 'warn' : 'up'} />
        <KpiCard label="Offline" value={s?.offline ?? '—'} note={s ? `${s.maintenance} in maintenance` : ' '} noteTone={s && s.offline > 0 ? 'bad' : 'up'} />
        <KpiCard label="Integration uptime" value={formatPct(s?.integrationUptimePct ?? null, 1)} note="Feed-connected chargers, 30 days" />
        <KpiCard label="Need attention" value={s ? s.critical + s.warning : '—'} note={s ? `${s.critical} critical · ${s.warning} warning` : ' '} noteTone={s && s.critical > 0 ? 'bad' : s && s.warning > 0 ? 'warn' : 'up'} />
      </div>
      {s && s.byMethod.length > 0 && (
        <Card>
          <CardHeader title="Online by status source" subtitle="Share of connectors currently Available or Occupied" />
          <CardBody><BarList ariaLabel="Online connectors by integration method" max={100} rows={s.byMethod.map((m) => ({ label: INTEGRATION_METHOD[m.method], sub: `${m.online} of ${m.connectors}`, value: Math.round((100 * m.online) / m.connectors) }))} format={(v) => `${v}%`} /></CardBody>
        </Card>
      )}
      <FilterBar>
        <SearchField value={f.q} onChange={(v) => setF({ q: v })} placeholder="Search station, connector, partner" />
        <div className="chips" role="group" aria-label="Severity">{CHIPS.map(([v, l]) => <Chip key={v || 'all'} label={l} selected={f.severity === v} count={v === 'critical' ? s?.critical : v === 'warning' ? s?.warning : undefined} onClick={() => setF({ severity: v })} />)}</div>
        <div className="filterbar__selects">
          <FilterSelect label="All partners" value={f.partnerId} onChange={(v) => setF({ partnerId: v })} options={(lookups.data?.partners ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          <FilterSelect label="Any status" value={f.status} onChange={(v) => setF({ status: v })} options={['available', 'occupied', 'offline', 'maintenance', 'unknown'].map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) }))} />
        </div>
      </FilterBar>
      <Card>
        <AsyncView resource={rows} isEmpty={(d) => d.items.length === 0} empty={filtered ? <NoResults what="connectors" onClear={() => setF({ q: '', severity: '', partnerId: '', status: '' })} /> : <EmptyState icon="activity" title="No connectors to monitor yet" body="Connectors on live stations appear here with their health." />}>
          {(d) => <DataTable caption="Charger health" columns={columns} rows={d.items} rowKey={(r) => r.connectorId} pageSize={20}
            actions={(r) => (
              <span className="row row--end">
                <Button small variant="secondary" label="Open connector" onClick={() => navigate(`/stations/${r.stationId}/connectors`)} />
                <ActionMenu items={[
                  { label: 'Open station', icon: 'plug', onClick: () => navigate(`/stations/${r.stationId}`) },
                  { label: 'Mark maintenance', icon: 'wrench', hidden: !can('stations:override') || r.status === 'maintenance', onClick: () => setMaint(r) },
                  { label: 'Investigate integration', icon: 'cable', hidden: r.integrationMode === 'manual' || !can('integrations:read'), onClick: () => navigate('/integrations') },
                ]} />
              </span>
            )} />}
        </AsyncView>
      </Card>
      <ConfirmDialog open={!!maint} onClose={() => setMaint(null)} title={`Mark ${maint?.label} at ${maint?.stationName} as maintenance?`} confirmLabel="Mark maintenance" tone="danger" minReason={5} successMessage="Connector set to maintenance for 24 hours"
        body="Drivers will see this connector as under maintenance (Manual) for 24 hours. You can clear it earlier from the station's Connectors tab."
        onConfirm={async (reason) => { await adminConnectorService.override(maint!.connectorId, { status: 'maintenance', reason, expiresInMinutes: 1440 }); rows.reload(); summary.reload(); }} />
    </>
  );
}
