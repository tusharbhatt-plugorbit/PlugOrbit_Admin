/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional absolute API origin. Empty = same origin (dev proxy / Firebase Hosting rewrite). */
  readonly VITE_API_BASE_URL?: string;
  /** Google Maps JavaScript API browser key. Restrict by HTTP referrer + API in Google Cloud. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  /** Optional Map ID (Advanced Markers need one; DEMO_MAP_ID works for development). */
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string;
  /** Firebase web config (public identifiers, not secrets). All four enable Firebase sign-in. */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
