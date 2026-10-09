# PlugOrbit Admin

The internal operations console for PlugOrbit, the EV-charging co-driver app. Phase 1 is for **PlugOrbit staff only**:
there is no partner or customer sign-in here.

| Layer | Technology |
|---|---|
| Web app | React 18, TypeScript, Vite (route-level code splitting) |
| API | Python 3.13, FastAPI, pydantic v2 |
| Database / auth | Firebase: Firestore + Firebase Auth (via `firebase-admin`) |
| Maps | Google Maps JavaScript API (browser key from an env var) |

It is the "back office" of the mobile app. What an admin enters here (stations, connectors, prices, status) is what
drivers see, so the console is built around one rule the mobile app already follows:

> **Live is a claim PlugOrbit can only make about a fresh operator feed.** Anything an admin types in is *Manual* here
> and is shown to drivers as *User-confirmed*; an operator feed that has gone quiet is *Estimated*; nothing is ever
> presented as Live because somebody wanted it to be.

## What is built

All 20 screens from the brief, plus the shell, behind four roles (Super Admin, Operations, Finance, Support).

| Group | Screens |
|---|---|
| A, Shell and core | Admin shell · Overview · Partners · Add/Edit Partner · Stations · Add/Edit Station |
| B, Charging data | Connectors · Pricing · Network Map · Data Quality · Charger Health |
| C, Money and support | Transactions · Transaction Detail · Settlements · Support · Users |
| D, Platform control | Integrations · Audit Log · Settings / Roles |
| E, Phase 2 (flagged on) | Analytics · Notifications / Content |

Every screen has loading, empty, error, forbidden and (where it applies) stale/offline states. See
[docs/SCREENS.md](docs/SCREENS.md) for routes, permissions and what each screen is backed by.

### What makes it different

* **Same visual language as the mobile app.** Colours, radii, type scale, shadows, pills and connector artwork are
  ported 1:1 from `LoginApp/src/theme.ts`; a script (`npm run check:theme`) fails the build if they drift. No second
  design language. ([docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md))
* **A go-live checklist, not a switch.** A station cannot reach the app until the partner is active, the pin is set,
  every connector has type/power/charger ID and a price, and the station is verified.
* **Tamper-evident audit log.** Every sensitive change is a hash-chained, append-only entry with who, when, before,
  after and a required reason; `GET /audit/verify` proves nothing was edited or removed.
* **Prices are history, not edits.** A price change is a new tariff version with an effective time; the old one stays,
  and a >50% jump needs a second confirmation.
* **Data-quality scanner** that finds what the app should not trust (stale status, dead feeds, wrong prices,
  duplicate stations, conflicting sources, repeated driver fault reports) with one-click, reasoned fixes.
* **Money you can reconcile.** Refunds are idempotent and capped at what was captured; settlements are computed from
  captured payments, each session settles once, approval is maker-checker, and external (operator-paid) sessions are
  never settled.
* **Honest by construction.** Analytics lists the metrics that cannot be measured yet instead of inventing them; the
  Integrations screen shows what is actually connected; demo data is labelled everywhere it appears.

## Run it locally (demo mode, no credentials needed)

```bash
# 1. API: in-memory demo store, seeded with clearly-marked fictional data
cd backend
python3 -m pip install -r requirements-dev.txt
ENVIRONMENT=development ADMIN_DEV_AUTH=true \
  python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2. Web (in another terminal): proxies /admin/v1 to the API
cd admin-web
npm install
npm run dev          # http://127.0.0.1:5173
```

Open the app and choose a role on the sign-in screen (Super Admin, Operations, Finance, Support). Demo data resets
whenever the API restarts. The demo gateway is simulated; nothing in demo mode touches money or a real project.

To use **real** Firebase, Google Maps and sign-in, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Checks

```bash
cd backend   && python3 -m pytest -q                       # 130 tests
cd admin-web && npm run check                              # tsc + eslint + vitest (72) + vite build
cd admin-web && npm run check:theme -- /path/to/plugorbit/LoginApp/src/theme.ts
cd admin-web && npm run e2e                                # Playwright smoke, 22 steps (needs both servers running)
```

See [docs/TESTING.md](docs/TESTING.md) for what each layer covers and what it deliberately does not.

## Repository layout

```
admin-web/     React app          src/{app,auth,api,services,hooks,ui,design,domain,features,test}
backend/       FastAPI service    app/{routes,services,schemas,security,store,domain} + tests/
docs/          Documentation
firebase.json  Hosting (SPA + /admin/v1 -> Cloud Run) and Firestore config
firestore.rules, firestore.indexes.json
```

## Documentation

| Doc | Read it for |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | How the pieces fit, request lifecycle, store abstraction, scaling path |
| [SCREENS](docs/SCREENS.md) | Every screen: route, permission, data, actions, states |
| [DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md) | Token mapping to the mobile app, components, charts, status semantics |
| [API](docs/API.md) | Endpoint reference, conventions, error envelope, concurrency |
| [DATA_MODEL](docs/DATA_MODEL.md) | Firestore collections, fields, relationships, indexes |
| [SECURITY](docs/SECURITY.md) | Auth, RBAC matrix, PII, audit, hardening checklist |
| [DATA_QUALITY](docs/DATA_QUALITY.md) | Trust rules, go-live checklist, scanner and health rules, settlement maths |
| [MOBILE_CONTRACT](docs/MOBILE_CONTRACT.md) | What the mobile app can rely on from the admin |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Environment variables, Firebase and Cloud Run setup, Google Maps key, runbook |
| [TESTING](docs/TESTING.md) | Test strategy, commands, known gaps |
| [PENDING_DECISIONS](docs/PENDING_DECISIONS.md) | Product, finance and legal questions that need an owner |
