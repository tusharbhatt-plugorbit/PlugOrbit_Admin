import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ConnectorType, MapStation } from '@/api/types';
import { CONNECTOR_TYPE, INTEGRATION_METHOD } from '@/domain/labels';
import { formatKw } from '@/domain/format';
import { timeAgo } from '@/domain/trust';
import { useDebounced } from '@/hooks/useDebounced';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { useUrlState } from '@/hooks/useUrlState';
import { adminConfigService } from '@/services/adminConfigService';
import { adminStationService } from '@/services/adminStationService';
import { AsyncView, Button, Card, CardBody, Chip, ConfidenceBadge, EmptyState, FilterBar, FilterSelect, KeyValue, NoResults, Notice, PublicationBadge, SearchField, StatusBadge, usePageMeta } from '@/ui';
import { MapPanel, type MapMarker } from './MapPanel';

const STATUS_CHIPS = [['all', 'All'], ['live', 'Live'], ['available', 'Available'], ['occupied', 'Occupied'], ['offline', 'Offline'], ['unknown', 'Unknown'], ['stale', 'Stale']] as const;
const POWER = [{ value: '7', label: '7 kW +' }, { value: '22', label: '22 kW +' }, { value: '50', label: '50 kW +' }, { value: '100', label: '100 kW +' }];

function SelectedPanel({ s, onOpen }: { s: MapStation; onOpen: () => void }) {
  const now = useNow();
  return (
    <Card>
      <CardBody>
        <div className="stack">
          <div>
            <div className="caption" style={{ fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase' }}>Selected station</div>
            <h2 className="card__title" style={{ fontSize: 18, marginTop: 4 }}>{s.name}</h2>
            <div className="caption">{s.city}, {s.state} · {s.partnerName}</div>
          </div>
          <div className="row row--wrap"><StatusBadge status={s.status} /><ConfidenceBadge confidence={s.confidence} updatedAt={s.lastUpdatedAt} now={now} /><PublicationBadge publication={s.publication} /></div>
          <div>
            <div className="strong">{s.counts.total} connector{s.counts.total === 1 ? '' : 's'}</div>
            <div className="caption">{(['available', 'occupied', 'offline', 'maintenance', 'unknown'] as const).filter((k) => s.counts[k] > 0).map((k) => `${s.counts[k]} ${k}`).join(' · ') || 'No connectors'}</div>
          </div>
          <div>{s.connectors.map((c) => (
            <div key={c.label} className="row row--between" style={{ padding: '6px 0', borderBottom: '1px solid var(--po-color-divider)' }}>
              <span><span className="strong">{c.label}</span> <span className="muted">{c.type} · {formatKw(c.powerKw)}</span></span>
              <StatusBadge status={c.status} />
            </div>))}
          </div>
          <div>
            <KeyValue label="Last updated" value={timeAgo(s.lastUpdatedAt, now)} />
            <KeyValue label="Integration" value={`${INTEGRATION_METHOD[s.integrationMethod]}${s.sessionMode === 'external' ? ' · external' : ''}`} />
            <KeyValue label="Reliability" value={s.reliabilityPct === null ? 'Not enough data' : `${s.reliabilityPct}%`} />
          </div>
          <Button label="Open station" icon="arrow-up-right" block onClick={onOpen} />
        </div>
      </CardBody>
    </Card>
  );
}

export default function MapPage() {
  usePageMeta('Network Map', 'See all PlugOrbit stations and their operational status');
  const navigate = useNavigate();
  const now = useNow();
  const [f, setF] = useUrlState({ q: '', status: 'all', partnerId: '', city: '', connectorType: '', minPowerKw: '', source: '', station: '' });
  const q = useDebounced(f.q);
  const data = useResource((s) => adminStationService.map({ q, status: f.status, partnerId: f.partnerId, city: f.city, connectorType: f.connectorType, minPowerKw: f.minPowerKw ? Number(f.minPowerKw) : undefined, source: f.source }, s), [q, f.status, f.partnerId, f.city, f.connectorType, f.minPowerKw, f.source]);
  const lookups = useResource((s) => adminConfigService.lookups(s), []);
  const items = useMemo(() => data.data?.items ?? [], [data.data]);
  const selected = items.find((s) => s.id === f.station) ?? null;
  const markers = useMemo<MapMarker[]>(() => items.map((s) => ({ id: s.id, lat: s.latitude, lng: s.longitude, status: s.status, label: s.name, stale: s.stale, faded: s.publication !== 'live' })), [items]);
  const filtered = !!(f.q || f.partnerId || f.city || f.connectorType || f.minPowerKw || f.source || f.status !== 'all');
  const clear = () => setF({ q: '', status: 'all', partnerId: '', city: '', connectorType: '', minPowerKw: '', source: '' });

  return (
    <>
      <FilterBar>
        <SearchField value={f.q} onChange={(v) => setF({ q: v })} placeholder="Search city, station, partner" />
        <div className="chips" role="group" aria-label="Status">
          {STATUS_CHIPS.map(([v, label]) => <Chip key={v} label={label} selected={f.status === v} onClick={() => setF({ status: v })} />)}
        </div>
      </FilterBar>
      <FilterBar>
        <div className="filterbar__selects">
          <FilterSelect label="All partners" value={f.partnerId} onChange={(v) => setF({ partnerId: v })} options={(lookups.data?.partners ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          <FilterSelect label="All cities" value={f.city} onChange={(v) => setF({ city: v })} options={(lookups.data?.cities ?? []).map((c) => ({ value: c, label: c }))} />
          <FilterSelect<ConnectorType> label="Any connector" value={f.connectorType as ConnectorType | ''} onChange={(v) => setF({ connectorType: v })} options={(Object.keys(CONNECTOR_TYPE) as ConnectorType[]).map((t) => ({ value: t, label: CONNECTOR_TYPE[t] }))} />
          <FilterSelect label="Any power" value={f.minPowerKw} onChange={(v) => setF({ minPowerKw: v })} options={POWER} />
          <FilterSelect label="Any data source" value={f.source} onChange={(v) => setF({ source: v })} options={Object.entries(INTEGRATION_METHOD).map(([value, label]) => ({ value, label }))} />
        </div>
        {filtered && <Button small variant="ghost" label="Clear filters" onClick={clear} />}
      </FilterBar>

      {data.data && data.data.items.some((s) => s.stale) && <Notice tone="warn" title="Some stations have stale data">Their pins have a dashed outline. The app shows these as Estimated or Unknown, never Live.</Notice>}

      <div className="map-layout">
        <MapPanel markers={markers} selectedId={f.station || null} onSelect={(id) => setF({ station: id })} countLabel={data.data ? `${data.data.total} station${data.data.total === 1 ? '' : 's'} visible` : 'Loading…'} />
        <div className="stack" style={{ minWidth: 0 }}>
          {selected ? <SelectedPanel s={selected} onOpen={() => navigate(`/stations/${selected.id}`)} /> : (
            <Card>
              <AsyncView resource={data} skeleton="detail" isEmpty={(d) => d.items.length === 0} empty={filtered ? <NoResults what="stations" onClear={clear} /> : <EmptyState icon="map-pin" title="No stations on the map yet" body="Add a station with a map pin and it will appear here." />}>
                {(d) => (
                  <CardBody>
                    <h2 className="card__title">Select a station</h2>
                    <p className="caption" style={{ marginBottom: 8 }}>Click a pin, or choose from the list.</p>
                    <div style={{ maxHeight: 'calc(100vh - 380px)', minHeight: 240, overflowY: 'auto' }}>
                      {d.items.map((s) => (
                        <button key={s.id} type="button" className="popover__item" style={{ width: '100%', border: 0, background: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer' }} onClick={() => setF({ station: s.id })}>
                          <span className="grow"><div className="strong">{s.name}</div><div className="caption">{s.city} · {timeAgo(s.lastUpdatedAt, now)}</div></span>
                          <span className="pill-group"><StatusBadge status={s.status} /></span>
                        </button>
                      ))}
                    </div>
                  </CardBody>
                )}
              </AsyncView>
            </Card>
          )}
          {selected && <Button variant="secondary" label="Back to list" icon="arrow-left" onClick={() => setF({ station: '' })} />}
        </div>
      </div>
    </>
  );
}
