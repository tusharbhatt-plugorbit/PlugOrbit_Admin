import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { configureHttp, describeError } from '@/api/http';
import type { Meta, Principal, Role } from '@/api/types';
import type { Permission } from '@/domain/permissions';
import { adminSessionService } from '@/services/adminSessionService';
import { firebaseConfigured, firebaseIdToken, firebaseSignIn, firebaseSignOut, friendlyFirebaseError, watchFirebaseUser } from './firebaseClient';

export type AuthMode = 'firebase' | 'demo' | 'unconfigured' | 'unreachable';
export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  mode: AuthMode;
  meta: Meta | null;
  principal: Principal | null;
  featureFlags: Record<string, boolean>;
  /** Why the last session ended ("expired", "idle", "signed out elsewhere"), shown on the sign-in screen. */
  notice: string | null;
  error: string | null;
}

interface AuthApi extends AuthState {
  can: (permission: Permission) => boolean;
  canAny: (...permissions: Permission[]) => boolean;
  featureOn: (flag: string) => boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInAsDemoRole: (role: Role) => Promise<void>;
  signOut: (notice?: string) => Promise<void>;
  retry: () => void;
}

const DEV_TOKEN_KEY = 'po.dev.token';
const LOGOUT_SIGNAL = 'po.logout';
const AuthContext = createContext<AuthApi | null>(null);

function safeSession(op: () => string | null | void): string | null {
  try { return (op() as string | null) ?? null; } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', mode: 'unreachable', meta: null, principal: null, featureFlags: {}, notice: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const devToken = useRef<string | null>(null);
  const modeRef = useRef<AuthMode>('unreachable');
  const idleMinutes = useRef(30);
  const expiring = useRef(false);

  const clearLocal = useCallback(() => {
    devToken.current = null;
    safeSession(() => sessionStorage.removeItem(DEV_TOKEN_KEY));
  }, []);

  const endSession = useCallback(async (notice: string | null, callApi: boolean) => {
    if (callApi) { try { await adminSessionService.logout(); } catch { /* sign-out must never fail on the client */ } }
    clearLocal();
    if (modeRef.current === 'firebase') { try { await firebaseSignOut(); } catch { /* ignore */ } }
    setState((s) => ({ ...s, status: 'signedOut', principal: null, featureFlags: {}, notice, error: null }));
  }, [clearLocal]);

  // Hand the HTTP client its token source and the "session is dead" callback.
  useEffect(() => {
    configureHttp({
      getToken: async () => (modeRef.current === 'firebase' ? firebaseIdToken() : devToken.current),
      onUnauthorized: () => {
        if (expiring.current) return;
        expiring.current = true;
        void endSession('Your session expired. Please sign in again.', false).finally(() => { expiring.current = false; });
      },
    });
  }, [endSession]);

  const applySession = useCallback((principal: Principal, featureFlags: Record<string, boolean>, idle: number) => {
    idleMinutes.current = idle;
    setState((s) => ({ ...s, status: 'signedIn', principal, featureFlags, notice: null, error: null }));
  }, []);

  // ------------------------------------------------------------------------ bootstrap --
  useEffect(() => {
    let cancelled = false;
    let stopWatching: (() => void) | undefined;
    (async () => {
      let meta: Meta;
      try { meta = await adminSessionService.meta(); } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, status: 'signedOut', mode: 'unreachable', error: describeError(err) }));
        return;
      }
      if (cancelled) return;
      const mode: AuthMode = firebaseConfigured && meta.auth.firebase ? 'firebase' : meta.auth.devAuth ? 'demo' : 'unconfigured';
      modeRef.current = mode;
      setState((s) => ({ ...s, meta, mode, error: null }));

      if (mode === 'demo') {
        const saved = safeSession(() => sessionStorage.getItem(DEV_TOKEN_KEY));
        if (saved) {
          devToken.current = saved;
          try {
            const info = await adminSessionService.me();
            if (!cancelled) applySession(info.principal, info.featureFlags, info.idleTimeoutMinutes);
            return;
          } catch { clearLocal(); }
        }
        if (!cancelled) setState((s) => ({ ...s, status: 'signedOut' }));
      } else if (mode === 'firebase') {
        stopWatching = await watchFirebaseUser(async (user) => {
          if (cancelled) return;
          if (!user) { setState((s) => (s.status === 'signedIn' ? { ...s, status: 'signedOut', principal: null } : { ...s, status: 'signedOut' })); return; }
          try {
            const info = await adminSessionService.startSession();
            if (!cancelled) applySession(info.principal, info.featureFlags, info.idleTimeoutMinutes);
          } catch (err) {
            if (cancelled) return;
            await endSession(null, false);
            setState((s) => ({ ...s, error: describeError(err) }));
          }
        });
      } else {
        setState((s) => ({ ...s, status: 'signedOut' }));
      }
    })();
    return () => { cancelled = true; stopWatching?.(); };
  }, [attempt, applySession, clearLocal, endSession]);

  // ----------------------------------------------------------------------- idle timeout --
  useEffect(() => {
    if (state.status !== 'signedIn') return;
    let last = Date.now();
    const touch = () => { last = Date.now(); };
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - last > idleMinutes.current * 60_000) {
        void endSession(`You were signed out after ${idleMinutes.current} minutes of inactivity.`, true);
      }
    }, 15_000);
    // Signing out in one tab signs out every tab.
    const onStorage = (e: StorageEvent) => { if (e.key === LOGOUT_SIGNAL) void endSession('You were signed out in another tab.', false); };
    window.addEventListener('storage', onStorage);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(timer);
      window.removeEventListener('storage', onStorage);
    };
  }, [state.status, endSession]);

  // ---------------------------------------------------------------------------- actions --
  const signInWithPassword = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, error: null, notice: null }));
    try { await firebaseSignIn(email, password); } catch (err) {
      setState((s) => ({ ...s, error: friendlyFirebaseError(err) }));
      throw err;
    }
    // onAuthStateChanged continues the flow (startSession), and reports NOT_AN_ADMIN there.
  }, []);

  const signInAsDemoRole = useCallback(async (role: Role) => {
    setState((s) => ({ ...s, error: null, notice: null }));
    try {
      const { token } = await adminSessionService.devLogin(role);
      devToken.current = token;
      safeSession(() => sessionStorage.setItem(DEV_TOKEN_KEY, token));
      const info = await adminSessionService.startSession();
      applySession(info.principal, info.featureFlags, info.idleTimeoutMinutes);
    } catch (err) {
      clearLocal();
      setState((s) => ({ ...s, error: describeError(err) }));
      throw err;
    }
  }, [applySession, clearLocal]);

  const signOut = useCallback(async (notice?: string) => {
    try { localStorage.setItem(LOGOUT_SIGNAL, String(Date.now())); } catch { /* storage blocked */ }
    await endSession(notice ?? null, true);
  }, [endSession]);

  const value = useMemo<AuthApi>(() => {
    const perms = new Set<string>(state.principal?.permissions ?? []);
    return {
      ...state,
      can: (p) => perms.has(p),
      canAny: (...ps) => ps.some((p) => perms.has(p)),
      featureOn: (flag) => state.featureFlags[flag] === true,
      signInWithPassword, signInAsDemoRole, signOut,
      retry: () => { setState((s) => ({ ...s, status: 'loading', error: null })); setAttempt((n) => n + 1); },
    };
  }, [state, signInWithPassword, signInAsDemoRole, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}

