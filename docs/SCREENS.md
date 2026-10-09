# Screens

Routes, permissions and data sources for everything in the sidebar and the detail/form pages. The sidebar order is
the one from the brief. Items are hidden (and their route refuses) when the caller lacks the permission; phase-gated
modules are also hidden until their feature flag is on (Settings → Feature flags).

**Backend status key.** **Real**: implemented in the API and exercised by tests; it persists to Firestore when the API
runs with a service-account key (demo mode uses the in-memory store). **Simulated**: works end to end but against a
stand-in (the payment gateway). **Not wired**: the screen shows an honest "not connected" state.

| # | Screen | Route | Permission | Backend |
|---|---|---|---|---|
| 1 | Admin shell | all | sign-in | Real |
| 2 | Overview | `/` | `overview:read` | Real |
| 3 | Partners | `/partners` | `partners:read` | Real |
| 4 | Add / Edit / View Partner | `/partners/new`, `/partners/:id` | `partners:write` / `:read` | Real |
| 5 | Stations | `/stations` | `stations:read` | Real |
| 6 | Add / Edit Station | `/stations/new`, `/stations/:id/edit` | `stations:write` | Real |
| 7 | Station detail | `/stations/:id[/connectors\|pricing\|activity]` | `stations:read` | Real |
| 8 | Connectors (tab) | `/stations/:id/connectors` | `connectors:write` to edit | Real |
| 9 | Pricing (tab) | `/stations/:id/pricing` | `pricing:write` to edit | Real |
| 10 | Network Map | `/map` | `stations:read` | Real data; Google Maps needs a key |
| 11 | Data Quality | `/data-quality` | `dataquality:read` | Real |
| 12 | Charger Health | `/charger-health` | `health:read` | Real (from stored heartbeats) |
| 13 | Transactions | `/transactions` | `transactions:read` | Real |
| 14 | Transaction detail | `/transactions/:id` | `transactions:read`; refund `refunds:issue` | Real; refund via **simulated** gateway |
| 15 | Settlements | `/settlements` | `settlements:read` | Real (maths, approval, audit); payout is recorded, not sent |
| 16 | Support | `/support` | `support:read` | Real |
| 17 | Users | `/users` | `users:read` | Real (admin view of the app's `users`) |
| 18 | Integrations | `/integrations` | `integrations:read` | Honest status: derived from real data where possible, otherwise "not connected" |
| 19 | Audit Log | `/audit-log` | `audit:read` | Real |
| 20 | Settings / Roles | `/settings` | `settings:read`; roles `roles:manage` | Real |
| 21 | Analytics (Phase 2) | `/analytics` | `analytics:read` + flag | Real for what is measurable; the rest is listed as unavailable |
| 22 | Notifications / Content (Phase 2) | `/notifications` | `notifications:read` + flag | Real for authoring and scheduling; **delivery is not wired** |

(Rows 7–9 are one screen with tabs; the brief's "20 screens" are the numbered items of its implementation order, here
split so each route is visible.)

---

## Admin shell
Dark navy L-shaped chrome (sidebar + top bar) with the light, rounded content sheet, as in the mobile app's dark chrome
and light cards. **Sidebar**: 15 destinations; it collapses to an icon rail at 1100 px and below, and to a slide-in drawer (hamburger in the top bar) at 760 px and below.
**Top bar**: page title and subtitle, *Demo data* pill (demo mode only), system-health pill (critical issues count,
links to Data Quality), global search (Ctrl/⌘ K: pages, partners, stations, a session id such as `PO-…`, a ticket id such as `TKT-…`), notifications bell
(top attention items), admin identity with role, sign out. A banner states when data is demo. Sessions end after
`adminIdleTimeoutMinutes` of inactivity (default 30); an expired or revoked token (401) ends the session the same way, and the
sign-in screen says why.

## Overview
"What needs my attention right now?" KPI cards (live stations, sessions 7d with change, GMV 7d with change, open
issues with high-priority count), a 7-day sessions trend, **Needs attention** (urgent tickets, critical data issues
grouped per problem, offline live stations, settlements awaiting approval, partners awaiting verification, failed
payments), **Operational health** (live-feed %, payment success %, station-data freshness %, offline stations) and
recent activity (audit permitting). Every attention item links to where it is fixed.

## Partners and Add/Edit Partner
List with search, status chips (draft, pending review, active, rejected, suspended), commercial model, station count.
Form sections: Identity (legal name, display name), Contact, **Tax and payout** (PAN, GSTIN validated with its
checksum and cross-checked with the PAN, payout *reference*; raw bank account numbers are rejected), Commercial
terms (revenue share % / flat fee per kWh / listing only, or a commission plan), Integration method, Notes.
Verification workflow: draft → *submit for review* → *approve* (requires the reviewer to confirm PAN and GSTIN were
checked) or *reject* (reason) → active ↔ suspended (reason; suspending hides the partner's stations from the app).
KYC/bank documents are **not** uploaded or displayed here ([PENDING_DECISIONS](PENDING_DECISIONS.md#kyc-documents)).

## Stations and Add/Edit Station
List with search; filters for status (live/occupied/offline/unknown/stale/needs review), partner and app visibility;
per-row action menu (view, edit, hide/unhide). The form has a location section with the **map pin picker** (click or
drag; coordinates stay editable by hand when Maps is unavailable), address, hours, access and parking notes,
amenities, photos (https links only), session mode (integrated / external), integration method, operator
instructions (required for external stations) and verification status. New stations are always created as **draft,
hidden from the app**.

## Station detail (Overview, Connectors, Pricing, Activity)
* **Overview**: status with confidence badge and age, the **go-live checklist** (each failing check explains how to
  fix it, *Go live* is disabled until all pass), manual status override (reason + expiry), partner and integration,
  map.
* **Connectors**: add/edit/remove connectors (type, power, charger id, EVSE id, integration), per-connector status
  with confidence, **manual override with expiry**, connector artwork identical to the mobile app.
* **Pricing**: current price per connector, full history (every previous value kept), scheduled changes (cancellable),
  new price with required reason, optional effective time, and a second confirmation when it moves more than 50%.
* **Activity**: this station's audit entries.

## Network Map
All stations as pins coloured by status, with stale/needs-review markers; filters (status chips; partner, city, connector type, power and data source), a
clear-filters action, and a selection panel (status, confidence, connectors, last updated, integration, reliability, link to the
station). With no key, or a blocked or failed
load, the screen shows a specific configuration notice and falls back to a schematic map that stays fully usable.

## Data Quality
Summary by type and severity, issue list with filters, and a **Scan now** button (last scan time shown). Per-issue
actions, each requiring a reason and each audited: *Mark verified* (sets a Manual override, never Live),
*Downgrade confidence*, *Hide station*, *Dismiss*, *Mark reviewed*. A **Merge duplicates** flow moves connectors and
history to the kept station and hides the other. Rules: [DATA_QUALITY](DATA_QUALITY.md).

## Charger Health
Per-connector severity (critical / warning / healthy) from heartbeat age, 30-day fault rate, uptime and recent
failures, with the reasons spelled out, plus summary counts and integration uptime by method. Filter by severity,
partner, station.

## Transactions and Transaction detail
List with search (session id, station, user id, gateway reference), payment-status chips, date range, integration mode and
station filters, and GMV/refund totals. Detail shows the **payment flow** (pre-authorisation → capture → release → refund), the
**breakdown** (energy, time, session fee, idle/parking, GST, total), the tariff **snapshot** applied at the time,
**reconciliation** (captured − refunded, gateway reference), and **Issue refund** (full or partial, reason required,
capped at what is left, idempotent). External (operator-paid) sessions are shown as such; they cannot be refunded here.

## Settlements
Runs per partner and period with gross, refunds, fee, GST on fee, adjustments and net payable; included sessions.
Actions: *Run settlement*, *Add adjustment* (reason), *Approve* (maker-checker: not the person who ran it, unless
disabled in Settings), *Put on hold*, *Mark paid* (needs a UTR/reference). Formula: [DATA_QUALITY](DATA_QUALITY.md#settlement-maths).

## Support
Queue with filters (status, priority, category, owner including *Assigned to me* and *Unassigned*), ticket drawer with linked session/station/user, status,
priority and owner changes, and **internal notes** (never visible to the driver). Categories follow the brief:
charging issue, payment issue, charger offline, broken connector, wrong pricing, access blocked, location problem,
refund dispute, other. Support can open a ticket but cannot see settlements or the audit log.

## Users
Driver list with **masked** phone/email and a short display name (`Asha K.`), session count, spend, open tickets,
restriction state. Detail shows sessions and tickets. *Reveal contact* needs `users:reveal`, a reason, and is audited;
*Restrict / Unrestrict* needs a reason and a confirmation.

## Integrations
Grouped status of charging networks (API, OCPP, OCPI, manual), Maps, Payments, Messaging, Analytics/monitoring,
Firebase and a "Later" group. Where PlugOrbit can compute the truth (a feed is connected if its stations report fresh
heartbeats) it does; where it cannot, it says *Not connected* or *Simulated*. Editing notes and **Test connection** (which records a
result) need `integrations:write`, which only Super Admin holds; Operations and Finance can read. Secrets are never shown or stored here.

## Audit Log
Search (action, entity, reason), category chips, an action filter, an admin filter (name or email) and a date range; each row
opens a drawer with before/after, reason, source, request id and the entry hash with its predecessor. **Verify integrity** runs the chain check and reports the first broken entry, if any. Export is
deliberately not offered in Phase 1 (see PENDING_DECISIONS).

## Settings / Roles
* **Rules**: freshness windows (Live ≤ 5 min, stale > 30 min by default), minimum route battery reserve, idle
  timeout, GST on platform fee, maker-checker, **ranking weights** (price is refused in the battery-critical bucket).
* **Commission plans**: standard, launch, listing-only, editable.
* **Feature flags**: Analytics and Notifications are built; the rest are visible but reserved for later phases.
* **Admin roles** (`roles:manage`): invite by email, change role, disable. You cannot change your own role or disable
  yourself, and there must always be at least one active Super Admin. Every save needs a reason and is audited; saves use `expectedVersion`.

## Analytics (Phase 2)
Sessions, GMV, average session value, energy delivered, payment success, a daily sessions column chart, top stations
and partners, status mix, and the previous period for comparison only when the previous period is complete.
Metrics that cannot be measured yet (search → station conversion, navigation → session, average wait, route repeat
rate) appear in a clearly labelled **Not available yet** list with what each needs.

## Notifications / Content (Phase 2)
Author service messages, charger-outage notices, payment and support messages, route alerts, FAQ entries and banners;
choose channels (in-app, push, email, SMS), audience, optional station, schedule. Draft → publish. **Publishing records
the notice; delivery through FCM/email/SMS is not wired** and the screen says so.

---

## States covered on every screen

Loading (skeleton or inline spinner), empty (with the next action), error (network, timeout, server and 403 are
distinct, with *Retry*), forbidden ("You don't have access", not a blank page), stale/offline (trust badges and an
age shown with every status), and validation (field-level messages from the API's `fields`).

## Responsive behaviour

Designed for 1440 and 1280 px desktops (at 1280 px and below the KPI grid goes from four columns to two and page padding
tightens). At 1100 px and below the sidebar is an icon rail and two-column layouts stack; at 760 px and below the sidebar is a drawer. Wide tables scroll inside their own container (the page itself never scrolls sideways).
