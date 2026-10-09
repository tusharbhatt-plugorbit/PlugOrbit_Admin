import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Station } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { formatKw } from '@/domain/format';
import { timeAgo } from '@/domain/trust';
import { useDebounced } from '@/hooks/useDebounced';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { useUrlState } from '@/hooks/useUrlState';
import { adminConfigService } from '@/services/adminConfigService';
import { adminStationService } from '@/services/adminStationService';
import { ActionMenu, AsyncView, Button, Card, Chip, ConnectorImage, DataTable, Drawer, EmptyState, FilterBar, FilterSelect, KeyValue, NoResults, Notice, PageHeader, PublicationBadge, SearchField, usePageMeta, type Column } from '@/ui';
import { CountsLine, DataSource, ReadinessChecklist, StationActionDialogs, StationStatus, type StationAction } from './stationUi';

const CHIPS = [
  ['all', 'All'], ['live', 'Live'], ['occupied', 'Occupied'], ['offline', 'Offline'], ['unknown', 'Unknown'], ['stale', 'Stale'], ['needs_review', 'Needs review'],
] as const;

function StationDrawer({ id, onClose, onAction }: { id: string; onClose: () => void; onAction: (a: StationAction) => void }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const detail = useResource((s) => adminStationService.get(id, s), [id]);
  const now = useNow();
  const s = detail.data;
  return (
    <Drawer open onClose={onClose} title={s?.name ?? 'Station'} subtitle={s ? `${s.partnerName} · ${s.city}, ${s.state}` : undefined}
      footer={s && (
        <>
          {can('stations:publish') && s.publication === 'live' && <Button variant="ghost-danger" label="Hide" onClick={() => onAction('hide')} />}
          {can('stations:override') && <Button variant="secondary" icon="wrench" label="Mark maintenance / offline" onClick={() => onAction('override')} />}
          <Button label="Open station" icon="arrow-up-right" onClick={() => navigate(`/stations/${s.id}`)} />
        </>
      )}>
      <AsyncView resource={detail} skeleton="detail">
        {(st) => (
          <>
            <Card pad>
              <div className="row row--wrap"><StationStatus station={st} /><PublicationBadge publication={st.publication} /></div>
              <div style={{ marginTop: 8 }}>
                <KeyValue label="Connectors" value={<CountsLine counts={st.counts} />} />
                <KeyValue label="Data source" value={<DataSource station={st} now={now} />} />
                <KeyValue label="Last updated" value={timeAgo(st.lastUpdatedAt, now)} />
                <KeyValue label="Reliability" value={st.reliabilityPct === null ? 'Not enough sessions' : `${st.reliabilityPct}%`} />
                <KeyValue label="Visible in app" value={st.visibleInApp ? 'Yes' : 'No'} />
              </div>
            </Card>
            {st.openIssues > 0 && <Notice tone="warn" title={`${st.openIssues} open data-quality issue${st.openIssues > 1 ? 's' : ''}`} actions={<Link to="/data-quality">Review in Data Quality</Link>} />}
            <Card pad>
              <h3 className="section-title">Connectors</h3>
              {st.connectors.length === 0 ? <p className="muted">No connectors yet.</p> : st.connectors.map((c) => (
                <div key={c.id} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--po-color-divider)' }}>
                  <ConnectorImage type={c.type} size={36} />
                  <span className="grow"><div className="strong">{c.label} · {c.type} · {formatKw(c.powerKw)}</div><div className="caption">{c.chargerId}</div></span>
                  <StationStatus station={{ status: c.effective.status }} />
                </div>
              ))}
            </Card>
            {st.publication !== 'live' && (
              <Card pad>
                <h3 className="section-title">Go-live checklist</h3>
                <ReadinessChecklist readiness={st.readiness} />
              </Card>
            )}
          </>
        )}
      </AsyncView>
    </Drawer>
  );
}

export default function StationsPage() {
  usePageMeta('Stations', 'Manage every charging location from one place');
  const navigate = useNavigate();
  const { can } = useAuth();
  const now = useNow();
  const [f, setF] = useUrlState({ q: '', status: 'all', partnerId: '', publication: '', station: '' });
  const q = useDebounced(f.q);
  const list = useResource((s) => adminStationService.list({ q, status: f.status, partnerId: f.partnerId, publication: f.publication, limit: 200 }, s), [q, f.status, f.partnerId, f.publication]);
  const lookups = useResource((s) => adminConfigService.lookups(s), []);
  const [action, setAction] = useState<{ station: Station; kind: StationAction } | null>(null);
  const [rev, setRev] = useState(0); // remounts the drawer so it shows the result of an action
  const filtered = !!(f.q || f.partnerId || f.publication || f.status !== 'all');

  const columns: Column<Station>[] = [
    { key: 'name', header: 'Station', minWidth: '210px', sortValue: (s) => s.name.toLowerCase(), render: (s) => <><div className="cell-main">{s.name}</div><div className="cell-sub">{s.address}</div></> },
    { key: 'partner', header: 'Partner', minWidth: '110px', sortValue: (s) => s.partnerName.toLowerCase(), render: (s) => s.partnerName },
    { key: 'city', header: 'Location', sortValue: (s) => s.city, render: (s) => <><div>{s.city}</div><div className="cell-sub">{s.state}</div></> },
    { key: 'conns', header: 'Connectors', align: 'right', sortValue: (s) => s.connectorCount, render: (s) => <><span className="strong num">{s.connectorCount}</span><div className="cell-sub">{s.connectorTypes.join(' · ') || '—'}</div></> },
    { key: 'status', header: 'Status', sortValue: (s) => s.status, render: (s) => <div className="stack stack--sm" style={{ alignItems: 'flex-start' }}><StationStatus station={s} />{s.needsReview && <span className="caption" style={{ color: 'var(--po-color-amber)', fontWeight: 700 }}>Needs review</span>}</div> },
    { key: 'app', header: 'In app', sortValue: (s) => s.publication, render: (s) => <PublicationBadge publication={s.publication} /> },
    { key: 'source', header: 'Data source', render: (s) => <DataSource station={s} now={now} /> },
    { key: 'updated', header: 'Updated', sortValue: (s) => s.lastUpdatedAt ?? 0, render: (s) => <span className="muted nowrap">{timeAgo(s.lastUpdatedAt, now)}</span> },
  ];

  return (
    <>
      <PageHeader actions={can('stations:write') && <Button icon="plus" label="Add station" onClick={() => navigate('/stations/new')} />} />
      <FilterBar>
        <SearchField value={f.q} onChange={(v) => setF({ q: v })} placeholder="Search station, city, partner" />
        <div className="chips" role="group" aria-label="Status">
          {CHIPS.map(([v, label]) => <Chip key={v} label={label} selected={f.status === v} onClick={() => setF({ status: v })} />)}
        </div>
        <div className="filterbar__selects">
          <FilterSelect label="All partners" value={f.partnerId} onChange={(v) => setF({ partnerId: v })} options={(lookups.data?.partners ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          <FilterSelect label="Any app visibility" value={f.publication} onChange={(v) => setF({ publication: v })} options={[{ value: 'live', label: 'Live in app' }, { value: 'draft', label: 'Draft' }, { value: 'hidden', label: 'Hidden' }]} />
        </div>
      </FilterBar>
      <Card>
        <AsyncView resource={list} isEmpty={(d) => d.items.length === 0}
          empty={filtered ? <NoResults what="stations" onClear={() => setF({ q: '', status: 'all', partnerId: '', publication: '' })} /> : <EmptyState icon="plug" title="No stations yet" body="Add a station once its partner is verified." action={can('stations:write') && <Button icon="plus" label="Add station" onClick={() => navigate('/stations/new')} />} />}>
          {(d) => (
            <DataTable caption="Stations" columns={columns} rows={d.items} rowKey={(s) => s.id} selectedKey={f.station || null} onRowClick={(s) => setF({ station: s.id })}
              actions={(s) => (
                <span className="row row--end">
                  <Button small variant="secondary" label="Open" onClick={() => navigate(`/stations/${s.id}`)} />
                  <ActionMenu items={[
                    { label: 'Edit station', icon: 'pencil', hidden: !can('stations:write'), onClick: () => navigate(`/stations/${s.id}/edit`) },
                    { label: 'Mark maintenance / offline', icon: 'wrench', hidden: !can('stations:override') || s.publication === 'draft', onClick: () => setAction({ station: s, kind: 'override' }) },
                    { label: 'Hide from app', icon: 'eye-off', danger: true, hidden: !can('stations:publish') || s.publication !== 'live', onClick: () => setAction({ station: s, kind: 'hide' }) },
                  ]} />
                </span>
              )} />
          )}
        </AsyncView>
      </Card>
      {f.station && <StationDrawer key={rev} id={f.station} onClose={() => setF({ station: '' })} onAction={(kind) => { const s = list.data?.items.find((x) => x.id === f.station); if (s) setAction({ station: s, kind }); }} />}
      {action && <StationActionDialogs station={action.station} action={action.kind} onClose={() => setAction(null)} onDone={() => { list.reload(); setRev((r) => r + 1); }} />}
    </>
  );
}
