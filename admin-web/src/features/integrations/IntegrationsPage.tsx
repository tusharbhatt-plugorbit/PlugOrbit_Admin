import { useState } from 'react';
import type { IntegrationItem, IntegrationTest } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { timeAgo } from '@/domain/trust';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { adminIntegrationService } from '@/services/adminIntegrationService';
import { useGoogleMaps } from '../map/useGoogleMaps';
import { AsyncView, Button, Card, CardBody, CardHeader, Drawer, Icon, KeyValue, Notice, Pill, TextArea, TextField, Toggle, useToast, usePageMeta } from '@/ui';
import type { Tone } from '@/domain/labels';

const CONNECTION: Record<IntegrationItem['connection'], { label: string; tone: Tone }> = {
  connected: { label: 'Connected', tone: 'lime' }, disconnected: { label: 'Disconnected', tone: 'danger' }, not_configured: { label: 'Not configured', tone: 'amber' },
  unknown: { label: 'Not verified here', tone: 'slate' }, later: { label: 'Later', tone: 'slate' },
};
const HEALTH: Record<IntegrationItem['health'], { label: string; tone: Tone }> = {
  healthy: { label: 'Healthy', tone: 'lime' }, degraded: { label: 'Degraded', tone: 'amber' }, down: { label: 'Down', tone: 'danger' }, unknown: { label: 'No data', tone: 'slate' },
};
const MODE: Record<IntegrationItem['mode'], string> = {
  live: 'Live check', derived: 'From your data', simulated: 'Simulated (demo)', client: 'Checked in your browser', not_wired: 'Not built yet',
};

/** The browser is the only place that can tell whether the Maps key works, so overlay that onto the server's answer. */
function useWithClientChecks(items: IntegrationItem[]): IntegrationItem[] {
  const maps = useGoogleMaps();
  return items.map((i) => {
    if (i.key !== 'maps_sdk') return i;
    if (maps.status === 'ready') return { ...i, connection: 'connected', health: 'healthy', error: null, detail: 'The Maps JavaScript API loaded in this browser.' };
    if (maps.status === 'error') return { ...i, connection: 'disconnected', health: 'down', error: maps.message };
    if (maps.status === 'missing-key') return { ...i, connection: 'not_configured', health: 'unknown', error: 'VITE_GOOGLE_MAPS_API_KEY is not set for this build.' };
    return { ...i, detail: 'Checking…' };
  });
}

function Row({ i, onConfigure, onTest, testing, now }: { i: IntegrationItem; onConfigure: () => void; onTest: () => void; testing: boolean; now: number }) {
  const c = CONNECTION[i.connection], h = HEALTH[i.health];
  return (
    <div className="checklist__item" style={{ alignItems: 'center' }}>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row row--wrap" style={{ gap: 8 }}><span className="strong">{i.name}</span><Pill label={c.label} tone={c.tone} dot={i.connection === 'connected'} />{i.connection !== 'later' && i.connection !== 'not_configured' && <Pill label={h.label} tone={h.tone} />}{!i.enabled && <Pill label="Disabled" tone="slate" />}</div>
        <div className="caption">{i.desc} · <span title="How this status was determined">{MODE[i.mode]}</span>{i.lastSyncAt ? ` · last sync ${timeAgo(i.lastSyncAt, now)}` : ''}</div>
        {i.detail && !i.error && <div className="caption">{i.detail}</div>}
        {i.error && <div className="caption" style={{ color: 'var(--po-color-danger)', fontWeight: 700, marginTop: 2 }}>{i.error}</div>}
      </div>
      <div className="row" style={{ flex: 'none' }}>
        {i.mode !== 'not_wired' && i.mode !== 'client' && <Button small variant="ghost" label="Test" icon="refresh" loading={testing} onClick={onTest} />}
        <Button small variant="secondary" label="Configure" onClick={onConfigure} />
      </div>
    </div>
  );
}

function ConfigureDrawer({ item, onClose, onSaved }: { item: IntegrationItem; onClose: () => void; onSaved: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const [enabled, setEnabled] = useState(item.enabled);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [rows, setRows] = useState<[string, string][]>(Object.entries(item.settings));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const write = can('integrations:write');

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await adminIntegrationService.update(item.key, { enabled, notes, settings: Object.fromEntries(rows.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v])) });
      toast.success('Integration settings saved');
      onSaved();
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); } finally { setBusy(false); }
  };

  return (
    <Drawer open onClose={onClose} title={item.name} subtitle={item.group}
      footer={<><Button variant="secondary" label="Close" onClick={onClose} />{write && <Button label="Save" loading={busy} onClick={save} />}</>}>
      <Card pad>
        <p style={{ lineHeight: 1.5 }}>{item.desc}</p>
        <div style={{ marginTop: 6 }}>
          <KeyValue label="Status" value={<span className="pill-group"><Pill label={CONNECTION[item.connection].label} tone={CONNECTION[item.connection].tone} /><Pill label={HEALTH[item.health].label} tone={HEALTH[item.health].tone} /></span>} />
          <KeyValue label="How we know" value={MODE[item.mode]} />
        </div>
      </Card>
      <Notice tone="info" title="How to set this up">{item.hint}</Notice>
      {item.secretNames.length > 0 && (
        <Card pad>
          <h3 className="section-title"><Icon name="lock" size={16} /> Secrets</h3>
          <p className="caption" style={{ marginBottom: 8 }}>Keys and tokens live in Secret Manager, never in this app, its database or the browser. They are shown here by name only.</p>
          {item.secretNames.map((n) => <div key={n} className="kv"><span>{n}</span><span className="pill pill--slate">••••••••</span></div>)}
        </Card>
      )}
      <Card pad>
        <h3 className="section-title">Settings</h3>
        <div className="stack">
          <Toggle checked={enabled} onChange={setEnabled} disabled={!write} title="Enabled" description="Turn the integration off without removing its settings." />
          <div className="stack stack--sm">
            <span className="field__label">Non-secret settings</span>
            {rows.map(([k, v], idx) => (
              <div key={idx} className="row">
                <TextField className="grow" value={k} onChange={(x) => setRows((r) => r.map((e, j) => (j === idx ? [x, e[1]] : e)))} placeholder="name (e.g. region)" disabled={!write} />
                <TextField className="grow" value={v} onChange={(x) => setRows((r) => r.map((e, j) => (j === idx ? [e[0], x] : e)))} placeholder="value" disabled={!write} />
                {write && <Button small variant="ghost-danger" label="Remove" onClick={() => setRows((r) => r.filter((_, j) => j !== idx))} />}
              </div>
            ))}
            {write && <div><Button small variant="secondary" icon="plus" label="Add setting" onClick={() => setRows((r) => [...r, ['', '']])} /></div>}
            <span className="caption">Anything that looks like a secret (key, token, password) is refused by the server.</span>
          </div>
          <TextArea label="Notes" value={notes} onChange={setNotes} rows={3} disabled={!write} />
          {err && <Notice tone="danger" title={err} />}
        </div>
      </Card>
    </Drawer>
  );
}

export default function IntegrationsPage() {
  usePageMeta('Integrations', 'Charging networks, maps, payments and messaging');
  const { can } = useAuth();
  const toast = useToast();
  const now = useNow();
  const res = useResource((s) => adminIntegrationService.list(s), []);
  const [open, setOpen] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const items = useWithClientChecks(res.data?.items ?? []);
  const byGroup = new Map<string, IntegrationItem[]>();
  items.forEach((i) => byGroup.set(i.group, [...(byGroup.get(i.group) ?? []), i]));

  const test = async (key: string) => {
    setTesting(key);
    try {
      const r: IntegrationTest = await adminIntegrationService.test(key);
      (r.ok ? toast.success : toast.error)(`${r.ok ? 'Looks good' : 'Check failed'}: ${r.message}`);
      res.reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Test failed'); } finally { setTesting(null); }
  };
  const selected = items.find((i) => i.key === open);

  return (
    <>
      {res.data?.gateway.simulated && <Notice tone="warn" title="Payment gateway is simulated">{res.data.gateway.name}. Refunds in this environment do not move real money.</Notice>}
      <p className="caption">Each line says how its status was determined. Anything marked &ldquo;Not built yet&rdquo; is shown as not configured rather than pretending to work.</p>
      <AsyncView resource={{ ...res, data: res.data && { ...res.data, items } }} skeleton="cards">
        {() => (
          <div className="grid grid--2" style={{ alignItems: 'start' }}>
            {[...byGroup.entries()].map(([group, list]) => (
              <Card key={group}>
                <CardHeader title={group} subtitle={`${list.filter((i) => i.connection === 'connected').length} of ${list.length} connected`} />
                <CardBody><div className="checklist">{list.map((i) => <Row key={i.key} i={i} now={now} testing={testing === i.key} onTest={() => void test(i.key)} onConfigure={() => setOpen(i.key)} />)}</div></CardBody>
              </Card>
            ))}
          </div>
        )}
      </AsyncView>
      {selected && <ConfigureDrawer key={selected.key} item={selected} onClose={() => setOpen(null)} onSaved={res.reload} />}
      {!can('integrations:write') && <p className="caption">Your role can view integrations but not change them.</p>}
    </>
  );
}
