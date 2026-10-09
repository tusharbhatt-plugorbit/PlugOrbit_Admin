import type { HTMLAttributes, ReactNode } from 'react';

type Tone = 'default' | 'lime' | 'warn' | 'danger' | 'info' | 'dark';
const TONE: Record<Tone, string> = { default: '', lime: 'card--lime', warn: 'card--warn', danger: 'card--danger', info: 'card--info', dark: 'card--dark' };

export function Card({ tone = 'default', pad = false, flat = false, className = '', children, ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: Tone; pad?: boolean; flat?: boolean }) {
  return <div {...rest} className={['card', TONE[tone], pad ? 'card--pad' : '', flat ? 'card--flat' : '', className].filter(Boolean).join(' ')}>{children}</div>;
}

export function CardHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="card__head">
      <div>
        <h2 className="card__title">{title}</h2>
        {subtitle && <p className="card__sub">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export const CardBody = ({ children, className = '' }: { children: ReactNode; className?: string }) => <div className={`card__body ${className}`}>{children}</div>;
export const CardFooter = ({ children }: { children: ReactNode }) => <div className="card__foot">{children}</div>;

/** Keep KPIs to 1-4 per screen: each one answers a question an admin actually asks. */
export function KpiCard({ label, value, note, noteTone, icon, onClick }: {
  label: string; value: ReactNode; note?: ReactNode; noteTone?: 'up' | 'down' | 'warn' | 'bad' | 'neutral'; icon?: ReactNode; onClick?: () => void;
}) {
  const body = (
    <>
      <div className="kpi__label">{icon}{label}</div>
      <div className="kpi__value">{value}</div>
      {note !== undefined && <div className={`kpi__note ${noteTone && noteTone !== 'neutral' ? `kpi__note--${noteTone}` : ''}`}>{note}</div>}
    </>
  );
  if (onClick) {
    return <button type="button" className="card kpi kpi--link" style={{ textAlign: 'left', border: 0, font: 'inherit' }} onClick={onClick}>{body}</button>;
  }
  return <div className="card kpi">{body}</div>;
}

export function KeyValue({ label, value, emphasis }: { label: ReactNode; value: ReactNode; emphasis?: boolean }) {
  return (
    <div className="kv">
      <div className="kv__label">{label}</div>
      <div className={`kv__value ${emphasis ? 'kv__value--emph' : ''}`}>{value ?? '—'}</div>
    </div>
  );
}

export function IconTile({ icon, tone = 'default' }: { icon: ReactNode; tone?: 'default' | 'lime' | 'warn' | 'danger' | 'info' }) {
  return <span className={`icon-tile ${tone === 'default' ? '' : `icon-tile--${tone}`}`}>{icon}</span>;
}
