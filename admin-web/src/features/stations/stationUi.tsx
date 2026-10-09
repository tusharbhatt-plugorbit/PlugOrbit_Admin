import { useState } from 'react';
import type { Counts, Readiness, Station, StationDetail } from '@/api/types';
import { INTEGRATION_METHOD } from '@/domain/labels';
import { adminStationService } from '@/services/adminStationService';
import { ConfidenceBadge, ConfirmDialog, Icon, SelectField, StatusBadge } from '@/ui';

/** "2 available · 1 occupied · 1 offline": the one-line connector breakdown used in lists and on the map. */
export function CountsLine({ counts }: { counts: Counts }) {
  const parts = (['available', 'occupied', 'offline', 'maintenance', 'unknown'] as const).filter((k) => counts[k] > 0).map((k) => `${counts[k]} ${k}`);
  return <span>{parts.length ? parts.join(' · ') : 'No connectors'}</span>;
}

export function DataSource({ station, now }: { station: Pick<Station, 'integrationMethod' | 'confidence' | 'lastUpdatedAt' | 'sessionMode'>; now?: number }) {
  return (
    <div>
      <div className="cell-main nowrap" style={{ fontWeight: 700 }}>{INTEGRATION_METHOD[station.integrationMethod]}{station.sessionMode === 'external' && <span className="muted" style={{ fontWeight: 600 }}> · ext.</span>}</div>
      <div style={{ marginTop: 4 }}><ConfidenceBadge confidence={station.confidence} updatedAt={station.lastUpdatedAt} now={now} /></div>
    </div>
  );
}

export function StationStatus({ station }: { station: Pick<Station, 'status'> }) {
  return <StatusBadge status={station.status} />;
}

export function ReadinessChecklist({ readiness }: { readiness: Readiness }) {
  return (
    <div className="checklist" role="list" aria-label="Go-live checklist">
      {readiness.checks.map((c) => (
        <div key={c.id} className="checklist__item" role="listitem">
          <span className={`checklist__mark ${c.ok ? '' : 'checklist__mark--no'}`}><Icon name={c.ok ? 'check' : 'x'} size={14} strokeWidth={3} /></span>
          <span className="grow"><div className={c.ok ? '' : 'strong'}>{c.label}</div>{!c.ok && c.detail && <div className="caption">{c.detail}</div>}</span>
        </div>
      ))}
    </div>
  );
}

export type StationAction = 'hide' | 'publish' | 'override' | 'clear';

const DURATIONS = [
  { value: '', label: 'Until I clear it' }, { value: '60', label: '1 hour' }, { value: '240', label: '4 hours' },
  { value: '1440', label: '24 hours' }, { value: '10080', label: '7 days' },
];

/** Hide / go live / mark maintenance or offline / clear the override. Every one is confirmed and audited. */
export function StationActionDialogs({ station, action, onClose, onDone }: { station: Pick<StationDetail, 'id' | 'name'> | Station; action: StationAction | null; onClose: () => void; onDone: (s: StationDetail) => void }) {
  const [status, setStatus] = useState<'maintenance' | 'offline'>('maintenance');
  const [duration, setDuration] = useState('');
  return (
    <>
      <ConfirmDialog open={action === 'hide'} onClose={onClose} title={`Hide ${station.name}?`} tone="danger" confirmLabel="Hide station" minReason={5}
        body="Hidden stations disappear from the PlugOrbit app right away. Nothing is deleted, and you can put it back live later." successMessage="Station hidden"
        onConfirm={async (reason) => onDone(await adminStationService.hide(station.id, reason))} />
      <ConfirmDialog open={action === 'publish'} onClose={onClose} title={`Make ${station.name} live?`} confirmLabel="Go live" successMessage="Station is live in the app"
        body="Drivers will see this station in the PlugOrbit app. The checklist must be complete; if anything is missing the server will say what."
        onConfirm={async () => onDone(await adminStationService.publish(station.id))} />
      <ConfirmDialog open={action === 'override'} onClose={onClose} title={`Mark ${station.name} as…`} tone="danger" confirmLabel="Apply to all connectors" minReason={5} successMessage="Status overridden"
        body="This overrides every connector at the station. Drivers will see the status as User-confirmed (never Live) until you clear it or it expires."
        extra={<div className="grid grid--2"><SelectField label="Status" value={status} onChange={setStatus} options={[{ value: 'maintenance', label: 'Maintenance' }, { value: 'offline', label: 'Offline' }]} /><SelectField label="For how long" value={duration} onChange={setDuration} options={DURATIONS} /></div>}
        onConfirm={async (reason) => onDone(await adminStationService.overrideStatus(station.id, { status, reason, expiresInMinutes: duration ? Number(duration) : undefined }))} />
      <ConfirmDialog open={action === 'clear'} onClose={onClose} title="Clear manual overrides?" confirmLabel="Clear overrides" successMessage="Overrides cleared"
        body="Connectors go back to what their feed reports. Connectors that have no feed will show Unknown until updated."
        onConfirm={async () => onDone(await adminStationService.clearOverride(station.id))} />
    </>
  );
}
