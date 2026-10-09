import { useMemo, useState } from 'react';
import type { AuditEntry } from '@/api/types';
import { formatDateTime } from '@/domain/format';
import { timeAgo } from '@/domain/trust';
import { useDebounced } from '@/hooks/useDebounced';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { useUrlState } from '@/hooks/useUrlState';
import { adminAuditService, type AuditVerification } from '@/services/adminAuditService';
import { AsyncView, Button, Card, Chip, DataTable, Diff, Drawer, EmptyState, FilterBar, FilterSelect, KeyValue, NoResults, Notice, Pill, SearchField, useToast, usePageMeta, type Column } from '@/ui';

const CATEGORIES = [['', 'All'], ['money', 'Money'], ['pricing', 'Pricing'], ['station', 'Stations'], ['partner', 'Partners'], ['user', 'Users'], ['platform', 'Platform'], ['access', 'Sign-ins'], ['support', 'Support'], ['data', 'Data'], ['content', 'Content']] as const;
const RANGES = [['', 'All time'], ['1', 'Last 24 hours'], ['7', 'Last 7 days'], ['30', 'Last 30 days']] as const;
const PAGE = 200;

function EntryDrawer({ e, onClose }: { e: AuditEntry; onClose: () => void }) {
  return (
    <Drawer open onClose={onClose} wide title={e.actionLabel} subtitle={`#${e.seq} · ${formatDateTime(e.at, true)}`}>
      <Card pad>
        <KeyValue label="Actor" value={`${e.actor.name} (${e.actor.role.replace('_', ' ')})`} />
        <KeyValue label="Email" value={e.actor.email ?? '—'} />
        <KeyValue label="Entity" value={`${e.entityLabel ?? e.entityId} · ${e.entityType}`} />
        <KeyValue label="Reason" value={e.reason ?? '—'} />
        <KeyValue label="Source" value={e.source} />
        <KeyValue label="Request ID" value={<span className="mono">{e.requestId}</span>} />
      </Card>
      {(e.before || e.after) ? <Card pad><h3 className="section-title">What changed</h3><Diff before={e.before} after={e.after} /></Card> : <Notice tone="info" title="No before/after values for this action." />}
      <Card pad>
        <h3 className="section-title">Tamper-evidence</h3>
        <p className="caption" style={{ marginBottom: 6 }}>Each entry&apos;s hash covers its content and the previous entry&apos;s hash. Changing or removing any past entry breaks every hash after it.</p>
        <KeyValue label="Hash" value={<span className="mono" style={{ wordBreak: 'break-all' }}>{e.hash}</span>} />
        <KeyValue label="Previous hash" value={<span className="mono" style={{ wordBreak: 'break-all' }}>{e.prevHash}</span>} />
      </Card>
    </Drawer>
  );
}

export default function AuditLogPage() {
  usePageMeta('Audit Log', 'Every sensitive change, traceable and tamper-evident');
  const toast = useToast();
  const now = useNow();
  const [f, setF] = useUrlState({ q: '', category: '', action: '', actor: '', range: '', entry: '' });
  const q = useDebounced(f.q);
  const actor = useDebounced(f.actor);
  const query = () => ({ q, category: f.category, action: f.action, actor, since: f.range ? Date.now() - Number(f.range) * 86_400_000 : undefined, limit: PAGE });
  const page = useResource((s) => adminAuditService.list(query(), s), [q, f.category, f.action, actor, f.range]);
  const catalog = useResource((s) => adminAuditService.catalog(s), []);
  const [more, setMore] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<number | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [verify, setVerify] = useState<AuditVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  const next = cursor === undefined ? page.data?.nextBeforeSeq ?? null : cursor;
  const rows = useMemo(() => [...(page.data?.items ?? []), ...more], [page.data, more]);
  const filtered = !!(f.q || f.category || f.action || f.actor || f.range);

  const loadMore = async () => {
    if (!next) return;
    setLoadingMore(true);
    try {
      const r = await adminAuditService.list({ ...query(), beforeSeq: next });
      setMore((m) => [...m, ...r.items]);
      setCursor(r.nextBeforeSeq);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not load more'); } finally { setLoadingMore(false); }
  };
  const check = async () => {
    setVerifying(true);
    try { setVerify(await adminAuditService.verify()); } catch (e) { toast.error(e instanceof Error ? e.message : 'Verification failed'); } finally { setVerifying(false); }
  };
  const reset = () => { setMore([]); setCursor(undefined); };
  const sel = rows.find((e) => e.id === f.entry) ?? null;

  const columns: Column<AuditEntry>[] = [
    { key: 'time', header: 'When', sortValue: (e) => e.at, render: (e) => <><div>{formatDateTime(e.at, true)}</div><div className="cell-sub">{timeAgo(e.at, now)}</div></> },
    { key: 'actor', header: 'Actor', sortValue: (e) => e.actor.name, render: (e) => <><div className="cell-main">{e.actor.name}</div><div className="cell-sub">{e.actor.role.replace('_', ' ')}</div></> },
    { key: 'action', header: 'Action', render: (e) => <><div className="cell-main">{e.actionLabel}</div><div className="cell-sub mono">{e.action}</div></> },
    { key: 'entity', header: 'Entity', render: (e) => <><div>{e.entityLabel ?? e.entityId}</div><div className="cell-sub">{e.entityType}</div></> },
    { key: 'change', header: 'Before → after', render: (e) => (e.before || e.after ? <span className="caption" style={{ color: 'var(--po-color-ink-soft)' }}>{Object.keys(e.after ?? e.before ?? {}).slice(0, 3).join(', ')}</span> : <span className="muted">—</span>) },
    { key: 'reason', header: 'Reason', render: (e) => (e.reason ? <span className="soft">{e.reason}</span> : <span className="muted">—</span>) },
    { key: 'cat', header: 'Type', render: (e) => <Pill label={e.category} /> },
  ];

  return (
    <>
      <FilterBar>
        <SearchField value={f.q} onChange={(v) => { setF({ q: v }); reset(); }} placeholder="Search action, entity, reason" />
        <div className="chips" role="group" aria-label="Category">{CATEGORIES.map(([v, l]) => <Chip key={v || 'all'} label={l} selected={f.category === v} onClick={() => { setF({ category: v }); reset(); }} />)}</div>
      </FilterBar>
      <FilterBar>
        <div className="filterbar__selects">
          <select className="select" aria-label="Date range" value={f.range} onChange={(e) => { setF({ range: e.target.value }); reset(); }}>{RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <FilterSelect label="Any action" value={f.action} onChange={(v) => { setF({ action: v }); reset(); }} options={(catalog.data ?? []).map((a) => ({ value: a.action, label: a.label }))} />
          <input className="input input--sm" style={{ width: 200, borderRadius: 999, height: 36, fontSize: 13 }} aria-label="Filter by admin" placeholder="Admin name or email" value={f.actor} onChange={(e) => { setF({ actor: e.target.value }); reset(); }} />
        </div>
        <span className="grow" />
        <Button variant="secondary" icon="shield" label="Verify integrity" loading={verifying} onClick={check} />
      </FilterBar>
      {verify && (verify.ok
        ? <Notice tone="lime" title={`Audit log verified: ${verify.checked} entries, none altered or removed`}>Head hash <span className="mono">{verify.headHash?.slice(0, 16)}…</span></Notice>
        : <Notice tone="danger" title="The audit log has been tampered with">Entry #{verify.firstBadSeq}: {verify.reason} Treat everything from this point on as untrusted and investigate.</Notice>)}
      <Card>
        <AsyncView resource={{ ...page, data: page.data && { ...page.data, items: rows } }} isEmpty={(d) => d.items.length === 0}
          empty={filtered ? <NoResults what="audit entries" onClear={() => { setF({ q: '', category: '', action: '', actor: '', range: '' }); reset(); }} /> : <EmptyState icon="scroll" title="Nothing recorded yet" body="Sensitive changes will appear here as admins make them." />}>
          {(d) => <DataTable caption="Audit log" columns={columns} rows={d.items} rowKey={(e) => e.id} selectedKey={f.entry || null} onRowClick={(e) => setF({ entry: e.id })} pageSize={25}
            footer={next ? <Button small variant="secondary" label={`Load ${PAGE} older entries`} loading={loadingMore} onClick={loadMore} /> : <span>Start of the log</span>} />}
        </AsyncView>
      </Card>
      <p className="caption">Entries cannot be edited or deleted from this app or the API.{page.data ? ` ${page.data.total} entries match.` : ''}</p>
      {sel && <EntryDrawer e={sel} onClose={() => setF({ entry: '' })} />}
    </>
  );
}
