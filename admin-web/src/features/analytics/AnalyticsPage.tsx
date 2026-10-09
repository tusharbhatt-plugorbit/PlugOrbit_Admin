import { useUrlState } from '@/hooks/useUrlState';
import { useResource } from '@/hooks/useResource';
import type { Analytics, AnalyticsKpis } from '@/api/types';
import { formatInr, formatInrCompact, formatKwh, formatNumber, formatPct, formatShortDate } from '@/domain/format';
import { adminAnalyticsService } from '@/services/adminAnalyticsService';
import { AsyncView, BarList, Card, CardBody, CardHeader, ChartCard, ColumnChart, Icon, KpiCard, LineChart, Notice, Segmented, usePageMeta } from '@/ui';

type Range = '7d' | '30d' | '90d';

function delta(cur: number | null | undefined, prev: number | null | undefined, goodWhenUp = true): { text: string; tone: 'up' | 'down' | 'neutral' } {
  if (cur === null || cur === undefined || prev === null || prev === undefined || prev === 0) return { text: 'no complete earlier period to compare', tone: 'neutral' };
  const pct = Math.round((1000 * (cur - prev)) / prev) / 10;
  const good = goodWhenUp ? pct >= 0 : pct <= 0;
  return { text: `${pct >= 0 ? '+' : ''}${pct}% vs previous period`, tone: pct === 0 ? 'neutral' : good ? 'up' : 'down' };
}

function Body({ a, range }: { a: Analytics; range: Range }) {
  const k: AnalyticsKpis = a.kpis;
  const p = a.previous;
  const sessions = delta(k.successfulSessions, p.successfulSessions);
  const gmv = delta(k.gmv, p.gmv);
  const users = delta(k.activeUsers, p.activeUsers);
  const points = a.series.map((d) => ({ label: formatShortDate(d.date), full: formatShortDate(d.date), value: d.sessions }));
  const gmvPoints = a.series.map((d) => ({ label: formatShortDate(d.date), full: formatShortDate(d.date), value: d.gmv }));

  return (
    <>
      <div className="grid grid--4">
        <KpiCard label="Successful sessions" value={formatNumber(k.successfulSessions)} note={sessions.text} noteTone={sessions.tone} />
        <KpiCard label="GMV" value={formatInrCompact(k.gmv)} note={gmv.text} noteTone={gmv.tone} />
        <KpiCard label="PlugOrbit revenue" value={formatInrCompact(k.platformRevenue)} note="Fee on revenue-share partners" />
        <KpiCard label="Active users" value={formatNumber(k.activeUsers)} note={users.text} noteTone={users.tone} />
      </div>

      <div className="grid grid--2">
        <ChartCard title="Sessions per day" subtitle={`Started in the last ${range.replace('d', ' days')}`} points={points} valueHeader="Sessions" format={formatNumber}>
          <LineChart points={points} format={formatNumber} ariaLabel="Charging sessions started per day" />
        </ChartCard>
        <ChartCard title="GMV per day" subtitle="Collected by PlugOrbit (integrated sessions)" points={gmvPoints} valueHeader="GMV" format={(v) => formatInr(v, { whole: true })}>
          <ColumnChart points={gmvPoints} format={(v) => formatInrCompact(v)} ariaLabel="GMV collected per day" />
        </ChartCard>
      </div>

      <div className="grid grid--4">
        <KpiCard label="Revenue per session" value={formatInr(k.revenuePerSession)} note="GMV ÷ paid integrated sessions" />
        <KpiCard label="Payment failure rate" value={formatPct(k.paymentFailureRatePct, 1)} note={delta(k.paymentFailureRatePct, p.paymentFailureRatePct, false).text} noteTone={delta(k.paymentFailureRatePct, p.paymentFailureRatePct, false).tone} />
        <KpiCard label="Fault rate" value={formatPct(k.faultRatePct, 1)} note="Sessions that failed" />
        <KpiCard label="Refunds" value={formatNumber(k.refundCount)} note={`${formatInr(k.refundValue, { whole: true })} refunded`} />
        <KpiCard label="Station utilisation" value={formatPct(k.stationUtilisationPct, 1)} note="Charging time ÷ available time" />
        <KpiCard label="Partner retention" value={formatPct(k.partnerRetentionPct)} note="Active last period and this one" />
        <KpiCard label="Repeat users" value={formatNumber(k.repeatUsers)} note={`of ${formatNumber(k.activeUsers)} active users`} />
        <KpiCard label="Energy delivered" value={formatKwh(k.energyKwh)} note={`${formatNumber(k.attemptedSessions)} sessions attempted`} />
      </div>

      <div className="grid grid--2">
        <Card>
          <CardHeader title="GMV by partner" subtitle="Where the money comes from. One colour: partners are not ranked by shade." />
          <CardBody><BarList ariaLabel="GMV by partner" rows={a.byPartner.filter((r) => r.gmv > 0).map((r) => ({ label: r.partnerName, sub: `${r.sessions} sessions`, value: r.gmv }))} format={(v) => formatInrCompact(v)} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Sessions by connector type" />
          <CardBody><BarList ariaLabel="Sessions by connector type" rows={a.byConnectorType.map((r) => ({ label: r.type, value: r.sessions }))} format={formatNumber} /></CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Not measured yet" subtitle="These need data the apps don't send yet. They are left blank rather than estimated." />
        <CardBody>
          <div className="checklist">
            {a.unavailable.map((u) => (
              <div key={u.id} className="checklist__item"><span className="icon-tile" style={{ width: 36, height: 36 }}><Icon name="hourglass" size={18} /></span><span className="grow"><div className="strong">{u.label}</div><div className="caption">{u.reason}</div></span></div>
            ))}
          </div>
        </CardBody>
      </Card>
    </>
  );
}

export default function AnalyticsPage() {
  usePageMeta('Analytics', 'Sessions, revenue and reliability (Phase 2)');
  const [f, setF] = useUrlState({ range: '30d' });
  const range = (['7d', '30d', '90d'] as const).includes(f.range as Range) ? (f.range as Range) : '30d';
  const res = useResource((s) => adminAnalyticsService.summary(range, s), [range]);
  return (
    <>
      <div className="row row--between">
        <Segmented label="Date range" value={range} onChange={(r) => setF({ range: r })} options={[{ value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }, { value: '90d', label: 'Last 90 days' }]} />
        <span className="caption">Every number below is computed from sessions and stations in the database.</span>
      </div>
      <Notice tone="info" title="Phase 2 module">Kept deliberately simple in Phase 1: the essentials that can be measured honestly today. Funnel and wait-time metrics arrive with app event tracking.</Notice>
      <AsyncView resource={res} skeleton="cards">{(a) => <Body a={a} range={range} />}</AsyncView>
    </>
  );
}
