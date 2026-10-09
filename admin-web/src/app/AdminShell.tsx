import { Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { PageMetaProvider } from '@/ui/Page';
import { LoadingState } from '@/ui/States';
import { ErrorBoundary } from './ErrorBoundary';
import { ShellDataProvider } from './ShellData';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const COLLAPSE_KEY = 'po.sidebar.collapsed';
const read = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };

/** Dark L-shaped chrome (sidebar + top bar) around a light, rounded-corner body sheet: the mobile app's frame. */
export function AdminShell() {
  const { pathname } = useLocation();
  // The mobile nav is open only for the path it was opened on, so navigating closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null);
  const [collapsed, setCollapsed] = useState(read);
  const { meta } = useAuth();
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* ignore */ } return !c; });

  return (
    <PageMetaProvider>
      <ShellDataProvider>
        <div className={`shell ${collapsed ? 'shell--collapsed' : ''}`}>
          <a className="skip-link" href="#main">Skip to content</a>
          <Sidebar open={open} onNavigate={() => setOpen(false)} />
          {open && <div className="scrim" style={{ zIndex: 25 }} onClick={() => setOpen(false)} />}
          <div className="main">
            <TopBar onMenu={() => setOpen(true)} />
            <main id="main" className="sheet" tabIndex={-1}>
              {meta?.dataMode === 'demo' && <div className="banner banner--demo" role="note"><strong>Demo data.</strong> Fictional in-memory data and a simulated payment gateway. Nothing here is real; it resets when the server restarts.</div>}
              <div className="page">
                <ErrorBoundary resetKey={pathname}>
                  <Suspense fallback={<LoadingState variant="detail" />}><Outlet /></Suspense>
                </ErrorBoundary>
                <div className="row row--end hide-sm">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={toggle}>{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</button>
                </div>
              </div>
            </main>
          </div>
        </div>
      </ShellDataProvider>
    </PageMetaProvider>
  );
}
