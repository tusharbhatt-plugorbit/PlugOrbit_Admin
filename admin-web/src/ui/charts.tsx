/**
 * Charts, built to the data-viz rules in docs/DESIGN_SYSTEM.md:
 *  - every chart here is SINGLE-SERIES in the brand accent (limeDark, validated >= 3:1 on white);
 *    no dual axes: measures with different units are separate charts
 *  - thin marks (2px line, bars <= 24px with a 4px rounded data end), hairline solid grid
 *  - >= 8px end dot with a 2px surface ring; area is a ~10 % wash
 *  - values are labelled selectively (the end point / the tip); the rest live in the tooltip
 *    (also on keyboard focus) and in a table view, so nothing is gated behind hover
 *  - chart text uses text tokens, never the series colour
 */
import { useId, useMemo, useState, type ReactNode } from 'react';

export interface ChartPoint { label: string; value: number; /** shown in the tooltip/table when the axis label is shortened */ full?: string }

/** Round a max up to a clean number and return evenly spaced clean ticks (0, 250, 500 ...). */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

const W = 640;
const H = 220;
const PAD = { l: 48, r: 28, t: 16, b: 30 };

function Tooltip({ leftPct, label, value, topPct }: { leftPct: number; label: string; value: string; topPct: number }) {
  return (
    <div role="status" style={{ position: 'absolute', left: `${leftPct}%`, top: `${topPct}%`, transform: 'translate(-50%, calc(-100% - 12px))', pointerEvents: 'none', zIndex: 3 }}>
      <div style={{ background: 'var(--po-color-bg)', color: 'var(--po-color-surface)', borderRadius: 10, padding: '7px 11px', boxShadow: 'var(--po-shadow-2)', whiteSpace: 'nowrap' }}>
        <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="4" aria-hidden="true"><line x1="0" y1="2" x2="14" y2="2" stroke="var(--po-color-lime)" strokeWidth="2.5" strokeLinecap="round" /></svg>
          {value}
        </div>
        <div style={{ fontSize: 12, color: 'var(--po-color-placeholder)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

/** Single-series trend. The crosshair snaps to the nearest X; keyboard focus shows the same readout. */
export function LineChart({ points, format = (v) => String(v), ariaLabel, endLabel = true }: { points: ChartPoint[]; format?: (v: number) => string; ariaLabel: string; endLabel?: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const ticks = useMemo(() => niceTicks(Math.max(...points.map((p) => p.value), 0)), [points]);
  const top = ticks[ticks.length - 1];
  const x = (i: number) => PAD.l + (n <= 1 ? 0.5 : i / (n - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = n > 1 ? `${line} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : '';
  const labelEvery = n > 12 ? Math.ceil(n / 6) : 1;
  const nearest = (clientX: number, el: SVGSVGElement) => {
    const box = el.getBoundingClientRect();
    const vx = ((clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - vx) < Math.abs(x(best) - vx)) best = i;
    return best;
  };
  const a = active === null ? null : points[active];

  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}
        onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget))} onPointerLeave={() => setActive(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart__grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text className="chart__axis" x={PAD.l - 10} y={y(t) + 4} textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {points.map((p, i) => i % labelEvery === 0 && (
          <text key={p.label + i} className="chart__axis" x={x(i)} y={H - 8} textAnchor="middle">{p.label}</text>
        ))}
        {area && <path className="chart__area" d={area} />}
        {n > 1 && <path className="chart__line" d={line} />}
        {a && <line className="chart__grid" x1={x(active!)} x2={x(active!)} y1={PAD.t} y2={H - PAD.b} style={{ stroke: 'var(--po-color-placeholder)' }} />}
        {n > 0 && <circle className="chart__dot" cx={x(a ? active! : n - 1)} cy={y(points[a ? active! : n - 1].value)} r={5} />}
        {endLabel && n > 0 && !a && (
          <text className="chart__value" x={x(n - 1)} y={y(points[n - 1].value) - 12} textAnchor="end">{format(points[n - 1].value)}</text>
        )}
        {points.map((p, i) => (
          <circle key={`hit-${i}`} cx={x(i)} cy={y(p.value)} r={14} fill="transparent" tabIndex={0}
            aria-label={`${p.full ?? p.label}: ${format(p.value)}`} onFocus={() => setActive(i)} onBlur={() => setActive(null)} style={{ outline: 'none' }} />
        ))}
      </svg>
      {a && <Tooltip leftPct={(x(active!) / W) * 100} topPct={(y(a.value) / H) * 100} label={a.full ?? a.label} value={format(a.value)} />}
    </div>
  );
}

/** Single-series columns (<= 24px wide, 4px rounded top, 2px gap), one hover target per column. */
export function ColumnChart({ points, format = (v) => String(v), ariaLabel }: { points: ChartPoint[]; format?: (v: number) => string; ariaLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const ticks = useMemo(() => niceTicks(Math.max(...points.map((p) => p.value), 0)), [points]);
  const top = ticks[ticks.length - 1];
  const slot = (W - PAD.l - PAD.r) / Math.max(n, 1);
  const bw = Math.min(24, slot - 2);
  const x = (i: number) => PAD.l + slot * i + (slot - bw) / 2;
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
  const baseline = y(0);
  const labelEvery = n > 14 ? Math.ceil(n / 7) : 1;
  const a = active === null ? null : points[active];

  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart__grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text className="chart__axis" x={PAD.l - 10} y={y(t) + 4} textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const h = Math.max(0, baseline - y(p.value));
          const r = Math.min(4, bw / 2, h);
          // 4px rounded data end, square at the baseline
          const d = h <= 0 ? '' : `M${x(i)},${baseline} V${baseline - h + r} Q${x(i)},${baseline - h} ${x(i) + r},${baseline - h} H${x(i) + bw - r} Q${x(i) + bw},${baseline - h} ${x(i) + bw},${baseline - h + r} V${baseline} Z`;
          return (
            <g key={p.label + i}>
              {d && <path d={d} className="chart__bar" style={{ opacity: active === null || active === i ? 1 : 0.55 }} />}
              <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" tabIndex={0}
                aria-label={`${p.full ?? p.label}: ${format(p.value)}`} onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)} onBlur={() => setActive(null)} style={{ outline: 'none' }} />
              {i % labelEvery === 0 && <text className="chart__axis" x={x(i) + bw / 2} y={H - 8} textAnchor="middle">{p.label}</text>}
            </g>
          );
        })}
      </svg>
      {a && <Tooltip leftPct={((x(active!) + bw / 2) / W) * 100} topPct={(y(a.value) / H) * 100} label={a.full ?? a.label} value={format(a.value)} />}
    </div>
  );
}

/** Horizontal bars for ranked categories: one colour (nominal categories are never value-ramped),
 *  value at the tip, bars <= 24px with a 4px rounded data end. */
export function BarList({ rows, format = (v) => String(v), ariaLabel, max }: { rows: { label: string; value: number; sub?: string }[]; format?: (v: number) => string; ariaLabel: string; max?: number }) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <div role="list" aria-label={ariaLabel} className="barlist">
      {rows.map((r) => (
        <div key={r.label} role="listitem" className="barlist__row" title={`${r.label}: ${format(r.value)}`}>
          <div className="barlist__label"><span className="truncate">{r.label}</span>{r.sub && <span className="caption">{r.sub}</span>}</div>
          <div className="barlist__track"><span className="barlist__bar" style={{ width: `${Math.max(1.5, (r.value / top) * 100)}%` }} /></div>
          <div className="barlist__value num">{format(r.value)}</div>
        </div>
      ))}
    </div>
  );
}

/** A ratio against a limit. The track is a lighter step of the fill's own hue so state reads across the whole bar. */
export function Meter({ value, max = 100, tone = 'lime', label }: { value: number; max?: number; tone?: 'lime' | 'warn' | 'danger'; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={`meter ${tone === 'lime' ? '' : `meter--${tone}`}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Figure wrapper: title, chart, and the accessibility twin: a table view of exactly the same values. */
export function ChartCard({ title, subtitle, points, valueHeader, format = (v) => String(v), children, extra }: {
  title: string; subtitle?: string; points: ChartPoint[]; valueHeader: string; format?: (v: number) => string; children: ReactNode; extra?: ReactNode;
}) {
  const [table, setTable] = useState(false);
  const id = useId();
  return (
    <figure className="card" style={{ margin: 0 }} aria-labelledby={`${id}-t`}>
      <div className="card__head">
        <div>
          <h2 className="card__title" id={`${id}-t`}>{title}</h2>
          {subtitle && <p className="card__sub">{subtitle}</p>}
        </div>
        <div className="row">
          {extra}
          <button type="button" className="btn btn--ghost btn--sm" aria-pressed={table} onClick={() => setTable((t) => !t)}>{table ? 'View chart' : 'View as table'}</button>
        </div>
      </div>
      <div className="card__body">
        {table ? (
          <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
            <table className="table" style={{ minWidth: 0 }}>
              <thead><tr><th scope="col">Day</th><th scope="col" className="th--num">{valueHeader}</th></tr></thead>
              <tbody>{points.map((p) => <tr key={p.label + (p.full ?? '')}><td>{p.full ?? p.label}</td><td className="td--num">{format(p.value)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : children}
      </div>
    </figure>
  );
}
