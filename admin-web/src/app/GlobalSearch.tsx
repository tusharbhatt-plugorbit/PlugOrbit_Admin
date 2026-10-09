import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { useResource } from '@/hooks/useResource';
import { adminConfigService } from '@/services/adminConfigService';
import { Icon, type IconName } from '@/ui/Icon';
import { NAV } from './routes';

interface Hit { key: string; label: string; hint: string; icon: IconName; to: string }

/** Jump anywhere: pages, partners, stations, a session id (PO-…) or a ticket id (TKT-…). Ctrl/⌘ + K focuses it. */
export function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { can, featureOn } = useAuth();
  const lookups = useResource((s) => adminConfigService.lookups(s), [], { enabled: open });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const out: Hit[] = [];
    if (/^po-[a-z0-9]{4,}/i.test(needle) && can('transactions:read')) out.push({ key: 'tx', label: `Open transaction ${q.trim().toUpperCase()}`, hint: 'Transactions', icon: 'receipt-text', to: `/transactions/${q.trim().toUpperCase()}` });
    if (/^tkt-\d+/i.test(needle) && can('support:read')) out.push({ key: 'tk', label: `Open ticket ${q.trim().toUpperCase()}`, hint: 'Support', icon: 'lifebuoy', to: `/support?ticket=${q.trim().toUpperCase()}` });
    for (const n of NAV) {
      if (can(n.permission) && (!n.flag || featureOn(n.flag)) && n.label.toLowerCase().includes(needle)) out.push({ key: `p${n.path}`, label: n.label, hint: 'Page', icon: n.icon, to: n.path });
    }
    if (can('partners:read')) for (const p of lookups.data?.partners ?? []) if (p.name.toLowerCase().includes(needle)) out.push({ key: p.id, label: p.name, hint: 'Partner', icon: 'handshake', to: `/partners/${p.id}` });
    if (can('stations:read')) for (const s of lookups.data?.stations ?? []) if (s.name.toLowerCase().includes(needle)) out.push({ key: s.id, label: s.name, hint: 'Station', icon: 'plug', to: `/stations/${s.id}` });
    return out.slice(0, 8);
  }, [q, lookups.data, can, featureOn]);

  const go = (hit: Hit) => { setOpen(false); setQ(''); (document.activeElement as HTMLElement | null)?.blur(); navigate(hit.to); };

  return (
    <div className="popover-anchor">
      <div className="topbar-input" role="search">
        <Icon name="search" size={16} />
        <input ref={inputRef} value={q} placeholder="Search or jump to…" aria-label="Global search" autoComplete="off" role="combobox" aria-expanded={open && hits.length > 0} aria-controls="global-search-list"
          onChange={(e) => { setQ(e.target.value); setCursor(0); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, hits.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
            else if (e.key === 'Enter' && hits[cursor]) go(hits[cursor]);
            else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
          }} />
        <kbd aria-hidden="true">Ctrl K</kbd>
      </div>
      {open && q.trim().length >= 2 && (
        <div className="popover popover--left" style={{ width: 380 }} id="global-search-list" role="listbox">
          {hits.length === 0 ? <div className="popover__item"><span className="muted">{lookups.loading ? 'Searching…' : `Nothing found for “${q.trim()}”`}</span></div> : hits.map((h, i) => (
            <button key={h.key} type="button" role="option" aria-selected={i === cursor} className={`popover__item ${i === cursor ? 'popover__item--active' : ''}`}
              style={{ width: '100%', border: 0, background: 'none', textAlign: 'left', font: 'inherit' }} onMouseDown={(e) => { e.preventDefault(); go(h); }}>
              <Icon name={h.icon} size={18} />
              <span className="grow"><div className="strong">{h.label}</div><div className="caption">{h.hint}</div></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
