import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { DqActionName, DqIssue, DqSummary } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { DQ_TYPE } from '@/domain/labels';
import { formatPct } from '@/domain/format';
import { timeAgo } from '@/domain/trust';
import { useNow } from '@/hooks/useNow';
import { useResource } from '@/hooks/useResource';
import { useUrlState } from '@/hooks/useUrlState';
import { adminDataQualityService } from '@/services/adminDataQualityService';
import { AsyncView, Button, Card, Chip, ConfirmDialog, DataTable, Drawer, EmptyState, FilterBar, KeyValue, KpiCard, NoResults, Notice, Pill, SelectField, SeverityBadge, useToast, usePageMeta, type Column, type IconName } from '@/ui';

const ACTION_COPY: Record<DqActionName, { label: string; icon?: IconName; body: (i: DqIssue) => string; tone?: 'danger'; done: string }> = {
  mark_verified: {
    label: 'Mark verified', icon: 'badge-check', done: 'Marked as verified',
    body: (i) => ({
      stale_status: 'You confirm the current status is correct. Those connectors become Manual here (drivers see User-confirmed, never Live) for 12 hours, until the feed recovers.',
      no_fresh_feed: 'You confirm the current status is correct. Those connectors become Manual here (drivers see User-confirmed, never Live) for 12 hours, until the feed recovers.',
      wrong_pricing: 'You confirm this price is correct. It will not be flagged again unless the price changes.',
      duplicate_station: 'You confirm these are two different stations. They will not be flagged as duplicates again.',
    } as Record<string, string>)[i.type] ?? 'You confirm this data is correct as it is.',
  },
  downgrade_confidence: { label: 'Downgrade confidence', icon: 'trend-down', done: 'Confidence downgraded', body: () => 'The affected connectors will show Unknown to drivers for 12 hours rather than a status nobody can vouch for.' },
  hide_station: { label: 'Hide station', icon: 'eye-off', tone: 'danger', done: 'Station hidden', body: () => 'The station disappears from the app immediately. You can put it back live from its page.' },
  mark_reviewed: { label: 'Mark as reviewed', icon: 'search', done: 'Marked as reviewed', body: () => 'Acknowledges the issue so others know someone is on it. It stays open until fixed.' },
  dismiss: { label: 'Dismiss', icon: 'x', done: 'Issue dismissed', body: () => 'Close this issue without changing anything (a known and accepted situation).' },
};

function editTarget(i: DqIssue): { to: string; label: string } {
  if (i.type === 'wrong_pricing') return { to: `/stations/${i.stationId}/pricing`, label: 'Edit pricing' };
  if (i.type === 'duplicate_station') return { to: `/stations/${i.stationId}`, label: 'Open station' };
  return { to: `/stations/${i.stationId}/connectors`, label: 'Edit connectors' };
}

function IssueDrawer({ issue, onClose, onChanged }: { issue: DqIssue; onClose: () => void; onChanged: () => void }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const now = useNow();
  const toast = useToast();
  const [action, setAction] = useState<DqActionName | null>(null);
  const [merge, setMerge] = useState(false);
  const [keep, setKeep] = useState(issue.relatedStationId ?? '');
  const open = issue.status === 'open' || issue.status === 'reviewing';
  const canFix = can('dataquality:resolve');
  const edit = editTarget(issue);
  const copy = action ? ACTION_COPY[action] : null;
  const other = issue.relatedStationId && keep === issue.relatedStationId ? issue.stationId : issue.relatedStationId;
  const names = { [issue.stationId]: issue.stationName, ...(issue.relatedStationId ? { [issue.relatedStationId]: issue.relatedStationId.replace('st-', '') } : {}) };

  return (
    <Drawer open onClose={onClose} title={issue.title} subtitle={`${issue.stationName} · ${DQ_TYPE[issue.type]}`}
      footer={<Button variant="secondary" label={edit.label} icon="pencil" onClick={() => navigate(edit.to)} />}>
      <Card pad>
        <div className="row row--wrap"><SeverityBadge severity={issue.severity} /><Pill label={issue.status} tone={issue.status === 'open' ? 'danger' : issue.status === 'reviewing' ? 'amber' : 'lime'} /></div>
        <p style={{ marginTop: 10, lineHeight: 1.5 }}>{issue.detail}</p>
        <div style={{ marginTop: 6 }}>
          <KeyValue label="First detected" value={timeAgo(issue.detectedAt, now)} />
          <KeyValue label="Last seen" value={timeAgo(issue.lastSeenAt, now)} />
          <KeyValue label="Station" value={<Link to={`/stations/${issue.stationId}`}>{issue.stationName}</Link>} />
          {issue.resolution && <KeyValue label="Resolution" value={`${issue.resolution.action.replace('_', ' ')}${issue.resolution.byName ? ` by ${issue.resolution.byName}` : ''}: ${issue.resolution.reason}`} />}
        </div>
      </Card>
      <Notice tone="info" title="The app never shows estimated data as Live">Verifying or downgrading changes how a connector's status is labelled to drivers: User-confirmed (Manual here) or Unknown, never Live.</Notice>
      {open && canFix && (
        <Card pad>
          <h3 className="section-title">Fix this</h3>
          <div className="row row--wrap" style={{ marginTop: 8 }}>
            <Button icon="badge-check" label="Mark verified" onClick={() => setAction('mark_verified')} />
            {['stale_status', 'no_fresh_feed', 'conflicting_sources', 'user_fault_report'].includes(issue.type) && <Button variant="secondary" icon="trend-down" label="Downgrade confidence" onClick={() => setAction('downgrade_confidence')} />}
            {issue.type === 'duplicate_station' && can('stations:write') && <Button variant="secondary" icon="merge" label="Merge duplicate…" onClick={() => setMerge(true)} />}
            <Button variant="secondary" icon="eye-off" label="Hide station" onClick={() => setAction('hide_station')} />
            {issue.status === 'open' && <Button variant="ghost" label="Mark as reviewed" onClick={() => setAction('mark_reviewed')} />}
            <Button variant="ghost" label="Dismiss" onClick={() => setAction('dismiss')} />
          </div>
        </Card>
      )}
      <ConfirmDialog open={!!action} onClose={() => setAction(null)} title={copy?.label ?? ''} confirmLabel={copy?.label ?? ''} tone={copy?.tone ?? 'primary'} minReason={3} body={copy && copy.body(issue)} successMessage={copy?.done}
        onConfirm={async (reason) => { await adminDataQualityService.act(issue.id, { action: action!, reason }); onChanged(); onClose(); }} />
      <ConfirmDialog open={merge} onClose={() => setMerge(false)} title="Merge duplicate stations" confirmLabel="Merge stations" tone="danger" minReason={5} successMessage="Stations merged"
        body="One station survives. The other is hidden and kept for history; its connectors, sessions and tickets move to the survivor."
        extra={<SelectField label="Keep which station?" value={keep} onChange={setKeep} options={[{ value: issue.relatedStationId ?? '', label: `Older: ${names[issue.relatedStationId ?? ''] ?? issue.relatedStationId}` }, { value: issue.stationId, label: `Newer: ${issue.stationName}` }]} />}
        canConfirm={!!other && !!keep}
        onConfirm={async (reason) => { await adminDataQualityService.merge({ keepStationId: keep, mergeStationId: other!, reason }); toast.success('Merged'); onChanged(); onClose(); }} />
    </Drawer>
  );
}

export default function DataQualityPage() {
  usePageMeta('Data Quality', 'Find and fix data the app should not trust');
  const { can } = useAuth();
  const toast = useToast();
  const now = useNow();
  const [f, setF] = useUrlState({ type: '', status: 'active', severity: '', issue: '' });
  const summary = useResource<DqSummary>((s) => adminDataQualityService.summary(s), []);
  const issues = useResource((s) => adminDataQualityService.issues({ type: f.type, status: f.status === 'all' ? '' : f.status, severity: f.severity }, s), [f.type, f.status, f.severity]);
  const [scanning, setScanning] = useState(false);
  const refresh = () => { summary.reload(); issues.reload(); };

  const scan = async () => {
    setScanning(true);
    try {
      const r = await adminDataQualityService.scan();
      toast.success(`Scan finished: ${r.opened} new, ${r.autoCleared} cleared, ${r.open} open`);
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Scan failed'); } finally { setScanning(false); }
  };

  const sel = issues.data?.items.find((i) => i.id === f.issue) ?? null;
  const columns: Column<DqIssue>[] = [
    { key: 'sev', header: 'Severity', sortValue: (i) => ({ critical: 0, warning: 1, info: 2 })[i.severity], render: (i) => <SeverityBadge severity={i.severity} /> },
    { key: 'issue', header: 'Issue', render: (i) => <><div className="cell-main">{i.title}</div><div className="cell-sub" style={{ maxWidth: 460 }}>{i.detail}</div></> },
    { key: 'station', header: 'Station', sortValue: (i) => i.stationName, render: (i) => i.stationName },
    { key: 'type', header: 'Type', render: (i) => <Pill label={DQ_TYPE[i.type]} upper={false} /> },
    { key: 'seen', header: 'Last seen', sortValue: (i) => i.lastSeenAt, render: (i) => <span className="muted nowrap">{timeAgo(i.lastSeenAt, now)}</span> },
    { key: 'status', header: 'Status', render: (i) => <Pill label={i.status} tone={i.status === 'open' ? 'danger' : i.status === 'reviewing' ? 'amber' : i.status === 'dismissed' ? 'slate' : 'lime'} /> },
  ];
  const s = summary.data;

  return (
    <>
      <div className="grid grid--3">
        <KpiCard label="Station data fresh" value={formatPct(s?.freshPct ?? null)} note={s ? `${s.liveStations} live stations` : ' '} noteTone={s && s.freshPct !== null && s.freshPct < 90 ? 'warn' : 'up'} />
        <KpiCard label="Open issues" value={s?.openIssues ?? '—'} note={s ? `${s.critical} critical` : ' '} noteTone={s && s.critical > 0 ? 'bad' : 'up'} />
        <KpiCard label="Last scan" value={s?.lastScan ? timeAgo(s.lastScan.at, now) : 'Never'} note={s ? `Live ≤ ${Math.round(s.thresholds.liveSec / 60)} min · stale > ${Math.round(s.thresholds.staleSec / 60)} min` : ' '} />
      </div>
      <FilterBar>
        <div className="chips" role="group" aria-label="Issue type">
          <Chip label="All types" selected={!f.type} onClick={() => setF({ type: '' })} />
          {s?.byType.map((t) => <Chip key={t.type} label={t.label} count={t.count} selected={f.type === t.type} onClick={() => setF({ type: t.type })} />)}
        </div>
      </FilterBar>
      <FilterBar>
        <div className="chips" role="group" aria-label="Status">
          {[['active', 'Open'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed'], ['all', 'All']].map(([v, l]) => <Chip key={v} label={l} selected={f.status === v} onClick={() => setF({ status: v })} />)}
        </div>
        <div className="filterbar__selects"><select className="select" aria-label="Severity" value={f.severity} onChange={(e) => setF({ severity: e.target.value })}><option value="">Any severity</option><option value="critical">Critical</option><option value="warning">Warning</option></select></div>
        <span className="grow" />
        {can('dataquality:resolve') && <Button icon="refresh" variant="secondary" label="Run scan now" loading={scanning} onClick={scan} />}
      </FilterBar>
      <Card>
        <AsyncView resource={issues} isEmpty={(d) => d.items.length === 0}
          empty={f.type || f.severity || f.status !== 'active' ? <NoResults what="issues" onClear={() => setF({ type: '', status: 'active', severity: '' })} /> : <EmptyState icon="shield" title="No open data issues" body="Everything the scanner checks looks healthy. Run a scan to be sure." />}>
          {(d) => <DataTable caption="Data-quality issues" columns={columns} rows={d.items} rowKey={(i) => i.id} selectedKey={f.issue || null} onRowClick={(i) => setF({ issue: i.id })}
            actions={(i) => <Button small variant="secondary" label={i.status === 'open' || i.status === 'reviewing' ? 'Review' : 'View'} onClick={() => setF({ issue: i.id })} />} />}
        </AsyncView>
      </Card>
      {sel && <IssueDrawer key={sel.id + sel.status} issue={sel} onClose={() => setF({ issue: '' })} onChanged={refresh} />}
    </>
  );
}
