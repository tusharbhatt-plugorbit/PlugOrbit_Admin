# Testing

Four layers, from cheapest to most realistic. Run the first three on every change; run the fourth before a release.

| Layer | Command | What it proves | Count |
|---|---|---|---|
| Backend unit + API | `cd backend && python3 -m pytest -q` | Every business rule through the real HTTP routes, with an in-memory store and simulated gateway | 130 |
| Frontend static | `cd admin-web && npm run typecheck && npm run lint` | Strict TypeScript; ESLint incl. react-hooks v7 (purity, refs, set-state-in-effect) and a ban on `dangerouslySetInnerHTML` | n/a |
| Frontend unit/component | `cd admin-web && npm test` | Pure logic and the reusable kit under jsdom | 72 in 12 files |
| Build | `cd admin-web && npm run build` | Typecheck plus a production bundle; each route is its own chunk | n/a |
| Design parity | `cd admin-web && npm run check:theme -- <path to plugorbit/LoginApp/src/theme.ts>` | Web tokens equal the mobile theme (colours, radii, spacing, type scale) | n/a |
| End-to-end smoke | `cd admin-web && npm run e2e` (API on :8000 with `ADMIN_DEV_AUTH=true`, `npm run dev` on :5173) | The real flows in a real browser, asserting **no unexpected console errors** | 22 steps |

`npm run check` = typecheck + lint + tests + build.

## Backend (`backend/tests`)

All tests use a fresh seeded `MemoryStore` and a `SimulatedGateway`; none needs credentials or the network. Signing in uses the dev-token path so each test can act as any role.

| File | Covers |
|---|---|
| `test_auth_rbac.py` (16) | Anonymous, garbage and expired tokens; the server-side permission list; roles cannot do what they do not hold (across modules); every role only holds real permissions; a disabled admin is locked out immediately; dev sign-in refused when disabled; production refuses unsafe settings; error envelope and security headers |
| `test_partners.py` (11) | PAN/GSTIN/phone validation and normalisation, account-number rejection, duplicate identity, review workflow and who may approve, optimistic concurrency, tax-identifier masking |
| `test_stations.py` (15) | Draft-first creation, go-live checklist (each failing check), `visibleInApp` recompute on publish/hide/partner suspension, overrides with expiry, connector rules, QR code format |
| `test_pricing.py` (8) | Append-only tariffs, previous values, scheduling and cancelling, connector vs station scope, >50 % confirmation, reasons |
| `test_money.py` (17) | Session price maths (Decimal), refund caps/idempotency/operator-paid rejection, settlement formula, once-only settling, maker-checker, UTR rules, rounding to the paisa |
| `test_dataquality.py` (13) | Each rule's trigger and non-trigger, idempotent re-scan, auto-clear, actions, merge, no flapping |
| `test_users_support.py` (12) | Server-side masking, reveal with reason + audit, restrict/unrestrict, ticket lifecycle, internal notes, SLA |
| `test_audit.py` (7) | Entries on sensitive actions, redaction, hash chain, tamper detection (edited and deleted entries), filters |
| `test_platform.py` (18) | Overview, analytics (unavailable metrics are listed, not invented), charger health, integrations honesty, notifications, settings/roles (invite, change role, last-Super-Admin and self-change guards), feature flags, config validation |
| `test_domain.py` (10) | Trust/freshness table, status resolution and derivation, validators |
| `test_firebase_init.py` (3) | Key file vs Application Default Credentials vs demo fallback (Firebase SDK patched) |

## Frontend (`admin-web/src/**/*.test.ts(x)`)

| Area | Covers |
|---|---|
| `api/http` | Bearer header, JSON, the error envelope to `ApiError`, timeout and network errors, 401 hook |
| `app/routes`, `Sidebar`, `guards` | Every nav item has a permission and a page; hidden when the permission or feature flag is missing; direct URL to a forbidden page shows "no access"; unauthenticated redirects to sign-in |
| `design/tokens` | Tokens apply as CSS variables; **no raw hex in the stylesheets** |
| `domain/trust`, `format` | Live/stale derivation from timestamps, INR/date/relative-time formatting |
| `hooks/useResource` | Loading derived from inputs, refetch, error and dependency changes |
| `ui/Badges`, `Overlays`, `DataTable`, `charts` | Admin-set data is never labelled Live; dialogs trap and restore focus, reasons are required; table states; chart axes, labels and the table twin |

## End-to-end smoke (`admin-web/e2e/smoke.mjs`)

Playwright (Chromium) against the real UI and the demo API, as the four roles:

* Guards and navigation: redirect to sign-in, role-specific menus, forbidden direct URL, every sidebar destination loads without errors.
* Partner → station → connector → price → go live (including validation errors and the PAN confirmation).
* Tariff edit keeps history; a large price jump requires a second confirmation.
* Network map loads and selecting a station shows its panel (schematic fallback; no key in the sandbox).
* Data quality: verifying a stale-feed issue produces a Manual (never Live) status.
* Finance: transaction detail, partial refund with a reason, approving another admin's settlement.
* Support: open a ticket, add an internal note, no access to settlements or audit; masked user data and reveal with a reason; sign out.
* Super Admin: the audit log shows the refund and price changes and verifies; settings validation and audited save.

Expected 4xx responses in negative-path steps (422/409/403) are tolerated; **any other console error or page error fails the run**.

## Manual checks worth doing before a release

* **Google Maps with a real key** (cannot be exercised from CI or this build sandbox): pins, selection, the pin picker, and the four error states ([DEPLOYMENT](DEPLOYMENT.md#google-maps)).
* **Firebase sign-in** (email/password, MFA, revoked token, idle timeout) against a staging project.
* **Firestore adapter** against a staging project: the smoke test in [DEPLOYMENT](DEPLOYMENT.md#first-deploy-smoke-test).
* **Responsive**: 1440, 1280 and tablet (820) widths; the page itself must not scroll sideways (verified for Overview, Stations, Transactions and Data Quality at 1280 and 820 during development).
* **Keyboard and screen reader** pass on dialogs, drawers, tables and the sidebar.

## Known gaps (stated plainly)

* The Firestore adapter has no automated test against a live or emulated Firestore. The recommended next step is to run the backend suite against the Firestore **emulator** by adding a second `store` fixture parametrised over `MemoryStore` and `FirestoreStore`; the Store interface is deliberately small to make that a short job.
* Firebase ID-token verification, invite adoption and the bootstrap-super-admin path are not covered by automated tests (they need the Firebase Auth emulator or a staging project); the dev-token path exercises everything after authentication.
* No automated visual-regression tests; the design check is the token-parity script plus manual review.
* No load testing; see the scaling path in [ARCHITECTURE](ARCHITECTURE.md#scaling-path).
* The simulated gateway proves the refund flow and idempotency, not a real provider's behaviour (webhooks, async refunds, failures).
