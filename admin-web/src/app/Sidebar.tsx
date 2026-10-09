import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { initials } from '@/domain/format';
import { BrandLogo } from '@/ui/BrandLogo';
import { Icon } from '@/ui/Icon';
import { NAV, navParent } from './routes';

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { can, featureOn, principal, signOut } = useAuth();
  const { pathname } = useLocation();
  const active = navParent(pathname);
  const items = NAV.filter((n) => can(n.permission) && (!n.flag || featureOn(n.flag)));

  return (
    <aside className={`sidebar ${open ? 'sidebar--open' : ''}`} aria-label="Primary">
      <div className="sidebar__brand">
        <BrandLogo size={40} />
        <div>
          <div className="brand-word">PlugOrbit</div>
          <span className="brand-tag">ADMIN</span>
        </div>
      </div>
      <nav className="nav" aria-label="Main navigation">
        {items.map((n) => (
          <NavLink key={n.path} to={n.path} end={n.path === '/'} onClick={onNavigate} title={n.label}
            className={`nav__item ${active === n.path ? 'nav__item--active' : ''}`} aria-current={active === n.path ? 'page' : undefined}>
            <Icon name={n.icon} size={19} />
            <span className="nav__label">{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar__foot">
        <div className="usercard">
          <span className="avatar" aria-hidden="true">{initials(principal?.name)}</span>
          <span className="usercard__text">
            <div className="usercard__name">{principal?.name}</div>
            <div className="usercard__role">{principal?.roleLabel}</div>
          </span>
        </div>
        <button type="button" className="sidebar__btn" onClick={() => void signOut()} title="Sign out">
          <Icon name="logout" size={18} /><span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
