import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Amenity, IntegrationMethod, SessionMode, StationDetail, StationInput } from '@/api/types';
import { AMENITY, INTEGRATION_METHOD, REVIEW_STATE } from '@/domain/labels';
import { useResource } from '@/hooks/useResource';
import { adminConfigService } from '@/services/adminConfigService';
import { adminStationService } from '@/services/adminStationService';
import { AsyncView, Button, Card, CardBody, CardHeader, Chip, Field, IconButton, NumberField, Notice, PageHeader, SelectField, TextArea, TextField, usePageMeta } from '@/ui';
import { MapPanel } from '../map/MapPanel';
import { useSave } from '../common/useSave';

const EMPTY: StationInput = {
  name: '', partnerId: '', address: '', city: '', state: '', latitude: NaN, longitude: NaN, hours: '24x7', accessInstructions: '', photos: [], amenities: [],
  parkingInfo: '', sessionMode: 'integrated', integrationMethod: 'api', operatorInstructions: '', verification: 'unverified',
};
const AMENITIES = ['open_24x7', 'food', 'cafe', 'restroom', 'parking', 'shopping', 'wifi', 'lounge', 'shade'] as const satisfies readonly Amenity[];

export default function StationFormPage() {
  const { stationId } = useParams();
  usePageMeta(stationId ? 'Edit station' : 'Add station', 'Location, access details and how its data arrives');
  const resource = useResource((s) => (stationId ? adminStationService.get(stationId, s) : Promise.resolve(undefined)), [stationId]);
  if (!stationId) return <StationForm />;
  return <AsyncView resource={resource} skeleton="detail">{(s) => (s ? <StationForm station={s} /> : null)}</AsyncView>;
}

function StationForm({ station }: { station?: StationDetail }) {
  const navigate = useNavigate();
  const isNew = !station;
  const [v, setV] = useState<StationInput>(() => (station ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (station as unknown as Record<string, unknown>)[k] ?? (EMPTY as unknown as Record<string, unknown>)[k]])) } as StationInput : EMPTY));
  const [photo, setPhoto] = useState('');
  const { saving, errors, conflict, formError, run, clearError } = useSave();
  const lookups = useResource((s) => adminConfigService.lookups(s), []);
  const set = <K extends keyof StationInput>(k: K, val: StationInput[K]) => { setV((s) => ({ ...s, [k]: val })); clearError(k as string); };
  const err = (k: keyof StationInput) => errors[k as string] ?? null;
  const hasPin = Number.isFinite(v.latitude) && Number.isFinite(v.longitude);
  const photoOk = /^https:\/\/\S+$/.test(photo.trim());

  const save = async () => {
    const body: StationInput = { ...v, accessInstructions: v.accessInstructions || null, parkingInfo: v.parkingInfo || null, operatorInstructions: v.sessionMode === 'external' ? v.operatorInstructions || null : null };
    const saved = await run(() => (isNew ? adminStationService.create(body) : adminStationService.update(station!.id, body, station!.version)), isNew ? 'Station created as a draft' : 'Station saved');
    if (saved) navigate(`/stations/${saved.id}`);
  };

  return (
    <>
      <PageHeader back={{ to: station ? `/stations/${station.id}` : '/stations', label: station ? station.name : 'All stations' }} />
      {conflict && <Notice tone="warn" title="Someone else changed this station while you were editing" actions={<Button small variant="secondary" label="Reload" onClick={() => window.location.reload()} />}>Reload to see their changes, then re-apply yours.</Notice>}
      {formError && !conflict && <Notice tone="danger" title={formError} />}
      {(isNew || station?.publication === 'draft') && <Notice tone="info" title="Not visible in the app yet">A station stays hidden from drivers until you mark it live from its station page, once the go-live checklist is complete.</Notice>}

      <div className="grid grid--split-even" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card>
            <CardHeader title="Station information" />
            <CardBody>
              <div className="stack">
                <TextField label="Station name" required value={v.name} onChange={(x) => set('name', x)} error={err('name')} placeholder="ChargeZone Neemrana" />
                <SelectField label="Partner" required value={v.partnerId} onChange={(x) => set('partnerId', x)} error={err('partnerId')} placeholder="Choose a partner"
                  options={(lookups.data?.partners ?? []).map((p) => ({ value: p.id, label: p.status === 'active' ? p.name : `${p.name} (${p.status.replace('_', ' ')})` }))}
                  help="Only active partners can have stations go live." />
                <TextField label="Address" required value={v.address} onChange={(x) => set('address', x)} error={err('address')} />
                <div className="grid grid--2">
                  <TextField label="City" required value={v.city} onChange={(x) => set('city', x)} error={err('city')} />
                  <TextField label="State" required value={v.state} onChange={(x) => set('state', x)} error={err('state')} />
                </div>
                <TextField label="Operating hours" required value={v.hours} onChange={(x) => set('hours', x)} error={err('hours')} help="“24x7” or a range like 06:00-23:00" />
                <TextArea label="Access instructions" value={v.accessInstructions} onChange={(x) => set('accessInstructions', x)} error={err('accessInstructions')} rows={3} placeholder="Where to enter, which bays are EV bays, any gate or security notes" />
                <TextArea label="Parking information" value={v.parkingInfo} onChange={(x) => set('parkingInfo', x)} error={err('parkingInfo')} rows={2} placeholder="Free while charging? Time limits? Height restrictions?" />
                <Field label="Amenities" help="Shown to drivers in the app.">
                  {() => <div className="chips">{AMENITIES.map((a) => <Chip key={a} label={AMENITY[a]} selected={v.amenities.includes(a)} onClick={() => set('amenities', v.amenities.includes(a) ? v.amenities.filter((x) => x !== a) : [...v.amenities, a])} />)}</div>}
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="How it works" subtitle="Decides whether PlugOrbit can start and charge for sessions here." />
            <CardBody>
              <div className="stack">
                <div className="grid grid--2">
                  <SelectField label="Sessions" value={v.sessionMode} onChange={(x: SessionMode) => set('sessionMode', x)} options={[{ value: 'integrated', label: 'Integrated (PlugOrbit starts and charges)' }, { value: 'external', label: 'External (operator’s own app / payment)' }]} />
                  <SelectField label="Data source" value={v.integrationMethod} onChange={(x: IntegrationMethod) => set('integrationMethod', x)} options={(Object.keys(INTEGRATION_METHOD) as IntegrationMethod[]).map((k) => ({ value: k, label: INTEGRATION_METHOD[k] }))} help="Manual data is never shown as Live." />
                </div>
                {v.sessionMode === 'external' && <TextArea label="Operator instructions" required value={v.operatorInstructions} onChange={(x) => set('operatorInstructions', x)} error={err('operatorInstructions')} rows={3} help="The app shows this to drivers. PlugOrbit never pretends to control an external charger." />}
                <SelectField label="Verification status" value={v.verification} onChange={(x) => set('verification', x)} options={(Object.keys(REVIEW_STATE) as StationInput['verification'][]).map((k) => ({ value: k, label: REVIEW_STATE[k] }))} help="A station must be verified before it can go live." />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Photos" subtitle="https links to files in private storage or a CDN. Never public KYC or bank documents." />
            <CardBody>
              <div className="stack">
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <TextField className="grow" label="Photo link" value={photo} onChange={setPhoto} placeholder="https://…" error={photo && !photoOk ? 'Must be an https:// link' : null} />
                  <Button variant="secondary" label="Add" disabled={!photoOk || v.photos.length >= 8} onClick={() => { set('photos', [...v.photos, photo.trim()]); setPhoto(''); }} />
                </div>
                {err('photos') && <div className="field__error">{err('photos')}</div>}
                {v.photos.map((p) => (
                  <div key={p} className="row"><img src={p} alt="" width={56} height={40} style={{ objectFit: 'cover', borderRadius: 8, background: 'var(--po-color-slate-soft)' }} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /><span className="grow truncate mono">{p}</span><IconButton small icon="trash" label="Remove photo" onClick={() => set('photos', v.photos.filter((x) => x !== p))} /></div>
                ))}
              </div>
            </CardBody>
          </Card>

          <div className="row row--end">
            <Button variant="secondary" label="Cancel" onClick={() => navigate(station ? `/stations/${station.id}` : '/stations')} />
            <Button icon="save" label={isNew ? 'Create draft station' : 'Save changes'} loading={saving} onClick={save} />
          </div>
        </div>

        <div className="stack" style={{ position: 'sticky', top: 84 }}>
          <Card>
            <CardHeader title="Location" subtitle="Click the map or drag the pin. Or type the coordinates." />
            <CardBody>
              <div className="stack">
                <MapPanel short legend={false} pick={{ lat: hasPin ? v.latitude : null, lng: hasPin ? v.longitude : null, onChange: (lat, lng) => { set('latitude', lat); set('longitude', lng); } }} />
                <div className="grid grid--2">
                  <NumberField label="Latitude" step="any" value={Number.isFinite(v.latitude) ? v.latitude : null} onChange={(x) => set('latitude', x ?? NaN)} error={err('latitude')} />
                  <NumberField label="Longitude" step="any" value={Number.isFinite(v.longitude) ? v.longitude : null} onChange={(x) => set('longitude', x ?? NaN)} error={err('longitude')} />
                </div>
                {!hasPin && <p className="caption">No pin yet. A station without a pin cannot go live.</p>}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
