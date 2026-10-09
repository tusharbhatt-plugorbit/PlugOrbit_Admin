# Security

The admin console handles money, personal data and what drivers are told about chargers. It is built so that the
**API is the only trust boundary**: the browser is never trusted to enforce anything.

## Authentication

| Concern | How |
|---|---|
| Sign-in | Firebase Auth (email + password) in the browser; the ID token is sent as a bearer token |
| Verification | `firebase-admin` verifies the token **with revocation checking** on every request |
| Who is an admin | A record in the `admins` collection (uid → role, status). A valid Firebase user who is not an admin gets 403 `NOT_AN_ADMIN`; a disabled admin gets 403 `ADMIN_DISABLED` |
| Roles | Stored in Firestore, **not** in the token, so a role change or a disable applies on the next request, not at token expiry |
| First admin | `BOOTSTRAP_SUPER_ADMIN_EMAILS` lets listed, *verified* emails become Super Admin on first sign-in; everyone else must be invited from Settings → Admin roles |
| Sign-out | Audited; Firebase refresh tokens are revoked so the session cannot be revived |
| Idle timeout | `adminIdleTimeoutMinutes` (default 30, configurable) ends the session after inactivity; expiry or revocation (401) ends it the same way, with a message |
| Demo sign-in | HMAC dev tokens, accepted **only** when `ADMIN_DEV_AUTH=true`. The API refuses to start with it on in staging or production, and `/auth/dev-*` answer 403 when it is off |

No admin password or token is ever stored by this system. Firebase Auth owns credentials; enable MFA in Firebase for admin
accounts (recommended, see the hardening checklist).

## Authorisation (RBAC, least privilege)

Four roles. The table below is generated from `backend/app/security/permissions.py`, the single source of truth. Routes
declare the permission they need (`require("refunds:issue")`); a route may require several (all must be held). The web
app receives the caller's permission list from `GET /auth/me` and only *hides* what the API would refuse anyway.

| Permission | Super Admin | Operations | Finance | Support |
|---|:-:|:-:|:-:|:-:|
| `overview:read` | ✓ | ✓ | ✓ | ✓ |
| `partners:read` | ✓ | ✓ | ✓ | ✓ |
| `partners:write` | ✓ | ✓ | · | · |
| `partners:review` | ✓ | ✓ | · | · |
| `stations:read` | ✓ | ✓ | ✓ | ✓ |
| `stations:write` | ✓ | ✓ | · | · |
| `stations:publish` | ✓ | ✓ | · | · |
| `stations:override` | ✓ | ✓ | · | · |
| `connectors:write` | ✓ | ✓ | · | · |
| `pricing:write` | ✓ | ✓ | · | · |
| `transactions:read` | ✓ | ✓ | ✓ | ✓ |
| `refunds:issue` | ✓ | · | ✓ | · |
| `settlements:read` | ✓ | · | ✓ | · |
| `settlements:run` | ✓ | · | ✓ | · |
| `settlements:approve` | ✓ | · | ✓ | · |
| `settlements:pay` | ✓ | · | ✓ | · |
| `support:read` | ✓ | ✓ | ✓ | ✓ |
| `support:write` | ✓ | ✓ | · | ✓ |
| `users:read` | ✓ | ✓ | ✓ | ✓ |
| `users:restrict` | ✓ | · | · | ✓ |
| `users:reveal` | ✓ | · | · | ✓ |
| `dataquality:read` | ✓ | ✓ | · | · |
| `dataquality:resolve` | ✓ | ✓ | · | · |
| `health:read` | ✓ | ✓ | · | · |
| `analytics:read` | ✓ | ✓ | ✓ | · |
| `notifications:read` | ✓ | ✓ | · | ✓ |
| `notifications:write` | ✓ | ✓ | · | · |
| `integrations:read` | ✓ | ✓ | ✓ | · |
| `integrations:write` | ✓ | · | · | · |
| `audit:read` | ✓ | ✓ | ✓ | · |
| `settings:read` | ✓ | ✓ | ✓ | · |
| `settings:write` | ✓ | · | · | · |
| `roles:manage` | ✓ | · | · | · |

Role intent: **Super Admin**, everything including roles and platform settings. **Operations**, partners, stations,
connectors, pricing, data quality, charger health (no money movement). **Finance**, transactions, refunds, settlements and payouts
(read-only on the network). **Support**, tickets, user help and account restrictions (no pricing, money or audit).

Guard rails inside the API, beyond the matrix:

* You cannot change your own role or disable yourself (`SELF_CHANGE`), and the last active Super Admin cannot be removed or
  disabled (`LAST_SUPER_ADMIN`).
* Settlement approval is **maker-checker**: the person who ran a settlement cannot approve it (`MAKER_CHECKER`), unless the
  platform setting is switched off.
* Refunds cannot exceed what was captured, cannot target operator-paid sessions, and are idempotent.
* A price move above 50% needs a second explicit confirmation.
* A station cannot go live until its checklist passes; a suspended partner's stations are hidden from the app automatically.

## Personal and financial data

* **Masking on the server.** Driver lists, details, transactions and tickets only ever carry masked phone/email
  (`98•••21`, `a•••@example.com`) and a short display name (`Asha K.`). *Reveal contact* requires `users:reveal`, a
  written reason, and is audited. The UI cannot unmask something the API did not send.
* **No raw card data.** Cards and UPI are handled by the payment gateway; the admin sees gateway references and amounts.
* **No raw bank accounts.** The partner form rejects values that look like account numbers; only a gateway/vendor
  reference is kept, shown as `••••1234`.
* **PAN, GSTIN and the payout reference** are validated (format, GSTIN check digit, PAN match) and returned in full only to callers
  who maintain or pay partners (`partners:write` or `settlements:read`: Super Admin, Operations, Finance). Support sees the partner's
  name and contact details but only `••••234F`-style masks of the identifiers, and no payout reference (`taxIdsMasked: true`).
* **KYC / bank documents are not uploaded, stored or displayed.** If they are added later they must live in private,
  access-controlled storage with short-lived signed URLs, never public links ([PENDING_DECISIONS](PENDING_DECISIONS.md#kyc-documents)).
* **Photos** on stations must be `https://` links; the UI notes they should come from private storage or a CDN.
* **Audit snapshots are redacted**: any key that looks like a secret (`secret`, `password`, `token`, `apikey`, `credential`,
  `authorization`, ...) is replaced by `[redacted]` before it is written.

## Audit

Every sensitive change is recorded with actor (uid, name, email, role), time, action, entity, before/after, a required
reason, request id and source. Entries are append-only and **hash-chained**
(`hash = sha256(prevHash | canonical entry)`), written in a transaction that also advances the chain head, so concurrent writers
cannot fork it. `GET /audit/verify` recomputes the chain and reports the first altered or missing entry. The API has no
endpoint that edits or deletes an entry and Firestore rules deny client writes.
**Limit:** the hash chain makes tampering *detectable*, not impossible; someone with project-owner access to Firestore can
still rewrite history *and* recompute the chain. Export the chain head hash periodically to an external, write-once
location (see the hardening checklist) to close that gap.

Audited actions include: sign-in/out, partner create/edit/submit/approve/reject/suspend/reactivate, station
create/edit/publish/hide/status-override/merge, connector create/edit/delete/override, price change/cancel, refund,
settlement run/adjust/approve/hold/paid, ticket create/update/note, user restrict/unrestrict/reveal, data-quality actions,
configuration changes, admin invite/role change/disable, notification create/edit/publish.

## Transport, headers and browser

* HTTPS only (Firebase Hosting / Cloud Run). `Cache-Control: no-store` on API responses.
* The API sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`; Firebase Hosting
  adds `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` and `Permissions-Policy` to the web app (`firebase.json`).
  A Content-Security-Policy is **not** set yet (see PENDING_DECISIONS).
* **CORS** is an explicit allow-list (`CORS_ORIGINS`); `*` is rejected in production. No cookies are used (bearer tokens), so
  there is no CSRF surface.
* **No secrets in the browser bundle.** Only public identifiers are `VITE_*`: the Firebase web config (public by design)
  and the Google Maps **browser** key, which must be restricted by HTTP referrer and API in Google Cloud. The service-account
  key lives only on the server (Secret Manager or workload identity).
* **No raw HTML.** The UI never uses `dangerouslySetInnerHTML` (an ESLint rule forbids it); all values render as text.
* **Input validation** is on the server (pydantic, unknown fields rejected, lengths and ranges bounded) and again in the forms.

## Environment safety

`staging`/`production` refuse to start if: `ADMIN_DEV_AUTH` is on, Firestore is not the active store, or CORS allows `*`. The
API docs (`/docs`, `/openapi.json`) are off there. Demo data and the simulated payment gateway exist only with the in-memory
store, are labelled "Demo" throughout the UI, and are never loaded against Firestore. Outside demo mode the payment gateway is
"not configured" and a refund returns 501 `INTEGRATION_UNAVAILABLE` rather than pretending money moved.

## Hardening checklist before go-live

- [ ] Enable **MFA** for every admin account in Firebase Auth (and consider restricting sign-in to your Google Workspace domain).
- [ ] Run the API on Cloud Run with a **dedicated service account** (Firestore + Auth admin only); no key file in the image.
- [ ] Restrict the **Maps key** by referrer (`https://admin.<your-domain>/*`) and to the Maps JavaScript API; set a quota and a budget alert.
- [ ] Set Firebase Hosting and Cloud Run to the **same region**; keep the API ingress to "all" only if Hosting rewrites cannot be used, otherwise "internal and Cloud Load Balancing".
- [ ] Add **rate limiting / Cloud Armor** in front of the API (no application-level throttling exists in Phase 1).
- [ ] **Export the audit chain head** nightly (Cloud Scheduler → write-once bucket) and alert if `GET /audit/verify` ever returns `ok:false`.
- [ ] Turn on **Firestore PITR/backups** and test a restore.
- [ ] Decide on the **client-IP audit** and trusted-proxy setup (PENDING_DECISIONS).
- [ ] Pen-test the refund, settlement and role-management flows with the Finance and Super Admin roles separately.
- [ ] Review `firestore.rules` stays deny-all unless a specific, narrow mobile read rule is added deliberately.

## Known limitations (stated plainly)

* The Firestore adapter has been exercised only through its interface and the in-memory twin, not against a live project from
  this build environment. Run the deployment smoke test in [DEPLOYMENT](DEPLOYMENT.md#first-deploy-smoke-test) first.
* No application-level rate limiting or lockout; rely on Firebase Auth's own throttling and an edge control.
* Client IP is not recorded in audit entries.
* A driver restriction is recorded here; blocking the driver is enforced by the mobile Backend (see MOBILE_CONTRACT).
