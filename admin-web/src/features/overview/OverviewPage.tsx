import { Link, useNavigate } from 'react-router-dom';
import { useShellOverview } from '@/app/ShellData';
import type { Overview } from '@/api/types';
import { formatInrCompact, formatNumber, formatPct, formatShortDate, plural } from '@/domain/format';
import { timeAgo } from '@/domain/trust';
import { Button, Card, CardBody, CardHeader, EmptyState, Icon, KpiCard, LineChart, Meter, Pill, AsyncView, usePageMeta } from '@/ui';
import { useNow } from '@/hooks/useNow';

function healthTone(pct: number | null): 'lime' | 'warn' | 'danger' {
  if (pct === null) return 'lime';
  return pct >= 90 ? 'lime' : pct >= 70 ? 'warn' : 'danger';
}

function HealthRow({ label, value, pct, caption }: { label: string; value: string; pct?: number | null; caption?: string }) {
  const tone = healthTone(pct ?? null);
  return (
    <div className="stack stack--sm">
      <div className="row row--between"><span className="muted">{label}</span><span className="strong num" style={{ color: tone === 'lime' ? 'var(--po-color-lime-dark)' : tone === 'warn' ? 'var(--po-color-amber)' : 'var(--po-color-danger)' }}>{value}</span></div>
      {pct !== undefined && pct !== null && <Meter value={pct} tone={tone} label={label} />}
      {caption && <span className="caption">{caption}</span>}
    </div>
  );
}

function Body({ o }: { o: Overview }) {
  const now = useNow();
  const navigate = useNavigate();
  const k = o.kpis;
  const change = (v: number | null) => (v === null ? 'no previous week' : `${v >= 0 ? '+' : ''}${v}% vs last week`);
  return (
    <>
      <div className="grid grid--4">
        <KpiCard label="Live stations" value={formatNumber(k.liveStations)} note={`${k.onlineStations} online · ${k.totalStations} in total`} onClick={() => navigate('/stations')} />
        <KpiCard label="Charging sessions (7 days)" value={formatNumber(k.sessions7d)} note={change(k.sessionsChangePct)} noteTone={k.sessionsChangePct === null ? 'neutral' : k.sessionsChangePct >= 0 ? 'up' : 'down'} onClick={() => navigate('/transactions')} />
        <KpiCard label="GMV (7 days)" value={formatInrCompact(k.gmv7d)} note={change(k.gmvChangePct)} noteTone={k.gmvChangePct === null ? 'neutral' : k.gmvChangePct >= 0 ? 'up' : 'down'} onClick={() => navigate('/transactions')} />
        <KpiCard label="Open issues" value={formatNumber(k.openIssues)} note={k.highPriority > 0 ? `${k.highPriority} high priority` : 'none high priority'} noteTone={k.highPriority > 0 ? 'bad' : 'up'} onClick={() => navigate('/support')} />
      </div>

      <div className="grid grid--split">
        <Card>
          <CardHeader title="Needs attention" subtitle="Most urgent first. Each item opens where you can fix it." />
          <CardBody>
            {o.attention.length === 0 ? (
              <EmptyState compact icon="circle-check" title="Nothing needs you right now" body="No urgent tickets, critical data issues or failed payments." />
            ) : (
              <div className="checklist">
                {o.attention.map((a, i) => (
                  <Link key={`${i}-${a.href}-${a.title}`} to={a.href} className="checklist__item" style={{ color: 'inherit', textDecoration: 'none' }}>
                    <span className={`icon-tile ${a.severity === 'critical' ? 'icon-tile--danger' : a.severity === 'warning' ? 'icon-tile--warn' : 'icon-tile--info'}`} style={{ width: 36, height: 36 }}>
                      <Icon name={a.severity === 'critical' ? 'circle-alert' : a.severity === 'warning' ? 'alert' : 'info'} size={18} />
                    </span>
                    <span className="grow"><div className="strong">{a.title}</div><div className="caption">{a.detail}</div></span>
                    <Pill label={a.severity} tone={a.severity === 'critical' ? 'danger' : a.severity === 'warning' ? 'amber' : 'info'} />
                    <Icon name="chevron-right" size={18} color="var(--po-color-placeholder)" />
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Operational health" subtitle="Last 7 days" />
          <CardBody>
            <div className="stack stack--lg">
              <HealthRow label="Live data feeds" value={formatPct(o.health.liveFeedsPct)} pct={o.health.liveFeedsPct} caption="Feed-connected stations whose data is Live right now" />
              <HealthRow label="Payment success" value={formatPct(o.health.paymentSuccessPct, 1)} pct={o.health.paymentSuccessPct} />
              <HealthRow label="Station data fresh" value={formatPct(o.health.stationDataFreshPct)} pct={o.health.stationDataFreshPct} />
              <div className="row row--between"><span className="muted">Offline stations</span><span className="strong num" style={{ color: o.health.offlineStations ? 'var(--po-color-danger)' : 'var(--po-color-lime-dark)' }}>{o.health.offlineStations}</span></div>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid--split">
        <Card>
          <CardHeader title="Charging sessions" subtitle="Started per day, last 7 days" />
          <CardBody>
            <LineChart ariaLabel="Charging sessions started per day over the last 7 days" format={formatNumber}
              points={o.trend.map((t) => ({ label: formatShortDate(t.date), value: t.sessions }))} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Recent admin activity" actions={<Link to="/audit-log" className="caption" style={{ fontWeight: 800 }}>Audit log</Link>} />
          <CardBody>
            {o.recentActivity.length === 0 ? (
              <EmptyState compact icon="scroll" title="No activity to show" body="Audit entries appear here for roles that may read the audit log." />
            ) : (
              <div className="checklist">
                {o.recentActivity.map((e) => (
                  <div key={e.id} className="checklist__item">
                    <span className="grow"><div className="strong">{e.actionLabel}</div><div className="caption">{e.entityLabel ?? e.entityId} · {e.actor.name}</div></span>
                    <span className="caption nowrap">{timeAgo(e.at, now)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

export default function OverviewPage() {
  usePageMeta('Admin Overview', "Today's PlugOrbit operations at a glance");
  const overview = useShellOverview();
  const now = useNow();
  return (
    <>
      <div className="page__bar">
        <span className="caption">{overview.data ? `Updated ${timeAgo(overview.data.generatedAt, now)}` : ' '}</span>
        <Button small variant="secondary" icon="refresh" label="Refresh" onClick={overview.reload} loading={overview.refreshing} />
      </div>
      <AsyncView resource={overview} skeleton="cards">{(o) => <Body o={o} />}</AsyncView>
      <span className="sr-only">{plural(overview.data?.attention.length ?? 0, 'item')} need attention</span>
    </>
  );
}
