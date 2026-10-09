import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

export interface MenuItem { label: string; onClick: () => void; icon?: IconName; danger?: boolean; hidden?: boolean }

/**
 * "More actions" for a table row. The primary action stays visible next to it; the rest live here, so
 * a dense table never clips its last column. Positioned with `fixed` so scrolling tables cannot cut it off.
 */
export function ActionMenu({ items, label = 'More actions' }: { items: MenuItem[]; label?: string }) {
  const visible = items.filter((i) => !i.hidden);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    menu.current?.querySelector<HTMLElement>('button')?.focus();
    const onDown = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setPos(null); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPos(null); btn.current?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const els = [...(menu.current?.querySelectorAll<HTMLElement>('button') ?? [])];
        const i = els.indexOf(document.activeElement as HTMLElement);
        els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus();
      }
    };
    const onMove = () => setPos(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); };
  }, [pos]);

  if (visible.length === 0) return null;
  return (
    <>
      <button ref={btn} type="button" className="btn btn--secondary btn--icon btn--sm" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={!!pos}
        onClick={() => { const r = btn.current!.getBoundingClientRect(); setPos(pos ? null : { top: r.bottom + 6, right: window.innerWidth - r.right }); }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
      </button>
      {pos && createPortal(
        <div ref={menu} className="menu" role="menu" style={{ top: pos.top, right: pos.right }}>
          {visible.map((i) => (
            <button key={i.label} type="button" role="menuitem" className={`menu__item ${i.danger ? 'menu__item--danger' : ''}`} onClick={() => { close(); i.onClick(); }}>
              {i.icon && <Icon name={i.icon} size={16} />}{i.label}
            </button>
          ))}
        </div>, document.body)}
    </>
  );
}
