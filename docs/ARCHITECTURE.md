# Architecture

```
 ┌──────────────────────────┐  HTTPS, Firebase ID token   ┌───────────────────────────────┐
 │  admin-web (React + TS)  │ ─────────────────────────▶ │  Admin API (FastAPI, Cloud Run)│
 │  Firebase Hosting        │ ◀───── JSON / error envelope │  /admin/v1/*                  │
 └───────────┬──────────────┘                             └───────┬───────────────────────┘
             │ Firebase Auth (sign-in only)                        │ firebase-admin
             │ Google Maps JS (browser key)                        ▼
             ▼                                         ┌──────────────────────┐
        Google / Firebase                              │ Firestore (+ Auth)   │
                                                       └──────────────────────┘
```

The browser never talks to Firestore. Firebase Auth gives it an ID token; the API verifies the token, looks the person
up in the `admins` collection, and does everything else (roles, validation, masking, audit). Firestore security rules
deny all client access (`firestore.rules`).

## Why this shape

* **One door to the data.** Every rule that matters (permissions, the go-live checklist, refund caps, hash-chained
  audit, PII masking) lives in one place, the API, instead of being re-implemented in the UI and in Firestore rules.
* **The UI has no role matrix.** `GET /auth/me` returns the caller's permission strings; the web app guards on those.
  Changing a role in `security/permissions.py` changes the UI without a web release.
* **Same conventions as the mobile Backend.** Same Firebase project and key, same `{detail:{code,message,fields?}}`
  error envelope, same trust vocabulary (`live / estimated / user / unknown`, plus `manual` here).

## Backend (`backend/app`)

| Package | Responsibility |
|---|---|
| `routes/` | Thin HTTP layer: one router per module (16). Declares the permission each endpoint needs; no business logic. |
| `services/` | All business rules (20 modules). Take a `Store` and a `Principal`; never import `firebase_admin`. |
| `schemas/` | pydantic request models. Reject unknown fields, trim and validate (PAN, GSTIN, phone, reasons). |
| `security/` | Token verification, `Principal`, the role to permission table, request dependencies. |
| `store/` | `Store` protocol with `MemoryStore` (demo, dev, tests) and `FirestoreStore` (production). |
| `domain/` | Pure functions: trust/freshness, money (Decimal), status resolution, validators, redaction, clock. |
| `seed.py` | Deterministic, clearly-flagged demo data for the in-memory store only. |

### Request lifecycle

1. Middleware assigns a request id (echoed in `X-Request-ID`), reads `X-PlugOrbit-Source`, and stores both in a context
   variable so audit entries can record them without every function passing them down. It also sets
   `Cache-Control: no-store` and security headers.
2. `require("<permission>")` authenticates the bearer token (Firebase ID token with revocation check, or a dev token
   when `ADMIN_DEV_AUTH` is on) and returns a `Principal`; a missing permission is a 403 `FORBIDDEN`.
3. The route calls a service. The service validates, applies the rule, writes through the `Store`, and calls
   `audit.record(...)` for anything sensitive.
4. Errors leave as `{detail:{code,message,fields?}}`. Codes are stable and machine-readable (`STALE_VERSION`,
   `LARGE_PRICE_CHANGE`, `NOT_READY`, `AMOUNT_TOO_HIGH`, ...); the UI branches on the code, not on the text.

### The Store abstraction

`Store` is a ten-method protocol (`get/list/create/set/update/delete/next_seq/append_audit`). Services only use it, so
the whole domain is tested against `MemoryStore` with no credentials or network. `FirestoreStore` is intentionally
thin. `list()` supports **equality filters only**, executed server-side, so no composite indexes are required
(`firestore.indexes.json` is empty on purpose). Range filters, ordering and paging happen in the service layer.

`append_audit` is the one place that needs a transaction: it reads the audit chain head, builds the next entry
from it and writes both atomically, so two simultaneous admins cannot fork the chain.

### Concurrency and idempotency

* **Optimistic concurrency.** Every editable document has a `version`. Updates send `expectedVersion`; a mismatch is a
  409 `STALE_VERSION` and the UI shows "someone else changed this, reload". Nothing is silently overwritten.
* **Idempotent refunds.** The refund request carries an `Idempotency-Key`; replaying it returns the original result
  rather than refunding twice. The dialog generates a fresh key each time it is opened.
* **Each session settles once.** A settlement stamps `settlementId` on the sessions it includes.

### Scaling path

Phase 1 volumes (hundreds of stations, thousands of sessions a month) are served by "equality filter, then filter and
sort in Python". The known ceilings, and the planned fix for each, are:

| Ceiling | Where | Fix when it bites |
|---|---|---|
| Full-collection reads for lists and KPIs (`sessions`, `stations`) | overview, analytics, transactions, health | Maintain daily roll-up documents (`rollups/{yyyymmdd}`) from a Firestore trigger or Cloud Scheduler job; read those for dashboards. |
| Pairwise duplicate-station scan is O(n²) | data quality scan | Geohash bucket the stations first; compare only within neighbouring cells. |
| Offset paging on in-memory results | every list | Cursor paging on an indexed `createdAt`/`startedAt` once ordering moves to Firestore (then add the composite indexes). |
| Audit `verify` walks the whole chain | audit | Checkpoint every N entries; verify from the last trusted checkpoint. |

None of these change the API contract.

## Frontend (`admin-web/src`)

| Folder | Responsibility |
|---|---|
| `design/` | `tokens.ts` (mobile theme port), `applyTokens.ts` (writes CSS variables), `global.css`, `components.css`. |
| `ui/` | The reusable kit: Button, Card/KpiCard, Fields, DataTable, Badges, States, Drawer/Dialog/ConfirmDialog, Toast, ActionMenu, charts, AuditTimeline, ConnectorImage, BrandLogo, Icon. |
| `api/` | `http.ts` (typed fetch with timeout, error envelope, 401 hook) and `types.ts` (a TypeScript mirror of the API). |
| `services/` | One typed module per backend area (`adminPartnerService`, `adminStationService`, ... `adminConfigService`). Screens never call `fetch`. |
| `auth/` | Auth context (Firebase or demo), permission checks, idle timeout, secure sign-out. |
| `app/` | Router, guards (`RequireAuth`, `RequirePermission`), shell, sidebar, top bar, global search, error boundary. |
| `hooks/` | `useResource` (loading/error/data with derived loading), `useUrlState`, `useDebounced`, `useNow`. |
| `domain/` | Pure client logic: permission list, trust display (`effectiveConfidence`), formatters. |
| `features/` | One folder per screen group; every page is lazy-loaded. |

Design choices worth knowing:

* **Route-level code splitting.** An admin downloads only the screens they open; each screen is its own chunk (4–16 kB
  gzip-compressed, 13 kB for the station detail), on top of a shared entry chunk, React and Firebase.
* **Server state is not copied into global stores.** Screens fetch with `useResource` and re-fetch after a mutation.
  The only shared state is the shell's overview snapshot (refreshed every 60 s) for the health pill and bell.
* **Trust is checked twice.** The API already downgrades a stale "live" status, and the client's `effectiveConfidence`
  re-checks the timestamp against the clock, so a tab left open for an hour cannot keep showing Live.
* **Filters live in the URL** (`useUrlState`), so a filtered Stations list or a Support ticket can be shared as a link.
* **Maps degrade, they do not break.** See [DEPLOYMENT](DEPLOYMENT.md#google-maps).

## Environments

| Environment | Store | Sign-in | Notes |
|---|---|---|---|
| `development` / `test` | In-memory demo store (or Firestore if a key exists) | Demo role picker if `ADMIN_DEV_AUTH` | Banner "Demo data" is always visible. |
| `staging` / `production` | Firestore only | Firebase Auth only | The API **refuses to start** if dev auth is on, Firestore is inactive, or CORS is `*`. API docs (`/docs`) are disabled. |
