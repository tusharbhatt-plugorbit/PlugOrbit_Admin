import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Icon } from '@/ui/Icon';
import { usePageMetaValue } from '@/ui/Page';
import { GlobalSearch } from './GlobalSearch';
import { useShellOverview } from './ShellData';

const SEVERITY_ICON = { critical: 'circle-alert', warning: 'alert', info: 'info' } as const;

function AttentionBell() {
  const { data } = useShellOverview();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const items = data?.attention ?? [];
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="popover-anchor" ref={ref}>
      <button type="button" className="iconbtn" aria-label={`Notifications${items.length ? `, ${items.length} need attention` : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" size={18} />
        {items.length > 0 && <span className="iconbtn__dot" />}
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Needs attention">
          <div className="popover__head"><span>Needs attention</span><span className="muted">{items.length}</span></div>
          {items.length === 0 ? <div className="popover__item"><span className="muted">You are all caught up.</span></div> : items.map((a, i) => (
            <Link key={`${i}-${a.href}-${a.title}`} to={a.href} className="popover__item" onClick={() => setOpen(false)}>
              <Icon name={SEVERITY_ICON[a.severity]} size={18} color={a.severity === 'critical' ? 'var(--po-color-danger)' : a.severity === 'warning' ? 'var(--po-color-amber)' : 'var(--po-color-info)'} />
              <span className="grow"><div className="strong">{a.title}</div><div className="caption">{a.detail}</div></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { title, subtitle } = usePageMetaValue();
  const { meta } = useAuth();
  const { data } = useShellOverview();
  const navigate = useNavigate();
  const critical = data?.attention.filter((a) => a.severity === 'critical').length ?? 0;
  const attention = data?.attention.length ?? 0;
  const tone = critical > 0 ? 'danger' : attention > 0 ? 'warn' : '';
  const label = !data ? 'Checking…' : critical > 0 ? `${critical} critical` : attention > 0 ? `${attention} to review` : 'All systems normal';

  return (
    <header className="topbar">
      <button type="button" className="iconbtn menu-btn" onClick={onMenu} aria-label="Open navigation"><Icon name="menu" size={18} /></button>
      <div className="topbar__titles">
        <h1 className="topbar__title">{title}</h1>
        {subtitle && <p className="topbar__sub">{subtitle}</p>}
      </div>
      <div className="topbar__right">
        {meta?.dataMode === 'demo' && <span className="demo-pill" title="This API is using the in-memory demo store: all data is fictional and resets on restart.">Demo data</span>}
        <button type="button" className={`health-pill ${tone ? `health-pill--${tone}` : ''}`} onClick={() => navigate('/')} title="Open the Overview">
          <span className="health-pill__dot" />{label}
        </button>
        <GlobalSearch />
        <AttentionBell />
      </div>
    </header>
  );
}
