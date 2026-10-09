import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { DevRole, Role } from '@/api/types';
import { useAuth } from '@/auth/AuthProvider';
import { adminSessionService } from '@/services/adminSessionService';
import { Button } from '@/ui/Button';
import { BrandLogo } from '@/ui/BrandLogo';
import { TextField } from '@/ui/Fields';
import { Notice } from '@/ui/States';
import { SplashScreen } from './guards';

const ROLE_BLURB: Record<string, string> = {
  super_admin: 'Everything, including roles and settings',
  operations: 'Partners, stations, pricing, data quality',
  finance: 'Refunds, settlements and payouts',
  support: 'Tickets, users and restrictions',
};

function DemoSignIn() {
  const { signInAsDemoRole, error } = useAuth();
  const [roles, setRoles] = useState<DevRole[] | null>(null);
  const [selected, setSelected] = useState<Role>('super_admin');
  const [busy, setBusy] = useState(false);
  useEffect(() => { adminSessionService.devRoles().then(setRoles).catch(() => setRoles([])); }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await signInAsDemoRole(selected); } catch { /* error shown from auth state */ } finally { setBusy(false); }
  };
  return (
    <form className="stack" onSubmit={submit}>
      <Notice tone="warn" title="Demo sign-in">Firebase sign-in is not configured here, so you can enter as any role to try the permissions. This is switched off in production.</Notice>
      <div className="role-grid" role="radiogroup" aria-label="Role">
        {(roles ?? []).map((r) => (
          <button key={r.role} type="button" role="radio" aria-checked={selected === r.role} className={`role-card ${selected === r.role ? 'role-card--selected' : ''}`} onClick={() => setSelected(r.role)}>
            <span className="role-card__name">{r.roleLabel}</span>
            <span className="caption">{ROLE_BLURB[r.role]}</span>
          </button>
        ))}
      </div>
      {error && <Notice tone="danger" title={error} />}
      <Button type="submit" label="Enter admin" loading={busy} disabled={!roles?.length} block />
    </form>
  );
}

function PasswordSignIn() {
  const { signInWithPassword, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await signInWithPassword(email.trim(), password); } catch { /* shown from auth state */ } finally { setBusy(false); }
  };
  return (
    <form className="stack" onSubmit={submit}>
      <TextField label="Work email" type="email" autoComplete="username" value={email} onChange={setEmail} required />
      <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} required />
      {error && <Notice tone="danger" title={error} />}
      <Button type="submit" label="Sign in" loading={busy} disabled={!email || !password} block />
    </form>
  );
}

export default function LoginPage() {
  const { status, mode, notice, error, meta, retry } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (status === 'signedIn') return <Navigate to={from} replace />;
  if (status === 'loading') return <SplashScreen />;

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__brand">
          <BrandLogo size={52} />
          <div>
            <div className="login__title">PlugOrbit Admin</div>
            <div className="caption">Internal operations. Authorised staff only.</div>
          </div>
        </div>
        {notice && <Notice tone="info" title={notice} />}
        {mode === 'firebase' && <PasswordSignIn />}
        {mode === 'demo' && <DemoSignIn />}
        {mode === 'unconfigured' && (
          <Notice tone="danger" title="Sign-in is not configured">
            Set the VITE_FIREBASE_* variables for this web app and give the Admin API its service-account key, or (development only) start the API with ADMIN_DEV_AUTH=true.
          </Notice>
        )}
        {mode === 'unreachable' && (
          <Notice tone="danger" title="Cannot reach the Admin API" actions={<Button small variant="secondary" icon="refresh" label="Try again" onClick={retry} />}>
            {error ?? 'Start the API (uvicorn app.main:app) and reload.'}
          </Notice>
        )}
        {meta && <div className="caption" style={{ textAlign: 'center' }}>API {meta.version} · {meta.environment}{meta.dataMode === 'demo' ? ' · demo data' : ''}</div>}
      </div>
    </div>
  );
}
