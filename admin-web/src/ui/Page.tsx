import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';

interface PageMeta { title: string; subtitle?: string }
interface PageMetaApi { meta: PageMeta; setMeta: (m: PageMeta) => void }
const PageMetaContext = createContext<PageMetaApi | null>(null);

export function PageMetaProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<PageMeta>({ title: '' });
  const value = useMemo(() => ({ meta, setMeta }), [meta]);
  return <PageMetaContext.Provider value={value}>{children}</PageMetaContext.Provider>;
}

export function usePageMetaValue(): PageMeta {
  return useContext(PageMetaContext)?.meta ?? { title: '' };
}

/** A page declares its title once; the top bar and the browser tab both show it. */
export function usePageMeta(title: string, subtitle?: string): void {
  const ctx = useContext(PageMetaContext);
  const setMeta = ctx?.setMeta;
  useEffect(() => {
    setMeta?.({ title, subtitle });
    document.title = title ? `${title} · PlugOrbit Admin` : 'PlugOrbit Admin';
  }, [title, subtitle, setMeta]);
}

/** The action row at the top of a page: optional back link on the left, primary actions on the right. */
export function PageHeader({ back, actions, children }: { back?: { to: string; label: string }; actions?: ReactNode; children?: ReactNode }) {
  if (!back && !actions && !children) return null;
  return (
    <div className="page__bar">
      <div className="page__bar-left">
        {back && <Link className="back-link" to={back.to}><Icon name="arrow-left" size={16} />{back.label}</Link>}
        {children}
      </div>
      {actions && <div className="page__bar-right">{actions}</div>}
    </div>
  );
}
