import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { UserDetail, UserRow } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, formatDateTime, formatInr } from '@/domain/format';
import { timeAgo } from '@/domain/trust';
import { useDebounced } from '@/hooks/useDebounced';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { useUrlState } from '@/hooks/useUrlState';
import { adminUserService } from '@/services/adminUserService';
import { ActionMenu, AsyncView, Button, Card, Chip, ConfirmDialog, DataTable, Drawer, EmptyState, FilterBar, KeyValue, NoResults, Notice, PaymentBadge, Pill, SearchField, TicketStatusBadge, usePageMeta, type Column } from '@/ui';

const STATUS = [['', 'All'], ['active', 'Active'], ['restricted', 'Restricted']] as const;

function UserDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const now = useNow();
  const detail = useResource((s) => adminUserService.get(id, s), [id]);
  const [dialog, setDialog] = useState<'restrict' | 'unrestrict' | 'reveal' | null>(null);
  const [revealed, setRevealed] = useState<{ phone: string | null; email: string | null } | null>(null);
  const update = (next: UserDetail) => { detail.set(next); onChanged(); };
  const u = detail.data;

  return (
    <Drawer open onClose={onClose} wide title={u?.displayName ?? 'User'} subtitle={u ? `Joined ${formatDate(u.createdAt)}` : undefined}
      footer={u && (
        <>
          {can('support:write') && <Button variant="secondary" icon="lifebuoy" label="Open ticket" onClick={() => navigate(`/support?new=1&user=${u.id}`)} />}
          {can('users:restrict') && (u.status === 'active' ? <Button variant="danger" icon="ban" label="Restrict account" onClick={() => setDialog('restrict')} /> : <Button icon="user-check" label="Remove restriction" onClick={() => setDialog('unrestrict')} />)}
        </>
      )}>
      <AsyncView resource={detail} skeleton="detail">
        {(x) => (
          <>
            {x.status === 'restricted' && x.restriction && <Notice tone="danger" title="Account restricted">{x.restriction.reason}. By {x.restriction.byName}, {formatDateTime(x.restriction.at, true)}.</Notice>}
            <Card pad>
              <div className="row row--wrap"><Pill label={x.status} tone={x.status === 'active' ? 'lime' : 'danger'} dot />{x.unpaidIntegratedSessions > 0 && <Pill label={`${x.unpaidIntegratedSessions} unpaid integrated`} tone="amber" icon="alert" />}</div>
              <div style={{ marginTop: 6 }}>
                <KeyValue label="Phone" value={revealed ? <span className="mono">{revealed.phone ?? '—'}</span> : x.phoneMasked ?? '—'} />
                <KeyValue label="Email" value={revealed ? <span className="mono">{revealed.email ?? '—'}</span> : x.emailMasked ?? '—'} />
                <KeyValue label="Vehicles" value={x.vehicles.length ? x.vehicles.map((v) => `${v.label} (${v.connector})`).join(', ') : '—'} />
                <KeyValue label="Sessions" value={x.sessionCount} />
                <KeyValue label="Spend (net of refunds)" value={formatInr(x.spend)} />
                <KeyValue label="Last session" value={timeAgo(x.lastSessionAt, now)} />
              </div>
              {can('users:reveal') && !revealed && <div style={{ marginTop: 10 }}><Button small variant="secondary" icon="eye" label="Reveal contact details" onClick={() => setDialog('reveal')} /></div>}
              {revealed && <p className="caption" style={{ marginTop: 8 }}>Revealed for this view only. The access is recorded in the audit log.</p>}
            </Card>
            <Card pad>
              <h3 className="section-title">Recent sessions</h3>
              {x.recentSessions.length === 0 ? <p className="muted">No sessions yet.</p> : x.recentSessions.map((s) => (
                <Link key={s.id} to={`/transactions/${s.id}`} className="kv" style={{ color: 'inherit' }}>
                  <span><span className="mono strong">{s.id}</span> <span className="muted">{s.stationName}</span><div className="caption">{formatDateTime(s.startedAt)}</div></span>
                  <span className="row"><span className="strong">{formatInr(s.grossAmount)}</span><PaymentBadge status={s.paymentStatus} /></span>
                </Link>
              ))}
              {can('transactions:read') && <div style={{ marginTop: 8 }}><Button small variant="ghost" label="See all sessions" onClick={() => navigate(`/transactions?q=${x.id}`)} /></div>}
            </Card>
            {x.tickets.length > 0 && <Card pad><h3 className="section-title">Support tickets</h3>{x.tickets.map((t) => <Link key={t.id} to={`/support?ticket=${t.id}`} className="kv" style={{ color: 'inherit' }}><span><span className="strong">{t.id}</span> {t.subject}</span><TicketStatusBadge status={t.status} /></Link>)}</Card>}
            {x.restrictionHistory.length > 0 && (
              <Card pad><h3 className="section-title">Restriction history</h3>
                {x.restrictionHistory.map((h) => <div key={`${h.at}-${h.action}`} className="kv"><span><span className="strong" style={{ textTransform: 'capitalize' }}>{h.action}</span> <span className="muted">by {h.byName}</span><div className="caption">{h.reason}</div></span><span className="caption nowrap">{formatDateTime(h.at, true)}</span></div>)}
              </Card>
            )}
            <ConfirmDialog open={dialog === 'restrict'} onClose={() => setDialog(null)} title={`Restrict ${x.displayName}?`} tone="danger" confirmLabel="Restrict account" minReason={5} successMessage="Account restricted"
              reasonHelp="Recorded with your name and the time. The driver may be told this reason by support."
              body="The account is flagged as restricted and the change is audited. The driver app and payment flow read this flag to block new sessions. Existing sessions and history are unaffected."
              onConfirm={async (reason) => update(await adminUserService.restrict(x.id, reason))} />
            <ConfirmDialog open={dialog === 'unrestrict'} onClose={() => setDialog(null)} title={`Remove the restriction on ${x.displayName}?`} confirmLabel="Remove restriction" minReason={5} successMessage="Restriction removed"
              body="The restriction flag is cleared and the change is audited. The driver can start charging sessions again." onConfirm={async (reason) => update(await adminUserService.unrestrict(x.id, reason))} />
            <ConfirmDialog open={dialog === 'reveal'} onClose={() => setDialog(null)} title="Reveal contact details" confirmLabel="Reveal" minReason={5} reasonLabel="Why do you need them?" successMessage="Contact details revealed"
              body="Phone and email are masked by default to protect the driver's privacy. Revealing them is recorded in the audit log with your reason."
              onConfirm={async (reason) => setRevealed(await adminUserService.reveal(x.id, reason))} />
          </>
        )}
      </AsyncView>
    </Drawer>
  );
}

export default function UsersPage() {
  usePageMeta('Users', 'Driver accounts, with personal data minimised');
  const { can } = useAuth();
  const now = useNow();
  const [f, setF] = useUrlState({ q: '', status: '', unpaid: '', user: '' });
  const q = useDebounced(f.q);
  const list = useResource((s) => adminUserService.list({ q, status: f.status, unpaid: f.unpaid === '1' }, s), [q, f.status, f.unpaid]);
  const filtered = !!(f.q || f.status || f.unpaid);
  const navigate = useNavigate();

  const columns: Column<UserRow>[] = [
    { key: 'user', header: 'User', sortValue: (u) => u.displayName, render: (u) => <><div className="cell-main">{u.displayName}</div><div className="cell-sub">{u.phoneMasked} · {u.emailMasked}</div></> },
    { key: 'veh', header: 'Vehicles', render: (u) => (u.vehicles.length ? u.vehicles.map((v) => v.label).join(', ') : <span className="muted">—</span>) },
    { key: 'sess', header: 'Sessions', align: 'right', sortValue: (u) => u.sessionCount, render: (u) => u.sessionCount },
    { key: 'spend', header: 'Spend', align: 'right', sortValue: (u) => u.spend, render: (u) => formatInr(u.spend) },
    { key: 'status', header: 'Account', sortValue: (u) => u.status, render: (u) => <Pill label={u.status} tone={u.status === 'active' ? 'lime' : 'danger'} dot /> },
    { key: 'tickets', header: 'Support issues', align: 'right', sortValue: (u) => u.openTickets, render: (u) => (u.openTickets ? <span className="strong">{u.openTickets} open</span> : <span className="muted">None</span>) },
    { key: 'unpaid', header: 'Unpaid integrated', align: 'right', sortValue: (u) => u.unpaidIntegratedSessions, render: (u) => (u.unpaidIntegratedSessions ? <span className="strong" style={{ color: 'var(--po-color-amber)' }}>{u.unpaidIntegratedSessions}</span> : <span className="muted">0</span>) },
    { key: 'last', header: 'Last session', sortValue: (u) => u.lastSessionAt ?? 0, render: (u) => <span className="muted nowrap">{timeAgo(u.lastSessionAt, now)}</span> },
  ];

  return (
    <>
      <Notice tone="info" title="Personal data is minimised" icon="shield">Phone numbers and emails are masked by the server. Support can reveal them for a specific reason, and every reveal is recorded in the audit log.</Notice>
      <FilterBar>
        <SearchField value={f.q} onChange={(v) => setF({ q: v })} placeholder="Find by user ID, exact email, phone, or name" />
        <div className="chips" role="group" aria-label="Account status">
          {STATUS.map(([v, l]) => <Chip key={v || 'all'} label={l} selected={f.status === v} onClick={() => setF({ status: v })} />)}
          <Chip label="Unpaid integrated sessions" selected={f.unpaid === '1'} onClick={() => setF({ unpaid: f.unpaid === '1' ? '' : '1' })} />
        </div>
      </FilterBar>
      <Card>
        <AsyncView resource={list} isEmpty={(d) => d.items.length === 0}
          empty={filtered ? <NoResults what="users" onClear={() => setF({ q: '', status: '', unpaid: '' })} /> : <EmptyState icon="users" title="No users yet" body="Driver accounts appear here once people sign up in the app." />}>
          {(d) => <DataTable caption="Users" columns={columns} rows={d.items} rowKey={(u) => u.id} selectedKey={f.user || null} onRowClick={(u) => setF({ user: u.id })} pageSize={20}
            actions={(u) => (
              <span className="row row--end">
                <Button small variant="secondary" label="View profile" onClick={() => setF({ user: u.id })} />
                <ActionMenu items={[
                  { label: 'See session history', icon: 'receipt-text', hidden: !can('transactions:read'), onClick: () => navigate(`/transactions?q=${u.id}`) },
                  { label: 'Open ticket', icon: 'lifebuoy', hidden: !can('support:write'), onClick: () => navigate(`/support?new=1&user=${u.id}`) },
                ]} />
              </span>
            )} />}
        </AsyncView>
      </Card>
      {f.user && <UserDrawer key={f.user} id={f.user} onClose={() => setF({ user: '' })} onChanged={list.reload} />}
    </>
  );
}
