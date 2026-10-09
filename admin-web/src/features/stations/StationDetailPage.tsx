import { useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import type { StationDetail } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { AMENITY, REVIEW_STATE, SESSION_MODE } from '@/domain/labels';
import { formatDateTime } from '@/domain/format';
import { timeAgo } from '@/domain/trust';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { adminAuditService } from '@/services/adminAuditService';
import { adminStationService } from '@/services/adminStationService';
import { AsyncView, AuditTimeline, Button, Card, CardBody, CardHeader, EmptyState, KeyValue, Notice, PageHeader, Pill, PublicationBadge, usePageMeta } from '@/ui';
import { MapPanel } from '../map/MapPanel';
import { ConnectorsPanel } from './ConnectorsPanel';
import { PricingPanel } from './PricingPanel';
import { DataSource, ReadinessChecklist, StationActionDialogs, StationStatus, type StationAction } from './stationUi';

type Tab = 'overview' | 'connectors' | 'pricing' | 'activity';

function ActivityTab({ stationId }: { stationId: string }) {
  const log = useResource((s) => adminAuditService.list({ entityType: 'station', entityId: stationId, limit: 50 }, s), [stationId]);
  return (
    <Card>
      <CardHeader title="Activity" subtitle="Every change to this station, its connectors and its prices." />
      <CardBody>
        <AsyncView resource={log} skeleton="detail" isEmpty={(d) => d.items.length === 0} empty={<EmptyState compact icon="history" title="No recorded changes yet" />}>
          {(d) => <AuditTimeline entries={d.items} showEntity />}
        </AsyncView>
      </CardBody>
    </Card>
  );
}

function Overview({ s, now, onAction }: { s: StationDetail; now: number; onAction: (a: StationAction) => void }) {
  const { can } = useAuth();
  return (
    <div className="grid grid--split-even" style={{ alignItems: 'start' }}>
      <div className="stack">
        <Card>
          <CardHeader title="Station details" />
          <CardBody>
            <KeyValue label="Partner" value={<Link to={`/partners/${s.partnerId}`}>{s.partnerName}</Link>} />
            <KeyValue label="Address" value={s.address} />
            <KeyValue label="City / state" value={`${s.city}, ${s.state}`} />
            <KeyValue label="Coordinates" value={<span className="mono">{s.latitude}, {s.longitude}</span>} />
            <KeyValue label="Operating hours" value={s.hours} />
            <KeyValue label="Access instructions" value={s.accessInstructions} />
            <KeyValue label="Parking" value={s.parkingInfo} />
            <KeyValue label="Amenities" value={s.amenities.length ? <span className="pill-group" style={{ justifyContent: 'flex-end' }}>{s.amenities.map((a) => <Pill key={a} label={AMENITY[a] ?? a} upper={false} />)}</span> : '—'} />
            <KeyValue label="Sessions" value={SESSION_MODE[s.sessionMode]} />
            {s.operatorInstructions && <KeyValue label="Operator instructions" value={s.operatorInstructions} />}
            <KeyValue label="Data source" value={<DataSource station={s} now={now} />} />
            <KeyValue label="Verification" value={REVIEW_STATE[s.verification]} />
            <KeyValue label="Reliability" value={s.reliabilityPct === null ? 'Not enough sessions yet' : `${s.reliabilityPct}%`} />
            <KeyValue label="Last updated" value={`${timeAgo(s.lastUpdatedAt, now)}${s.lastUpdatedAt ? ` · ${formatDateTime(s.lastUpdatedAt)}` : ''}`} />
          </CardBody>
        </Card>
      </div>
      <div className="stack">
        <MapPanel short legend={false} markers={[{ id: s.id, lat: s.latitude, lng: s.longitude, status: s.status, label: s.name, stale: s.stale, faded: s.publication !== 'live' }]} selectedId={s.id} center={{ lat: s.latitude, lng: s.longitude }} zoom={14} />
        <Card>
          <CardHeader title={s.publication === 'live' ? 'Live in the app' : 'Go-live checklist'} subtitle={s.publication === 'live' ? (s.visibleInApp ? 'Drivers can see this station.' : 'Marked live, but hidden because its partner is not active.') : 'Every item must pass before drivers can see this station.'}
            actions={s.publication !== 'live' && can('stations:publish') ? <Button label={s.publication === 'hidden' ? 'Put back live' : 'Go live'} icon="rocket" disabled={!s.readiness.ready} onClick={() => onAction('publish')} /> : undefined} />
          <CardBody>{s.publication === 'live' ? (s.partnerStatus !== 'active' && <Notice tone="warn" title="Partner is not active">The station is hidden from the app until the partner is reactivated.</Notice>) : <ReadinessChecklist readiness={s.readiness} />}</CardBody>
        </Card>
      </div>
    </div>
  );
}

export default function StationDetailPage() {
  const { stationId = '', tab = 'overview' } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const now = useNow();
  const detail = useResource((sig) => adminStationService.get(stationId, sig), [stationId]);
  const [action, setAction] = useState<StationAction | null>(null);
  const s = detail.data;
  usePageMeta(s?.name ?? 'Station', s ? `${s.partnerName} · ${s.city}, ${s.state}` : undefined);
  const active: Tab = (['overview', 'connectors', 'pricing', 'activity'] as const).includes(tab as Tab) ? (tab as Tab) : 'overview';
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'overview', label: 'Overview', show: true }, { id: 'connectors', label: `Connectors${s ? ` (${s.connectorCount})` : ''}`, show: true },
    { id: 'pricing', label: 'Pricing', show: true }, { id: 'activity', label: 'Activity', show: can('audit:read') },
  ];

  return (
    <>
      <PageHeader back={{ to: '/stations', label: 'All stations' }} actions={s && (
        <>
          {can('stations:override') && (s.connectors.some((c) => c.effective.overridden) ? <Button variant="secondary" label="Clear overrides" onClick={() => setAction('clear')} /> : s.publication !== 'draft' && <Button variant="secondary" icon="wrench" label="Maintenance / offline" onClick={() => setAction('override')} />)}
          {can('stations:publish') && s.publication === 'live' && <Button variant="ghost-danger" label="Hide station" onClick={() => setAction('hide')} />}
          {can('stations:write') && <Button icon="pencil" label="Edit" onClick={() => navigate(`/stations/${s.id}/edit`)} />}
        </>
      )}>
        {s && <span className="row row--wrap"><StationStatus station={s} /><PublicationBadge publication={s.publication} /></span>}
      </PageHeader>
      <div className="segmented" role="tablist" aria-label="Station sections" style={{ alignSelf: 'flex-start' }}>
        {tabs.filter((t) => t.show).map((t) => (
          <NavLink key={t.id} role="tab" aria-selected={active === t.id} to={`/stations/${stationId}${t.id === 'overview' ? '' : `/${t.id}`}`} end className={`segmented__item ${active === t.id ? 'segmented__item--active' : ''}`}>{t.label}</NavLink>
        ))}
      </div>
      <AsyncView resource={detail} skeleton="detail">
        {(st) => (
          <>
            {st.stale && st.publication === 'live' && <Notice tone="warn" title="Status data is stale">At least one connector has not reported recently, so the app shows this station as {st.confidence === 'unknown' ? 'Unknown' : 'Estimated'}, not Live.</Notice>}
            {active === 'overview' && <Overview s={st} now={now} onAction={setAction} />}
            {active === 'connectors' && <ConnectorsPanel station={st} onChanged={detail.reload} />}
            {active === 'pricing' && <PricingPanel station={st} onChanged={detail.reload} />}
            {active === 'activity' && <ActivityTab stationId={st.id} />}
            <StationActionDialogs station={st} action={action} onClose={() => setAction(null)} onDone={(next) => detail.set(next)} />
          </>
        )}
      </AsyncView>
    </>
  );
}
