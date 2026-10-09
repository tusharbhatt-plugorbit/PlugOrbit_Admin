import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Connector, ConnectorInput, ConnectorStatus, ConnectorType, IntegrationMethod, StationDetail } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { CONNECTOR_STATUS, CONNECTOR_TYPE, INTEGRATION_METHOD } from '@/domain/labels';
import { formatDateTime, formatKw } from '@/domain/format';
import { timeAgo } from '@/domain/trust';
import { useNow } from '@/hooks/useNow';
import { useSave } from '../common/useSave';
import { adminConnectorService } from '@/services/adminConnectorService';
import { ActionMenu, Button, Card, CardBody, CardHeader, ConfidenceBadge, ConfirmDialog, ConnectorImage, DataTable, Dialog, EmptyState, NumberField, Notice, SelectField, StatusBadge, TextField, useToast, type Column } from '@/ui';

const TYPES = Object.keys(CONNECTOR_TYPE) as ConnectorType[];
const METHODS = Object.keys(INTEGRATION_METHOD) as IntegrationMethod[];
const DURATIONS = [{ value: '', label: 'Until I clear it' }, { value: '60', label: '1 hour' }, { value: '240', label: '4 hours' }, { value: '1440', label: '24 hours' }, { value: '10080', label: '7 days' }];
const BLANK: ConnectorInput = { evseId: '', label: '', chargerId: '', type: 'CCS2', powerKw: 60, integrationMode: 'api' };

function ConnectorFormDialog({ station, connector, onClose, onSaved }: { station: StationDetail; connector: Connector | 'new'; onClose: () => void; onSaved: () => void }) {
  const isNew = connector === 'new';
  const [v, setV] = useState<ConnectorInput>(() => (isNew ? { ...BLANK, integrationMode: station.integrationMethod, label: `C${station.connectors.length + 1}`, evseId: `EVSE-${String(station.connectors.length + 1).padStart(3, '0')}` } : { evseId: connector.evseId, label: connector.label, chargerId: connector.chargerId, type: connector.type, powerKw: connector.powerKw, integrationMode: connector.integrationMode }));
  const { saving, errors, conflict, formError, run, clearError } = useSave();
  const set = <K extends keyof ConnectorInput>(k: K, x: ConnectorInput[K]) => { setV((s) => ({ ...s, [k]: x })); clearError(k); };
  const submit = async () => {
    const ok = await run(() => (isNew ? adminConnectorService.create(station.id, v) : adminConnectorService.update(connector.id, v, connector.version)), isNew ? 'Connector added' : 'Connector saved');
    if (ok) { onSaved(); onClose(); }
  };
  return (
    <Dialog open onClose={onClose} title={isNew ? 'Add connector' : `Edit ${connector.label}`} wide
      footer={<><Button variant="secondary" label="Cancel" onClick={onClose} /><Button label={isNew ? 'Add connector' : 'Save'} loading={saving} onClick={submit} /></>}>
      <div className="stack">
        {conflict && <Notice tone="warn" title="Someone else changed this connector. Close and reopen it to see their changes." />}
        {formError && !conflict && <Notice tone="danger" title={formError} />}
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ paddingTop: 22 }}><ConnectorImage type={v.type} size={72} /></div>
          <div className="grid grid--2 grow">
            <TextField label="Connector label" required value={v.label} onChange={(x) => set('label', x)} error={errors.label} help="Short, as printed: C1, C2" />
            <TextField label="EVSE / connector ID" required value={v.evseId} onChange={(x) => set('evseId', x)} error={errors.evseId} />
            <SelectField label="Connector type" value={v.type} onChange={(x) => set('type', x)} options={TYPES.map((t) => ({ value: t, label: CONNECTOR_TYPE[t] }))} />
            <NumberField label="Power" affix="kW" min={1} value={v.powerKw} onChange={(x) => set('powerKw', x ?? 0)} error={errors.powerKw} />
            <TextField label="Charger ID" required value={v.chargerId} onChange={(x) => set('chargerId', x)} error={errors.chargerId} help="The operator's / CMS identifier for the physical charger" />
            <SelectField label="Integration mode" value={v.integrationMode} onChange={(x) => set('integrationMode', x)} options={METHODS.map((m) => ({ value: m, label: INTEGRATION_METHOD[m] }))} help="Manual status is never shown as Live." />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function OverrideDialog({ connector, onClose, onSaved }: { connector: Connector; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<ConnectorStatus>('maintenance');
  const [duration, setDuration] = useState('');
  return (
    <ConfirmDialog open onClose={onClose} title={`Override ${connector.label}`} confirmLabel="Apply override" minReason={5} tone="danger" successMessage="Status overridden"
      body="An override wins over the feed. Drivers see it as User-confirmed, never Live, and the change appears in the audit log."
      extra={<div className="grid grid--2"><SelectField label="Set status to" value={status} onChange={setStatus} options={(Object.keys(CONNECTOR_STATUS) as ConnectorStatus[]).map((s) => ({ value: s, label: CONNECTOR_STATUS[s].label }))} /><SelectField label="For how long" value={duration} onChange={setDuration} options={DURATIONS} /></div>}
      onConfirm={async (reason) => { await adminConnectorService.override(connector.id, { status, reason, expiresInMinutes: duration ? Number(duration) : undefined }); onSaved(); }} />
  );
}

function QrDialog({ connector, station, onClose }: { connector: Connector; station: StationDetail; onClose: () => void }) {
  const toast = useToast();
  return (
    <Dialog open onClose={onClose} title={`QR code · ${connector.label}`} footer={<Button label="Close" onClick={onClose} />}>
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <div style={{ background: 'var(--po-color-surface)', padding: 16, borderRadius: 16, border: '1px solid var(--po-color-divider)' }}><QRCodeSVG value={connector.qrCode} size={200} level="M" marginSize={0} title={`QR for ${connector.qrCode}`} /></div>
        <div className="mono" style={{ fontSize: 15 }}>{connector.qrCode}</div>
        <p className="caption" style={{ maxWidth: 360 }}>{station.name}, {connector.label}. The PlugOrbit app resolves this code to the connector when a driver scans it or types it in.</p>
        <Button variant="secondary" icon="copy" label="Copy code" onClick={() => { void navigator.clipboard?.writeText(connector.qrCode).then(() => toast.success('Code copied')); }} />
      </div>
    </Dialog>
  );
}

export function ConnectorsPanel({ station, onChanged }: { station: StationDetail; onChanged: () => void }) {
  const { can } = useAuth();
  const now = useNow();
  const [editing, setEditing] = useState<Connector | 'new' | null>(null);
  const [override, setOverride] = useState<Connector | null>(null);
  const [qr, setQr] = useState<Connector | null>(null);
  const [remove, setRemove] = useState<Connector | null>(null);
  const [clear, setClear] = useState<Connector | null>(null);
  const write = can('connectors:write');
  const canOverride = can('stations:override');

  const columns: Column<Connector>[] = [
    { key: 'id', header: 'Connector', minWidth: '210px', sortValue: (c) => c.label, render: (c) => <div className="row"><ConnectorImage type={c.type} size={40} /><div><div className="cell-main nowrap">{c.label} <span className="muted" style={{ fontWeight: 500 }}>· {c.evseId}</span></div><div className="cell-sub mono nowrap">{c.chargerId}</div></div></div> },
    { key: 'type', header: 'Type', sortValue: (c) => c.type, render: (c) => CONNECTOR_TYPE[c.type] },
    { key: 'power', header: 'Power', align: 'right', sortValue: (c) => c.powerKw, render: (c) => formatKw(c.powerKw) },
    { key: 'qr', header: 'QR', render: (c) => <Button small variant="ghost" icon="qr" label="View" onClick={() => setQr(c)} /> },
    { key: 'status', header: 'Current status', render: (c) => (
      <div className="stack stack--sm" style={{ alignItems: 'flex-start' }}>
        <StatusBadge status={c.effective.status} />
        {c.effective.overridden && c.override && <span className="caption" title={c.override.reason}>Manual override{c.override.expiresAt ? ` until ${formatDateTime(c.override.expiresAt)}` : ''}</span>}
      </div>) },
    { key: 'conf', header: 'Data confidence', render: (c) => <ConfidenceBadge confidence={c.effective.confidence} updatedAt={c.effective.updatedAt} now={now} /> },
    { key: 'mode', header: 'Integration', render: (c) => INTEGRATION_METHOD[c.integrationMode] },
    { key: 'hb', header: 'Last heartbeat', sortValue: (c) => c.lastHeartbeatAt ?? 0, render: (c) => <span className="muted nowrap">{c.integrationMode === 'manual' ? 'n/a (manual)' : timeAgo(c.lastHeartbeatAt, now)}</span> },
  ];

  return (
    <div className="stack">
      <Card>
        <CardHeader title="Connectors" subtitle="EVSE, type, power, QR, status and manual override for each charger point." actions={write && <Button icon="plus" label="Add connector" onClick={() => setEditing('new')} />} />
        {station.connectors.length === 0 ? (
          <CardBody><EmptyState icon="cable" title="No connectors yet" body="A station needs at least one connector before it can go live." action={write && <Button icon="plus" label="Add connector" onClick={() => setEditing('new')} />} /></CardBody>
        ) : (
          <div style={{ marginTop: 12 }}>
            <DataTable caption="Connectors" columns={columns} rows={station.connectors} rowKey={(c) => c.id} pageSize={50}
              actions={(c) => (
                <span className="row row--end">
                  {write && <Button small variant="secondary" label="Edit" onClick={() => setEditing(c)} />}
                  <ActionMenu items={[
                    { label: 'Override status…', icon: 'wrench', hidden: !canOverride || !!c.override, onClick: () => setOverride(c) },
                    { label: 'Clear manual override', icon: 'undo', hidden: !canOverride || !c.override, onClick: () => setClear(c) },
                    { label: 'Delete connector', icon: 'trash', danger: true, hidden: !write, onClick: () => setRemove(c) },
                  ]} />
                </span>
              )} />
          </div>
        )}
      </Card>
      <Card tone="info" pad>
        <h3 className="section-title" style={{ color: 'var(--po-color-info)' }}>Connector visuals</h3>
        <p className="soft" style={{ lineHeight: 1.5 }}>The same connector pictures appear in the PlugOrbit app (Vehicle setup and station detail), so drivers match a plug by sight.</p>
        <div className="row row--wrap" style={{ marginTop: 10 }}>{TYPES.map((t) => <span key={t} className="row" style={{ gap: 8 }}><ConnectorImage type={t} size={40} /><span className="strong">{CONNECTOR_TYPE[t]}</span></span>)}</div>
      </Card>

      {editing && <ConnectorFormDialog station={station} connector={editing} onClose={() => setEditing(null)} onSaved={onChanged} />}
      {override && <OverrideDialog connector={override} onClose={() => setOverride(null)} onSaved={onChanged} />}
      {qr && <QrDialog connector={qr} station={station} onClose={() => setQr(null)} />}
      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} title={`Delete ${remove?.label}?`} tone="danger" confirmLabel="Delete connector" successMessage="Connector deleted"
        body="This permanently removes the connector. Connectors with charging history cannot be deleted: set them to maintenance instead."
        onConfirm={async () => { await adminConnectorService.remove(remove!.id); onChanged(); }} />
      <ConfirmDialog open={!!clear} onClose={() => setClear(null)} title={`Clear override on ${clear?.label}?`} confirmLabel="Clear override" successMessage="Override cleared"
        body="The connector goes back to what its feed reports."
        onConfirm={async () => { await adminConnectorService.clearOverride(clear!.id); onChanged(); }} />
    </div>
  );
}
