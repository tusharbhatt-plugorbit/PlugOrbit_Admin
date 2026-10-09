# Deployment and runbook

Target layout (matches `firebase.json` and `backend/Dockerfile`):

```
admin.<your-domain>  ──▶  Firebase Hosting  ── /admin/v1/** ──▶  Cloud Run: plugorbit-admin-api  ──▶  Firestore + Auth (same project)
                              └── everything else: the React build (admin-web/dist)
```

Hosting rewrites `/admin/v1/**` to Cloud Run, so the browser talks to **one origin** (no CORS in production, `VITE_API_BASE_URL` stays empty).
Use the same region for Hosting's Cloud Run rewrite and the service (`asia-south1` is assumed in `firebase.json`; change both if you pick another).

## Configuration reference

### API (`backend/.env` locally, Cloud Run env vars / Secret Manager in production)

| Variable | Default | Notes |
|---|---|---|
| `ENVIRONMENT` | `development` | `development`, `test`, `staging`, `production`. The last two refuse unsafe config at startup |
| `DATA_BACKEND` | `auto` | `firestore` in production. With no key file it then uses Application Default Credentials (Cloud Run's service account) |
| `FIREBASE_CREDENTIALS_PATH` | `serviceAccountKey.json` | Local development with a downloaded key. **Never commit the key** (it is git-ignored). On Cloud Run prefer no key at all |
| `SEED_DEMO_DATA` | `true` | Only affects the in-memory store |
| `BOOTSTRAP_SUPER_ADMIN_EMAILS` | empty | Comma list or JSON list. Verified emails listed here become Super Admin on first sign-in |
| `ADMIN_DEV_AUTH` | `false` | **Development only.** Must be `false` in staging/production |
| `ADMIN_DEV_SECRET` | random per process | Optional fixed secret for dev tokens |
| `CORS_ORIGINS` | `http://localhost:5173` | Exact origins. Not needed behind the Hosting rewrite |
| `PUBLIC_WEB_ORIGIN` | `http://localhost:5173` | The admin's public origin |

### Web (`admin-web/.env.local`, read at **build** time; everything here is public)

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Empty for same-origin (dev proxy or Hosting rewrite) |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | Firebase web app config. All four enable real sign-in; without them the app uses the demo role picker (needs `ADMIN_DEV_AUTH=true`) |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps **browser** key. Optional: without it the map screens explain what is missing |
| `VITE_GOOGLE_MAPS_MAP_ID` | Optional Cloud Map ID (needed for Advanced Markers in production; `DEMO_MAP_ID` is used otherwise and is for development only) |

## Local development

```bash
# API (demo store, no credentials)
cd backend && python3 -m pip install -r requirements-dev.txt
ENVIRONMENT=development ADMIN_DEV_AUTH=true python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Web
cd admin-web && npm install && npm run dev      # http://127.0.0.1:5173, proxies /admin/v1 to :8000
```

Against **real Firebase from your machine**: place the service-account key at `backend/serviceAccountKey.json`, set `DATA_BACKEND=firestore`, set the
four `VITE_FIREBASE_*` values, set `BOOTSTRAP_SUPER_ADMIN_EMAILS` to your address, and leave `ADMIN_DEV_AUTH=false`.

## First-time Firebase / Google Cloud setup

1. **Project.** Use the same Firebase project as the mobile app (or a separate staging project: recommended for rehearsal).
2. **Authentication.** Enable *Email/Password* (and ideally MFA). Create your admin user in the Firebase console. Add your admin domain to *Authorized domains*.
3. **Firestore.** Create the database in Native mode in the region you chose. Deploy the rules and (empty) indexes:
   `firebase deploy --only firestore`. The rules deny all client access on purpose.
4. **Service account.** Create a dedicated service account for the API (`plugorbit-admin-api@<project>.iam.gserviceaccount.com`) with *Cloud Datastore User* and
   *Firebase Authentication Admin* (needed to verify tokens with revocation checks and to revoke on sign-out). Do **not** reuse the mobile Backend's account.
5. **Web app.** Register a web app in *Project settings → General* and copy its config into the four `VITE_FIREBASE_*` values.

## Google Maps

The console uses the **Maps JavaScript API** in the browser for the Network Map and the station pin picker.

1. In Google Cloud (same project as billing), enable **Maps JavaScript API**. (The mobile app separately uses Maps SDK for Android/iOS, Places API (New) and Directions/Routes; those keys are not reused here.)
2. Create a **new API key just for this web app** (do not reuse the Android/iOS/Places keys; they have different restrictions).
3. Restrict it:
   * *Application restriction*: **Websites (HTTP referrers)**: `https://admin.<your-domain>/*` (add `http://localhost:5173/*` to a separate dev key, not the production one).
   * *API restriction*: **Maps JavaScript API** only.
   * Set a daily quota and a billing budget alert.
4. (Recommended) Create a **Map ID** (Google Maps Platform → Map Management, JavaScript, vector) and set `VITE_GOOGLE_MAPS_MAP_ID`. `DEMO_MAP_ID` works for development but is not for production use.
5. Put the key in `admin-web/.env.local` (or your CI's build environment) as `VITE_GOOGLE_MAPS_API_KEY`, then rebuild. It is a browser key by design (visible in network requests), which is why the restrictions in step 3 matter; **never** put a server key or the service-account key in a `VITE_*` variable.

What the admin shows when something is wrong (so you can diagnose without the console):

| Situation | What the screen says | Fix |
|---|---|---|
| No key at build time | "Google Maps isn't configured": names `VITE_GOOGLE_MAPS_API_KEY` | Set the variable and rebuild |
| Script blocked or offline | "The Google Maps script could not be downloaded…" | Ad/content blocker, network, malformed key |
| Script slow (12 s) | "…did not load in time…" | Network; retry |
| Google rejects the key (`gm_authFailure`) | "Google rejected the Maps API key…" (API not enabled, billing off, wrong referrer) | Check steps 1–3 and the browser console |

In every case the Network Map falls back to a schematic map of the same stations (still clickable, still filterable) and the pin picker keeps
latitude/longitude editable by hand, so no workflow is blocked by a Maps problem. **This build was verified only against the missing-key and
blocked-script states; a real key could not be exercised from the build sandbox.** Check the map once after deploying (smoke test below).

## Deploy the API (Cloud Run)

```bash
gcloud run deploy plugorbit-admin-api \
  --source backend \
  --region asia-south1 \
  --service-account plugorbit-admin-api@<project>.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --set-env-vars "ENVIRONMENT=production,DATA_BACKEND=firestore,ADMIN_DEV_AUTH=false,BOOTSTRAP_SUPER_ADMIN_EMAILS=you@example.com,PUBLIC_WEB_ORIGIN=https://admin.<your-domain>"
```

(Use one `--set-env-vars` flag: a second one replaces the first. For several bootstrap emails use gcloud's alternate delimiter, e.g.
`--set-env-vars "^;^ENVIRONMENT=production;BOOTSTRAP_SUPER_ADMIN_EMAILS=a@x.com,b@x.com"`.)

(The image sets `ENVIRONMENT=production`, `DATA_BACKEND=firestore`, `ADMIN_DEV_AUTH=false` by default and runs as a non-root user.)
The service must be reachable by Firebase Hosting's rewrite; authorisation is the bearer token, enforced by the API, so the Cloud Run service itself
is "allow unauthenticated" behind Hosting. Put **Cloud Armor / rate limiting** in front if you expose it more widely
([SECURITY](SECURITY.md#hardening-checklist-before-go-live)). If startup fails with *Unsafe configuration*, the log lists exactly which setting.

## Deploy the web app (Firebase Hosting)

```bash
cd admin-web
cp .env.example .env.local        # fill the VITE_FIREBASE_* and (optionally) Maps values
npm ci && npm run check           # typecheck + lint + tests + production build
cd .. && firebase deploy --only hosting,firestore
```

## First-deploy smoke test

1. `GET https://admin.<your-domain>/admin/v1/meta` → `"environment":"production"`, `"dataMode":"live"`, `"store":"firestore"`, `"devAuth":false`. `GET /admin/v1/overview` without a token → 401 `MISSING_TOKEN`. (`/health` is served by Cloud Run directly, not through Hosting.)
2. Sign in with the bootstrap email. You should land on Overview as **Super Admin**; the *Demo data* banner must **not** appear.
3. Settings → Admin roles: invite a second admin; sign in as them and confirm they get the right menu.
4. Create a partner → approve (needs PAN confirmation) → create a station → add a connector → set a price → Go live. Confirm the audit log shows each step and
   **Audit Log → Verify integrity** reports "none altered or removed".
5. Network Map: pins render on a real Google map (if it shows the schematic fallback, read the notice on the page).
6. Confirm Firestore has `admins`, `partners`, `stations`, `connectors`, `tariffs`, `audit`, `config` and **no** `isDemo` documents, and that
   `curl` to Firestore REST with an end-user token is denied (rules).
7. Transactions → a refund returns 501 *Integration unavailable* until a payment gateway is wired (expected).

The Firestore adapter has been exercised against its interface and the in-memory twin, not a live project from the build environment, so treat step 4–6 as the real
acceptance test of the persistence layer.

## Runbook

| Task | How |
|---|---|
| Add an admin | Settings → Admin roles → Invite (by email). They sign in with Firebase; the pending record is adopted by verified email |
| Remove access now | Settings → Admin roles → Disable. Takes effect on their next request; also disable the Firebase user to stop sign-in |
| Break-glass admin | Add the email to `BOOTSTRAP_SUPER_ADMIN_EMAILS` and redeploy; they become Super Admin on next sign-in (remove it afterwards) |
| Change a role's permissions | Edit `backend/app/security/permissions.py`, run tests, deploy. The UI follows automatically (permissions come from `/auth/me`) |
| Change freshness windows, GST on fee, idle timeout, feature flags, ranking weights | Settings (audited, versioned) |
| Turn on Analytics / Notifications | Settings → Feature flags (both built; they ship enabled) |
| A station shows Unknown / stale | Expected until the feed/ingestion writes status; use a time-boxed override with a reason if a person has verified it |
| Verify audit integrity | Audit Log → Verify integrity, or `GET /admin/v1/audit/verify` (alert on `ok:false`) |
| Rotate the Maps key | Create a new restricted key, update `VITE_GOOGLE_MAPS_API_KEY`, rebuild and redeploy, delete the old key |
| Roll back the web app | Firebase console → Hosting → release history → *Rollback*; the API stays backwards compatible within `/admin/v1` |
| Roll back the API | `gcloud run services update-traffic plugorbit-admin-api --to-revisions <previous>=100` |
| Back up / restore | Enable Firestore PITR; export with `gcloud firestore export`; rehearse a restore into staging |
| Reset demo data | Restart the API (in-memory demo store only) |

## CI suggestion

On every pull request: `cd backend && pip install -r requirements-dev.txt && pytest -q`; `cd admin-web && npm ci && npm run check`; and, when the mobile repo is
checked out alongside, `npm run check:theme -- ../plugorbit/LoginApp/src/theme.ts` (or set `PLUGORBIT_MOBILE_THEME`). Run the Playwright smoke
(`npm run e2e`) against the demo API as a pre-release gate.
