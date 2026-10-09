import { useState } from 'react';
import type { NotificationInput, NotificationItem, NotificationKind } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { formatDateTime } from '@/domain/format';
import { timeAgo } from '@/domain/trust';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { useUrlState } from '@/hooks/useUrlState';
import { adminConfigService } from '@/services/adminConfigService';
import { adminNotificationService } from '@/services/adminNotificationService';
import { AsyncView, Button, Card, CardBody, Chip, ConfirmDialog, DataTable, Dialog, EmptyState, FilterBar, Field, NoResults, Notice, Pill, SelectField, TextArea, TextField, usePageMeta, type Column } from '@/ui';
import { useSave } from '../common/useSave';

const KINDS: Record<NotificationKind, string> = {
  service_message: 'Service message', charger_outage: 'Charger outage notice', payment: 'Payment notification', support: 'Support notification',
  route_alert: 'Route / station alert', faq: 'FAQ', banner: 'Banner',
};
const CHANNELS = [['in_app', 'In-app'], ['push', 'Push'], ['email', 'Email'], ['sms', 'SMS']] as const;
const AUDIENCE = [['all_users', 'All users'], ['station_followers', 'Followers of the station'], ['affected_users', 'Users affected']] as const;

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const lookups = useResource((s) => adminConfigService.lookups(s), []);
  const [v, setV] = useState<NotificationInput>({ kind: 'service_message', title: '', body: '', channels: ['in_app'], audience: 'all_users', stationId: null, startsAt: null, endsAt: null });
  const { saving, errors, formError, run } = useSave();
  const set = <K extends keyof NotificationInput>(k: K, x: NotificationInput[K]) => setV((s) => ({ ...s, [k]: x }));
  const submit = async () => { if (await run(() => adminNotificationService.create(v), 'Saved as a draft')) { onDone(); onClose(); } };
  const needsStation = v.kind === 'charger_outage' || v.kind === 'route_alert';
  return (
    <Dialog open onClose={onClose} wide title="New operational message" footer={<><Button variant="secondary" label="Cancel" onClick={onClose} /><Button label="Save draft" loading={saving} disabled={v.title.trim().length < 3 || v.body.trim().length < 3} onClick={submit} /></>}>
      <div className="stack">
        {formError && <Notice tone="danger" title={formError} />}
        <div className="grid grid--2">
          <SelectField label="Type" value={v.kind} onChange={(x) => set('kind', x)} options={(Object.keys(KINDS) as NotificationKind[]).map((k) => ({ value: k, label: KINDS[k] }))} />
          <SelectField label="Audience" value={v.audience} onChange={(x) => set('audience', x)} options={AUDIENCE.map(([value, label]) => ({ value, label }))} />
        </div>
        {needsStation && <SelectField label="Station" required value={v.stationId ?? ''} placeholder="Choose a station" onChange={(x) => set('stationId', x || null)} error={errors.stationId} options={(lookups.data?.stations ?? []).map((s) => ({ value: s.id, label: s.name }))} />}
        <TextField label="Title" required value={v.title} onChange={(x) => set('title', x)} error={errors.title} maxLength={100} />
        <TextArea label="Message" required rows={4} value={v.body} onChange={(x) => set('body', x)} error={errors.body} help="Plain, short and useful. Say what is affected and what the driver should do." />
        <Field label="Channels">
          {() => <div className="chips">{CHANNELS.map(([c, l]) => <Chip key={c} label={l} selected={v.channels.includes(c)} onClick={() => set('channels', v.channels.includes(c) ? (v.channels.length > 1 ? v.channels.filter((x) => x !== c) : v.channels) : [...v.channels, c])} />)}</div>}
        </Field>
        {v.channels.some((c) => c !== 'in_app') && <Notice tone="warn" title="Push, email and SMS are not connected yet">Publishing records the message for the app to show. Delivery over these channels arrives with the messaging integrations.</Notice>}
      </div>
    </Dialog>
  );
}

export default function NotificationsPage() {
  usePageMeta('Notifications & Content', 'Service messages and charger outage notices (Phase 2)');
  const { can } = useAuth();
  const now = useNow();
  const [f, setF] = useUrlState({ status: '' });
  const list = useResource((s) => adminNotificationService.list({ status: f.status }, s), [f.status]);
  const [creating, setCreating] = useState(false);
  const [publish, setPublish] = useState<NotificationItem | null>(null);
  const write = can('notifications:write');

  const columns: Column<NotificationItem>[] = [
    { key: 'title', header: 'Message', sortValue: (n) => n.title, render: (n) => <><div className="cell-main">{n.title}</div><div className="cell-sub truncate" style={{ maxWidth: 360 }}>{n.body}</div></> },
    { key: 'kind', header: 'Type', render: (n) => KINDS[n.kind] },
    { key: 'ch', header: 'Channels', render: (n) => <span className="pill-group">{n.channels.map((c) => <Pill key={c} label={c.replace('_', '-')} />)}</span> },
    { key: 'status', header: 'Status', sortValue: (n) => n.status, render: (n) => <Pill label={n.status} tone={n.status === 'published' ? 'lime' : n.status === 'draft' ? 'amber' : 'slate'} dot /> },
    { key: 'upd', header: 'Updated', sortValue: (n) => n.updatedAt, render: (n) => <span className="muted nowrap" title={formatDateTime(n.updatedAt, true)}>{timeAgo(n.updatedAt, now)}</span> },
  ];

  return (
    <>
      <FilterBar>
        <div className="chips" role="group" aria-label="Status">{[['', 'All'], ['draft', 'Drafts'], ['published', 'Published']].map(([v, l]) => <Chip key={v || 'all'} label={l} selected={f.status === v} onClick={() => setF({ status: v })} />)}</div>
        <span className="grow" />
        {write && <Button icon="plus" label="New message" onClick={() => setCreating(true)} />}
      </FilterBar>
      <div className="grid grid--split" style={{ alignItems: 'start' }}>
        <Card>
          <AsyncView resource={list} isEmpty={(d) => d.items.length === 0}
            empty={f.status ? <NoResults what="messages" onClear={() => setF({ status: '' })} /> : <EmptyState icon="megaphone" title="No messages yet" body="Create a service message, a charger outage notice, an FAQ or a banner." action={write && <Button icon="plus" label="New message" onClick={() => setCreating(true)} />} />}>
            {(d) => <DataTable caption="Notifications" columns={columns} rows={d.items} rowKey={(n) => n.id} pageSize={20} actions={write ? (n) => (n.status === 'draft' ? <Button small label="Publish" onClick={() => setPublish(n)} /> : null) : undefined} />}
          </AsyncView>
        </Card>
        <div className="stack">
          <Card tone="info" pad>
            <h2 className="card__title">Operational only</h2>
            <p className="soft" style={{ marginTop: 6, lineHeight: 1.5 }}>Service messages, outage notices, payment and support notifications, route alerts, FAQs and banners. They tell drivers something they need to know.</p>
          </Card>
          <Card pad>
            <h2 className="card__title">Marketing is separate</h2>
            <p className="muted" style={{ marginTop: 6, lineHeight: 1.5 }}>{list.data?.marketing.note ?? 'Marketing campaigns, partner offers and promotions are a later module.'}</p>
            <div style={{ marginTop: 8 }}><Pill label="Later" tone="slate" /></div>
          </Card>
          <Card><CardBody><Notice tone="warn" title="Delivery is not connected yet">Publishing makes a message available to the apps. Push, email and SMS sending are Phase 2 integrations (see Integrations).</Notice></CardBody></Card>
        </div>
      </div>
      {creating && <CreateDialog onClose={() => setCreating(false)} onDone={list.reload} />}
      <ConfirmDialog open={!!publish} onClose={() => setPublish(null)} title={`Publish “${publish?.title}”?`} confirmLabel="Publish" successMessage="Published"
        body="Published messages cannot be edited. Duplicate and edit a copy if something needs to change."
        onConfirm={async () => { await adminNotificationService.publish(publish!.id); list.reload(); }} />
    </>
  );
}
