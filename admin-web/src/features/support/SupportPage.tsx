import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Ticket, TicketCategory, TicketPriority, TicketStatus } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { TICKET_CATEGORY, TICKET_STATUS } from '@/domain/labels';
import { formatDateTime } from '@/domain/format';
import { timeAgo } from '@/domain/trust';
import { useDebounced } from '@/hooks/useDebounced';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { useUrlState } from '@/hooks/useUrlState';
import { adminConfigService } from '@/services/adminConfigService';
import { adminSupportService } from '@/services/adminSupportService';
import { AsyncView, Button, Card, Chip, DataTable, Dialog, Drawer, EmptyState, FilterBar, FilterSelect, KeyValue, KpiCard, NoResults, Notice, Pill, PriorityBadge, SearchField, SelectField, TextArea, TextField, TicketStatusBadge, useToast, usePageMeta, type Column } from '@/ui';
import { useSave } from '../common/useSave';

const CATEGORIES = Object.keys(TICKET_CATEGORY) as TicketCategory[];
const STATUSES = Object.keys(TICKET_STATUS) as TicketStatus[];
const PRIORITIES: TicketPriority[] = ['urgent', 'high', 'medium', 'low'];
const CHIPS: [string, string][] = [['active', 'Active'], ['open', 'Open'], ['in_review', 'In review'], ['waiting_user', 'Waiting for user'], ['waiting_partner', 'Waiting for partner'], ['resolved', 'Resolved'], ['closed', 'Closed'], ['', 'All']];

function CreateDialog({ initial, onClose, onCreated }: { initial: { sessionId?: string; userId?: string; stationId?: string }; onClose: () => void; onCreated: (t: Ticket) => void }) {
  const lookups = useResource((s) => adminConfigService.lookups(s), []);
  const [v, setV] = useState({ category: 'charging_issue' as TicketCategory, priority: 'medium' as TicketPriority, subject: '', description: '', sessionId: initial.sessionId ?? '', stationId: initial.stationId ?? '', userId: initial.userId ?? '' });
  const { saving, errors, formError, run } = useSave();
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((s) => ({ ...s, [k]: x }));
  const submit = async () => {
    const t = await run(() => adminSupportService.create({ category: v.category, priority: v.priority, subject: v.subject, description: v.description || undefined, sessionId: v.sessionId || undefined, stationId: v.stationId || undefined, userId: v.userId || undefined }), 'Ticket created');
    if (t) onCreated(t);
  };
  return (
    <Dialog open onClose={onClose} wide title="New support ticket" footer={<><Button variant="secondary" label="Cancel" onClick={onClose} /><Button label="Create ticket" loading={saving} disabled={v.subject.trim().length < 3} onClick={submit} /></>}>
      <div className="stack">
        {formError && <Notice tone="danger" title={formError} />}
        <div className="grid grid--2">
          <SelectField label="Category" value={v.category} onChange={(x) => set('category', x)} options={CATEGORIES.map((c) => ({ value: c, label: TICKET_CATEGORY[c] }))} />
          <SelectField label="Priority" value={v.priority} onChange={(x) => set('priority', x)} options={PRIORITIES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))} />
        </div>
        <TextField label="Subject" required value={v.subject} onChange={(x) => set('subject', x)} error={errors.subject} placeholder="What happened?" />
        <TextArea label="Details" rows={3} value={v.description} onChange={(x) => set('description', x)} />
        <div className="grid grid--2">
          <TextField label="Linked session" value={v.sessionId} onChange={(x) => set('sessionId', x.toUpperCase())} placeholder="PO-6A4K92" error={errors.sessionId} help="Fills in the station and user automatically." />
          <SelectField label="Linked station" placeholder="None" value={v.stationId} onChange={(x) => set('stationId', x)} options={(lookups.data?.stations ?? []).map((s) => ({ value: s.id, label: s.name }))} />
        </div>
      </div>
    </Dialog>
  );
}

function TicketDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { can, principal } = useAuth();
  const toast = useToast();
  const now = useNow();
  const detail = useResource((s) => adminSupportService.get(id, s), [id]);
  const lookups = useResource((s) => adminConfigService.lookups(s), []);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const t = detail.data;
  const write = can('support:write');

  const patch = async (body: Parameters<typeof adminSupportService.update>[1]) => {
    try { detail.set(await adminSupportService.update(id, { ...body, expectedVersion: t?.version })); onChanged(); toast.success('Ticket updated'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not update'); }
  };
  const addNote = async () => {
    setBusy(true);
    try { detail.set(await adminSupportService.addNote(id, note.trim())); setNote(''); onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not add the note'); } finally { setBusy(false); }
  };

  return (
    <Drawer open onClose={onClose} wide title={t ? `${t.id} · ${t.subject}` : 'Ticket'} subtitle={t ? `${t.categoryLabel} · opened ${timeAgo(t.createdAt, now)}` : undefined}>
      <AsyncView resource={detail} skeleton="detail">
        {(x) => (
          <>
            <Card pad>
              <div className="row row--wrap"><TicketStatusBadge status={x.status} /><PriorityBadge priority={x.priority} />{x.slaBreached && <Pill label="SLA breached" tone="danger" icon="clock" />}</div>
              {x.description && <p style={{ marginTop: 10, lineHeight: 1.5 }}>{x.description}</p>}
              <div style={{ marginTop: 6 }}>
                <KeyValue label="Linked session" value={x.sessionId ? <Link to={`/transactions/${x.sessionId}`}>{x.sessionId}</Link> : '—'} />
                <KeyValue label="Linked station" value={x.stationId ? <Link to={`/stations/${x.stationId}`}>{x.stationName}</Link> : '—'} />
                <KeyValue label="User" value={x.userId ? <Link to={`/users?user=${x.userId}`}>{x.userName} · {x.userPhone}</Link> : '—'} />
                <KeyValue label="Owner" value={x.ownerName ?? 'Unassigned'} />
                <KeyValue label="Response due" value={x.slaDueAt ? `${formatDateTime(x.slaDueAt)}${x.slaBreached ? ' (overdue)' : ''}` : '—'} />
              </div>
            </Card>
            {write && (
              <Card pad>
                <h3 className="section-title">Update</h3>
                <div className="grid grid--2" style={{ marginTop: 8 }}>
                  <SelectField label="Status" value={x.status} onChange={(v) => void patch({ status: v })} options={STATUSES.map((s) => ({ value: s, label: TICKET_STATUS[s].label }))} />
                  <SelectField label="Priority" value={x.priority} onChange={(v) => void patch({ priority: v })} options={PRIORITIES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))} />
                  <SelectField label="Owner" value={x.ownerId ?? ''} placeholder="Unassigned" onChange={(v) => void (v ? patch({ ownerId: v }) : patch({ unassign: true }))} options={(lookups.data?.admins ?? []).map((a) => ({ value: a.id, label: a.name }))} />
                  <SelectField label="Category" value={x.category} onChange={(v) => void patch({ category: v })} options={CATEGORIES.map((c) => ({ value: c, label: TICKET_CATEGORY[c] }))} />
                </div>
                {x.ownerId !== principal?.uid && <div style={{ marginTop: 10 }}><Button small variant="secondary" label="Assign to me" onClick={() => void patch({ ownerId: principal!.uid })} /></div>}
              </Card>
            )}
            <Card pad>
              <h3 className="section-title">Internal notes</h3>
              <p className="caption">Only admins see these. They are never shown to the driver.</p>
              <div className="stack" style={{ marginTop: 10 }}>
                {(x.notes ?? []).length === 0 && <span className="muted">No notes yet.</span>}
                {(x.notes ?? []).map((n) => <div key={n.id} style={{ background: 'var(--po-color-input-bg)', borderRadius: 12, padding: '10px 12px' }}><div>{n.body}</div><div className="caption" style={{ marginTop: 4 }}>{n.byName} · {timeAgo(n.at, now)}</div></div>)}
                {write && <><TextArea value={note} onChange={setNote} rows={2} placeholder="Add an internal note…" /><div className="row row--end"><Button small label="Add note" loading={busy} disabled={!note.trim()} onClick={addNote} /></div></>}
              </div>
            </Card>
          </>
        )}
      </AsyncView>
    </Drawer>
  );
}

export default function SupportPage() {
  usePageMeta('Support & Issues', 'Tickets and issue management');
  const navigate = useNavigate();
  const { can, principal } = useAuth();
  const now = useNow();
  const [f, setF] = useUrlState({ q: '', status: 'active', category: '', priority: '', owner: '', ticket: '', new: '', session: '', user: '' });
  const q = useDebounced(f.q);
  const ownerId = f.owner === 'me' ? principal?.uid : f.owner;
  const list = useResource((s) => adminSupportService.list({ q, status: f.status, category: f.category, priority: f.priority, ownerId }, s), [q, f.status, f.category, f.priority, f.owner]);
  const lookups = useResource((s) => adminConfigService.lookups(s), []);
  const sum = list.data?.summary;
  const filtered = !!(f.q || f.category || f.priority || f.owner || f.status !== 'active');

  const columns: Column<Ticket>[] = [
    { key: 'id', header: 'Ticket', sortValue: (t) => t.id, render: (t) => <><div className="cell-main">{t.id}</div><div className="cell-sub truncate" style={{ maxWidth: 240 }}>{t.subject}</div></> },
    { key: 'cat', header: 'Category', render: (t) => t.categoryLabel },
    { key: 'session', header: 'Session', render: (t) => (t.sessionId ? <Link to={`/transactions/${t.sessionId}`} onClick={(e) => e.stopPropagation()} className="mono">{t.sessionId}</Link> : <span className="muted">—</span>) },
    { key: 'station', header: 'Station', render: (t) => t.stationName ?? <span className="muted">—</span> },
    { key: 'user', header: 'User', render: (t) => (t.userName ? <><div>{t.userName}</div><div className="cell-sub">{t.userPhone}</div></> : <span className="muted">—</span>) },
    { key: 'prio', header: 'Priority', sortValue: (t) => PRIORITIES.indexOf(t.priority), render: (t) => <PriorityBadge priority={t.priority} /> },
    { key: 'status', header: 'Status', sortValue: (t) => t.status, render: (t) => <div className="stack stack--sm" style={{ alignItems: 'flex-start' }}><TicketStatusBadge status={t.status} />{t.slaBreached && <Pill label="SLA breached" tone="danger" icon="clock" />}</div> },
    { key: 'owner', header: 'Owner', sortValue: (t) => t.ownerName ?? '~', render: (t) => t.ownerName ?? <span className="muted">Unassigned</span> },
    { key: 'upd', header: 'Updated', sortValue: (t) => t.updatedAt, render: (t) => <span className="muted nowrap">{timeAgo(t.updatedAt, now)}</span> },
  ];

  return (
    <>
      <div className="grid grid--4">
        <KpiCard label="Open tickets" value={sum?.open ?? '—'} note="Not yet resolved" />
        <KpiCard label="High priority" value={sum?.urgent ?? '—'} note="Urgent or high" noteTone={sum && sum.urgent > 0 ? 'bad' : 'up'} />
        <KpiCard label="Response overdue" value={sum?.breached ?? '—'} note="Past their SLA" noteTone={sum && sum.breached > 0 ? 'bad' : 'up'} />
        <KpiCard label="Unassigned" value={sum?.unassigned ?? '—'} note="Nobody owns these yet" noteTone={sum && sum.unassigned > 0 ? 'warn' : 'up'} />
      </div>
      <FilterBar>
        <SearchField value={f.q} onChange={(v) => setF({ q: v })} placeholder="Search ticket, subject, session, station" />
        <div className="chips" role="group" aria-label="Status">{CHIPS.map(([v, l]) => <Chip key={v || 'all'} label={l} selected={f.status === v} onClick={() => setF({ status: v })} />)}</div>
      </FilterBar>
      <FilterBar>
        <div className="filterbar__selects">
          <FilterSelect label="Any category" value={f.category} onChange={(v) => setF({ category: v })} options={CATEGORIES.map((c) => ({ value: c, label: TICKET_CATEGORY[c] }))} />
          <FilterSelect label="Any priority" value={f.priority} onChange={(v) => setF({ priority: v })} options={PRIORITIES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))} />
          <FilterSelect label="Any owner" value={f.owner} onChange={(v) => setF({ owner: v })} options={[{ value: 'me', label: 'Assigned to me' }, { value: 'unassigned', label: 'Unassigned' }, ...(lookups.data?.admins ?? []).map((a) => ({ value: a.id, label: a.name }))]} />
        </div>
        <span className="grow" />
        {can('support:write') && <Button icon="plus" label="New ticket" onClick={() => setF({ new: '1' })} />}
      </FilterBar>
      <Card>
        <AsyncView resource={list} isEmpty={(d) => d.items.length === 0}
          empty={filtered ? <NoResults what="tickets" onClear={() => setF({ q: '', status: 'active', category: '', priority: '', owner: '' })} /> : <EmptyState icon="lifebuoy" title="No open tickets" body="Nothing needs support right now." />}>
          {(d) => <DataTable caption="Support tickets" columns={columns} rows={d.items} rowKey={(t) => t.id} selectedKey={f.ticket || null} onRowClick={(t) => setF({ ticket: t.id })} pageSize={20} />}
        </AsyncView>
      </Card>
      {f.ticket && <TicketDrawer id={f.ticket} onClose={() => setF({ ticket: '' })} onChanged={list.reload} />}
      {f.new && can('support:write') && <CreateDialog initial={{ sessionId: f.session, userId: f.user }} onClose={() => setF({ new: '', session: '', user: '' })} onCreated={(t) => { list.reload(); navigate(`/support?ticket=${t.id}`, { replace: true }); }} />}
    </>
  );
}
