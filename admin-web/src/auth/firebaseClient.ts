/**
 * Firebase Auth (web SDK), loaded lazily and only when the four VITE_FIREBASE_* values are set.
 * Those values are public identifiers, not secrets; the Admin API still verifies every ID token
 * server-side (revocation included) and maps the uid to an admin role in Firestore.
 */
import type { FirebaseApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';

const env = import.meta.env;
export const firebaseConfigured = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_AUTH_DOMAIN && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);

let cached: Promise<{ app: FirebaseApp; auth: Auth }> | null = null;

async function boot() {
  if (!cached) {
    cached = (async () => {
      const [{ initializeApp, getApps }, authMod] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
      const app = getApps()[0] ?? initializeApp({
        apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID,
      });
      return { app, auth: authMod.getAuth(app) };
    })();
  }
  return cached;
}

export async function watchFirebaseUser(callback: (user: User | null) => void): Promise<() => void> {
  const { auth } = await boot();
  const { onAuthStateChanged } = await import('firebase/auth');
  return onAuthStateChanged(auth, callback);
}

export async function firebaseSignIn(email: string, password: string): Promise<User> {
  const { auth } = await boot();
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  return (await signInWithEmailAndPassword(auth, email, password)).user;
}

export async function firebaseSignOut(): Promise<void> {
  if (!cached) return;
  const { auth } = await boot();
  const { signOut } = await import('firebase/auth');
  await signOut(auth);
}

/** Returns a fresh-enough ID token (the SDK refreshes it automatically near expiry). */
export async function firebaseIdToken(): Promise<string | null> {
  if (!cached) return null;
  const { auth } = await boot();
  return (await auth.currentUser?.getIdToken()) ?? null;
}

export function friendlyFirebaseError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-email') return 'Email or password is incorrect.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes and try again.';
  if (code === 'auth/user-disabled') return 'This account has been disabled.';
  if (code === 'auth/network-request-failed') return 'Cannot reach Firebase. Check your connection.';
  return 'Could not sign in. Please try again.';
}
