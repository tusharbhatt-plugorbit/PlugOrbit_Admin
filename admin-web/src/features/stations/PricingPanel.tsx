import { useMemo, useState } from 'react';
import type { Connector, StationDetail, Tariff, TariffHistory, TariffInput } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { formatDateTime, formatInr, fromLocalInput, toLocalInput } from '@/domain/format';
import { useResource } from '@/hooks/useResource';
import { adminTariffService } from '@/services/adminTariffService';
import { useSave } from '../common/useSave';
import { AsyncView, Button, Card, CardBody, CardHeader, ConfirmDialog, DataTable, Dialog, NumberField, Notice, Pill, SelectField, TextArea, TextField, type Column } from '@/ui';

const STATE_TONE = { active: 'lime', scheduled: 'info', superseded: 'slate', cancelled: 'danger' } as const;
const RATE_FIELDS: { key: 'pricePerKwh' | 'pricePerMin' | 'pricePerSession' | 'parkingFeePerHour' | 'idleFeePerMin'; label: string; affix: string }[] = [
  { key: 'pricePerKwh', label: 'Price per kWh', affix: '₹/kWh' }, { key: 'pricePerMin', label: 'Price per minute', affix: '₹/min' }, { key: 'pricePerSession', label: 'Price per session', affix: '₹' },
  { key: 'parkingFeePerHour', label: 'Parking fee', affix: '₹/hour' }, { key: 'idleFeePerMin', label: 'Idle fee', affix: '₹/min' },
];

function TariffDialog({ station, connector, current, onClose, onSaved }: { station: StationDetail; connector: Connector | null; current: TariffHistory; onClose: () => void; onSaved: () => void }) {
  const base = connector ? current.current[connector.id] : current.stationWide;
  const [scope, setScope] = useState(connector?.id ?? '');
  const [v, setV] = useState<TariffInput>({
    connectorId: connector?.id ?? null, pricePerKwh: base?.pricePerKwh ?? 0, pricePerMin: base?.pricePerMin ?? 0, pricePerSession: base?.pricePerSession ?? 0,
    parkingFeePerHour: base?.parkingFeePerHour ?? 0, idleFeePerMin: base?.idleFeePerMin ?? 0, gstPercent: base?.gstPercent ?? 18, effectiveFrom: null, reason: '', confirmLargeChange: false,
  });
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const { saving, errors, formError, errorCode, run } = useSave();
  const set = <K extends keyof TariffInput>(k: K, x: TariffInput[K]) => setV((s) => ({ ...s, [k]: x }));
  const changed = base ? v.pricePerKwh !== base.pricePerKwh : true;

  const submit = async (confirmLarge: boolean) => {
    const ok = await run(() => adminTariffService.create(station.id, { ...v, connectorId: scope || null, effectiveFrom: when === 'now' ? null : v.effectiveFrom, confirmLargeChange: confirmLarge }), 'Price saved as a new version');
    if (ok) { onSaved(); onClose(); }
  };
  // The server's fat-finger guard: a >50 % move needs a second, explicit confirmation.
  const large = errorCode === 'LARGE_PRICE_CHANGE' ? formError : null;

  return (
    <Dialog open onClose={onClose} title={`Change price · ${connector ? connector.label : 'all connectors'}`} wide
      footer={<><Button variant="secondary" label="Cancel" onClick={onClose} /><Button label={large ? 'Confirm large change' : 'Save new price'} variant={large ? 'danger' : 'primary'} loading={saving} disabled={v.reason.trim().length < 3 || (!changed && when === 'now')} onClick={() => submit(!!large)} /></>}>
      <div className="stack">
        <Notice tone="info" title="A price change is a new version">The old price stays in the history with who changed it and when. Past prices are never overwritten.</Notice>
        <SelectField label="Applies to" value={scope} onChange={setScope} options={[{ value: '', label: 'All connectors at this station' }, ...station.connectors.map((c) => ({ value: c.id, label: `${c.label} · ${c.type} · ${c.powerKw} kW` }))]} />
        <div className="grid grid--3">
          {RATE_FIELDS.map((f) => <NumberField key={f.key} label={f.label} affix={f.affix} step="0.01" min={0} value={v[f.key]} onChange={(x) => set(f.key, x ?? 0)} error={errors[f.key]} help={base ? `Now ${formatInr(base[f.key])}` : undefined} />)}
          <NumberField label="GST / taxes" affix="%" step="0.1" min={0} max={40} value={v.gstPercent} onChange={(x) => set('gstPercent', x ?? 0)} error={errors.gstPercent} />
        </div>
        <div className="grid grid--2">
          <SelectField label="Effective" value={when} onChange={(x) => setWhen(x as 'now' | 'later')} options={[{ value: 'now', label: 'Immediately' }, { value: 'later', label: 'At a scheduled date and time' }]} />
          {when === 'later' && <TextField label="Starts at" type="datetime-local" value={toLocalInput(v.effectiveFrom)} onChange={(x) => set('effectiveFrom', fromLocalInput(x))} error={errors.effectiveFrom} />}
        </div>
        <TextArea label="Reason for the change" required rows={2} value={v.reason} onChange={(x) => set('reason', x)} error={errors.reason} help="Recorded in the price history and the audit log." />
        {large && <Notice tone="warn" title="Large price change">{large}</Notice>}
        {formError && !large && <Notice tone="danger" title={formError} />}
      </div>
    </Dialog>
  );
}

export function PricingPanel({ station, onChanged }: { station: StationDetail; onChanged: () => void }) {
  const { can } = useAuth();
  const history = useResource((s) => adminTariffService.history(station.id, s), [station.id, station.version]);
  const [edit, setEdit] = useState<{ connector: Connector | null } | null>(null);
  const [cancel, setCancel] = useState<Tariff | null>(null);
  const canWrite = can('pricing:write');
  const byId = useMemo(() => new Map(station.connectors.map((c) => [c.id, c])), [station.connectors]);
  const refresh = () => { history.reload(); onChanged(); };

  const currentColumns: Column<Connector>[] = [
    { key: 'c', header: 'Connector', render: (c) => <><div className="cell-main">{c.label}</div><div className="cell-sub">{c.type} · {c.powerKw} kW</div></> },
    { key: 'kwh', header: 'Per kWh', align: 'right', render: (c) => (history.data?.current[c.id] ? formatInr(history.data.current[c.id]!.pricePerKwh) : <Pill label="No price" tone="danger" />) },
    { key: 'min', header: 'Per minute', align: 'right', render: (c) => formatInr(history.data?.current[c.id]?.pricePerMin) },
    { key: 'ses', header: 'Per session', align: 'right', render: (c) => formatInr(history.data?.current[c.id]?.pricePerSession) },
    { key: 'park', header: 'Parking /h', align: 'right', render: (c) => formatInr(history.data?.current[c.id]?.parkingFeePerHour) },
    { key: 'idle', header: 'Idle /min', align: 'right', render: (c) => formatInr(history.data?.current[c.id]?.idleFeePerMin) },
    { key: 'gst', header: 'GST', align: 'right', render: (c) => (history.data?.current[c.id] ? `${history.data.current[c.id]!.gstPercent}%` : '—') },
    { key: 'eff', header: 'Effective from', render: (c) => <span className="muted">{formatDateTime(history.data?.current[c.id]?.effectiveFrom, true)}</span> },
  ];

  const historyColumns: Column<Tariff>[] = [
    { key: 'eff', header: 'Effective', sortValue: (t) => t.effectiveFrom, render: (t) => formatDateTime(t.effectiveFrom, true) },
    { key: 'scope', header: 'Applies to', render: (t) => (t.connectorId ? byId.get(t.connectorId)?.label ?? t.connectorId : 'All connectors') },
    { key: 'chg', header: 'Per kWh', render: (t) => <span className="num">{t.previous ? <><span className="muted">{formatInr(t.previous.pricePerKwh)}</span> → </> : null}<span className="strong">{formatInr(t.pricePerKwh)}</span></span> },
    { key: 'by', header: 'Changed by', render: (t) => <><div>{t.createdByName}</div><div className="cell-sub">{formatDateTime(t.createdAt, true)}</div></> },
    { key: 'why', header: 'Reason', render: (t) => <span className="soft">{t.reason}</span> },
    { key: 'state', header: 'State', render: (t) => <Pill label={t.state} tone={STATE_TONE[t.state]} /> },
  ];

  return (
    <div className="stack">
      <AsyncView resource={history} skeleton="detail">
        {(h) => (
          <>
            <Card>
              <CardHeader title="Current tariff" subtitle="What each connector charges right now (including GST)." actions={canWrite && station.connectors.length > 0 && <Button icon="pencil" label="Change price for all" variant="secondary" onClick={() => setEdit({ connector: null })} />} />
              <div style={{ marginTop: 12 }}>
                {station.connectors.length === 0 ? <CardBody><p className="muted">Add connectors first, then set their prices.</p></CardBody> : (
                  <DataTable caption="Current tariff per connector" columns={currentColumns} rows={station.connectors} rowKey={(c) => c.id} pageSize={50}
                    actions={canWrite ? (c) => <Button small variant="ghost" label="Change price" onClick={() => setEdit({ connector: c })} /> : undefined} />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Price history" subtitle="Every change, newest first. Nothing is ever overwritten." />
              <div style={{ marginTop: 12 }}>
                <DataTable caption="Price history" columns={historyColumns} rows={h.items} rowKey={(t) => t.id} pageSize={10}
                  actions={canWrite ? (t) => (t.state === 'scheduled' ? <Button small variant="ghost-danger" label="Cancel" onClick={() => setCancel(t)} /> : null) : undefined} />
              </div>
            </Card>
            {edit && <TariffDialog station={station} connector={edit.connector} current={h} onClose={() => setEdit(null)} onSaved={refresh} />}
          </>
        )}
      </AsyncView>
      <Card tone="warn" pad>
        <h3 className="section-title" style={{ color: 'var(--po-color-amber)' }}>Pricing safeguards</h3>
        <p className="soft" style={{ lineHeight: 1.5 }}>Every change needs a reason and is attributed to you. A change of more than 50 % asks for a second confirmation, and a price cannot start in the past, so sessions that were already billed always match their tariff.</p>
      </Card>
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} title="Cancel the scheduled price?" tone="danger" confirmLabel="Cancel scheduled price" minReason={3} successMessage="Scheduled price cancelled"
        body={cancel && `The change to ${formatInr(cancel.pricePerKwh)}/kWh that starts ${formatDateTime(cancel.effectiveFrom, true)} will not take effect.`}
        onConfirm={async (reason) => { await adminTariffService.cancelScheduled(cancel!.id, reason); refresh(); }} />
    </div>
  );
}
