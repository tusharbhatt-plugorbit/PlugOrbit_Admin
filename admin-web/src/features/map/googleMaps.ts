/**
 * Google Maps JavaScript API loader.
 *
 *  - The key comes ONLY from VITE_GOOGLE_MAPS_API_KEY at build time. It is a *browser* key: restrict it
 *    in Google Cloud by HTTP referrer (this site's origin) and by API (Maps JavaScript API). It is never
 *    hard-coded, and no server-side/private key ever reaches the bundle.
 *  - Missing key, a blocked script, a timeout and Google rejecting the key (`gm_authFailure`: wrong
 *    referrer restriction, billing off, API not enabled) each produce a distinct, readable error.
 */
export type MapsStatus =
  | { status: 'missing-key' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

const KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim();
export const MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? '').trim() || 'DEMO_MAP_ID';
export const hasMapsKey = KEY.length > 0;
/** Delhi, the same default centre as the mobile app (DEFAULT_CENTER in config/google.ts). */
export const DEFAULT_CENTER = { lat: 28.6139, lng: 77.209 } as const;

const LOAD_TIMEOUT_MS = 12_000;
let loading: Promise<void> | null = null;
let authFailure: string | null = null;

declare global {
  interface Window { gm_authFailure?: () => void; __poMapsReady?: () => void }
}

export function loadGoogleMaps(): Promise<void> {
  if (!hasMapsKey) return Promise.reject(new Error('missing-key'));
  if (authFailure) return Promise.reject(new Error(authFailure));
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { loading = null; reject(new Error('The Google Maps script did not load in time. Check your connection or an ad/content blocker.')); }, LOAD_TIMEOUT_MS);
    window.gm_authFailure = () => {
      authFailure = 'Google rejected the Maps API key. Check that the Maps JavaScript API is enabled, billing is on, and the key allows this site’s URL (HTTP referrer restriction).';
      window.dispatchEvent(new CustomEvent('po-maps-auth-failure'));
    };
    window.__poMapsReady = () => { clearTimeout(timer); resolve(); };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&loading=async&v=weekly&callback=__poMapsReady`;
    script.async = true;
    script.onerror = () => { clearTimeout(timer); loading = null; reject(new Error('The Google Maps script could not be downloaded (offline, blocked, or the key is malformed).')); };
    document.head.appendChild(script);
  }).then(async () => { await google.maps.importLibrary('maps'); await google.maps.importLibrary('marker'); });
  return loading;
}

export function currentAuthFailure(): string | null { return authFailure; }
