import { useEffect, useMemo, useRef } from 'react';
import type { ConnectorStatus } from '@/api/types';
import { CONNECTOR_STATUS } from '@/domain/labels';
import { Icon, Notice, Skeleton } from '@/ui';
import { DEFAULT_CENTER, MAP_ID } from './googleMaps';
import { useGoogleMaps } from './useGoogleMaps';

export interface MapMarker {
  id: string; lat: number; lng: number; status: ConnectorStatus; label: string;
  /** Feed gone quiet: the pin gets a dashed outline so stale data is never mistaken for live. */
  stale?: boolean;
  /** Draft / hidden stations are shown faded: they are not visible in the user app. */
  faded?: boolean;
}

export interface PickValue { lat: number | null; lng: number | null; onChange: (lat: number, lng: number) => void }

interface Props {
  markers?: MapMarker[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Station form: click the map or drag the pin to choose the location. */
  pick?: PickValue;
  center?: { lat: number; lng: number };
  zoom?: number;
  short?: boolean;
  countLabel?: string;
  legend?: boolean;
}

const ZAP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"/></svg>';

export function pinClass(m: Pick<MapMarker, 'status' | 'stale' | 'faded'>, selected: boolean): string {
  return ['pin', `pin--${m.status}`, m.stale ? 'pin--stale' : '', m.faded ? 'pin--faded' : '', selected ? 'pin--selected' : ''].filter(Boolean).join(' ');
}

function Legend() {
  const items: ConnectorStatus[] = ['available', 'occupied', 'offline', 'unknown'];
  return (
    <div className="map-legend" aria-label="Pin colours">
      {items.map((s) => <span key={s} className="map-legend__item"><span className={`pin pin--${s}`} style={{ width: 14, height: 14, borderWidth: 2, boxShadow: 'none' }} /> {s === 'unknown' ? 'Unknown / stale' : CONNECTOR_STATUS[s].label}</span>)}
      <span className="map-legend__item"><span className="pin pin--available pin--stale" style={{ width: 14, height: 14, borderWidth: 2, boxShadow: 'none' }} /> Dashed = stale</span>
    </div>
  );
}

/** Not a real map: relative positions on a plane, so the screen stays usable without a Maps key. */
function Schematic({ markers, selectedId, onSelect }: { markers: MapMarker[]; selectedId?: string | null; onSelect?: (id: string) => void }) {
  const box = useMemo(() => {
    if (markers.length === 0) return { minLat: DEFAULT_CENTER.lat - 0.5, maxLat: DEFAULT_CENTER.lat + 0.5, minLng: DEFAULT_CENTER.lng - 0.5, maxLng: DEFAULT_CENTER.lng + 0.5 };
    const lats = markers.map((m) => m.lat), lngs = markers.map((m) => m.lng);
    const padLat = Math.max(0.05, (Math.max(...lats) - Math.min(...lats)) * 0.12), padLng = Math.max(0.05, (Math.max(...lngs) - Math.min(...lngs)) * 0.12);
    return { minLat: Math.min(...lats) - padLat, maxLat: Math.max(...lats) + padLat, minLng: Math.min(...lngs) - padLng, maxLng: Math.max(...lngs) + padLng };
  }, [markers]);
  const pos = (m: MapMarker) => ({ left: `${((m.lng - box.minLng) / (box.maxLng - box.minLng)) * 100}%`, top: `${(1 - (m.lat - box.minLat) / (box.maxLat - box.minLat)) * 100}%` });
  return (
    <div className="schematic" role="group" aria-label="Schematic station positions (not a real map)">
      <svg className="schematic" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {[20, 40, 60, 80].map((v) => <g key={v}><line x1={v} x2={v} y1="0" y2="100" stroke="var(--po-color-road-minor)" strokeWidth="0.25" /><line y1={v} y2={v} x1="0" x2="100" stroke="var(--po-color-road-minor)" strokeWidth="0.25" /></g>)}
        <polyline points="0,70 30,60 55,38 100,30" fill="none" stroke="var(--po-color-road)" strokeWidth="1.2" />
        <polyline points="25,0 35,40 40,100" fill="none" stroke="var(--po-color-road)" strokeWidth="1" />
        <rect x="62" y="62" width="26" height="22" rx="4" fill="var(--po-color-park)" opacity="0.7" />
        <rect x="6" y="8" width="20" height="14" rx="4" fill="var(--po-color-water)" opacity="0.7" />
      </svg>
      {markers.map((m) => (
        <button key={m.id} type="button" className={pinClass(m, m.id === selectedId)} style={pos(m)} onClick={() => onSelect?.(m.id)} aria-label={`${m.label}, ${m.status}`} title={m.label}>
          <Icon name="zap" size={15} filled />
        </button>
      ))}
    </div>
  );
}

export function MapPanel({ markers = [], selectedId, onSelect, pick, center, zoom = 8, short, countLabel, legend = true }: Props) {
  const maps = useGoogleMaps();
  const canvas = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const pinsRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const pickRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const fitted = useRef(false);
  const onSelectRef = useRef(onSelect);
  const pickChange = useRef(pick?.onChange);
  useEffect(() => { onSelectRef.current = onSelect; pickChange.current = pick?.onChange; });

  // create the map once the API is ready
  useEffect(() => {
    if (maps.status !== 'ready' || !canvas.current || mapRef.current) return;
    const start = pick && pick.lat !== null && pick.lng !== null ? { lat: pick.lat, lng: pick.lng } : center ?? DEFAULT_CENTER;
    const map = new google.maps.Map(canvas.current, { center: start, zoom: pick ? 13 : zoom, mapId: MAP_ID, clickableIcons: false, gestureHandling: 'cooperative', fullscreenControl: false, streetViewControl: false, mapTypeControl: false });
    mapRef.current = map;
    if (pick) map.addListener('click', (e: google.maps.MapMouseEvent) => { if (e.latLng) pickChange.current?.(Number(e.latLng.lat().toFixed(6)), Number(e.latLng.lng().toFixed(6))); });
  }, [maps.status, center, zoom, pick]);

  // markers (re-drawn when the data or selection changes)
  useEffect(() => {
    const map = mapRef.current;
    if (maps.status !== 'ready' || !map) return;
    pinsRef.current.forEach((p) => { p.map = null; });
    pinsRef.current = markers.map((m) => {
      const el = document.createElement('div');
      el.className = pinClass(m, m.id === selectedId);
      el.innerHTML = ZAP; // static, trusted markup (no user data)
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${m.label}, ${m.status}`);
      const pin = new google.maps.marker.AdvancedMarkerElement({ map, position: { lat: m.lat, lng: m.lng }, content: el, title: m.label, zIndex: m.id === selectedId ? 10 : 1 });
      pin.addListener('click', () => onSelectRef.current?.(m.id));
      return pin;
    });
    if (!fitted.current && markers.length > 0 && !pick) {
      const bounds = new google.maps.LatLngBounds();
      markers.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
      if (markers.length === 1) { map.setCenter({ lat: markers[0].lat, lng: markers[0].lng }); map.setZoom(14); } else map.fitBounds(bounds, 48);
      fitted.current = true;
    }
  }, [maps.status, markers, selectedId, pick]);

  // the draggable pin of the location picker
  useEffect(() => {
    const map = mapRef.current;
    if (maps.status !== 'ready' || !map || !pick) return;
    if (pick.lat === null || pick.lng === null) { if (pickRef.current) pickRef.current.map = null; pickRef.current = null; return; }
    const position = { lat: pick.lat, lng: pick.lng };
    if (!pickRef.current) {
      const el = document.createElement('div');
      el.className = 'pin pin--selected';
      el.innerHTML = ZAP;
      const marker = new google.maps.marker.AdvancedMarkerElement({ map, position, content: el, gmpDraggable: true, title: 'Station location (drag to adjust)' });
      marker.addListener('dragend', () => { const p = marker.position as google.maps.LatLngLiteral | google.maps.LatLng | null; if (!p) return; const lat = typeof p.lat === 'function' ? p.lat() : p.lat; const lng = typeof p.lng === 'function' ? p.lng() : p.lng; pickChange.current?.(Number(lat.toFixed(6)), Number(lng.toFixed(6))); });
      pickRef.current = marker;
      map.panTo(position);
    } else {
      pickRef.current.position = position;
    }
  }, [maps.status, pick]);

  const fallback = maps.status === 'missing-key' || maps.status === 'error';
  const schematicMarkers = pick && pick.lat !== null && pick.lng !== null ? [...markers, { id: '__pick', lat: pick.lat, lng: pick.lng, status: 'available' as const, label: 'Station location' }] : markers;

  return (
    <div className="stack stack--sm" style={{ minWidth: 0 }}>
      {fallback && (
        <Notice tone="warn" title={maps.status === 'error' ? 'Google Maps could not load' : 'Google Maps is not configured'}>
          {maps.status === 'error' ? maps.message : 'Set VITE_GOOGLE_MAPS_API_KEY in admin-web/.env.local (a browser key restricted to this site and the Maps JavaScript API), then restart the dev server.'}
          {' '}Showing a schematic view meanwhile: positions are relative, not a real map.
        </Notice>
      )}
      <div className={`map-box ${short ? 'map-box--short' : ''}`}>
        {maps.status === 'ready' && <div ref={canvas} className="map-box__canvas" role="application" aria-label="Map" />}
        {maps.status === 'loading' && <div style={{ padding: 24 }}><Skeleton h={24} w="40%" /></div>}
        {fallback && <Schematic markers={schematicMarkers} selectedId={selectedId} onSelect={onSelect} />}
        {countLabel && <div className="map-chip">{countLabel}</div>}
        {legend && !pick && maps.status !== 'loading' && <Legend />}
      </div>
    </div>
  );
}
