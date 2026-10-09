# Data model (Firestore)

All collections are accessed **only** by the Admin API through `firebase-admin`; `firestore.rules` denies every client
read and write. Document ids are readable slugs where a human will see them (`st-chargezone-neemrana`,
`st-chargezone-neemrana-c1`, `PO-6A4K92`, `TKT-1042`). Names live in one place: `backend/app/services/colls.py`.

Conventions: timestamps are epoch milliseconds (UTC); money is INR as a number rounded to 2 decimals; editable documents
carry `version` (starts at 1, +1 on each write), `createdAt`, `updatedAt`, `createdBy`, `updatedBy`; demo documents carry
`isDemo: true` and exist only in the in-memory store.

```
partners 1───* stations 1───* connectors 1───* tariffs (append-only, optionally per connector)
                   │              │
                   └──────────────┴──* sessions *───1 users     sessions *───1 settlements
tickets ──(optional links)── sessions / stations / users
dq_issues ── stations / connectors        audit (hash-chained)     config/platform     admins     integrations     notifications
```

## Who writes what

| Data | Written by |
|---|---|
| partners, stations, connectors (identity/config), tariffs, tickets, settlements, dq_issues, config, admins, integrations, notifications, audit | **The Admin API** |
| `connectors.status`, `statusSource`, `statusUpdatedAt`, `lastHeartbeatAt`, `sessions30d`, `failedSessions30d`, `faults30d`, `uptimePct`, `recentFailures7d`, `userReports` | **A status-ingestion service that does not exist yet** (operator API / OCPP / OCPI feeds, driver reports). The admin only *reads* these and writes `override`. New connectors start as `unknown`. See [PENDING_DECISIONS](PENDING_DECISIONS.md#feed-ingestion) |
| `sessions` and payment events | The **mobile Backend / payment flow** (Phase 1 admin reads them and appends `refund` events and `settlementId`) |
| `users` | The **mobile Backend** (profiles). The admin reads and may add `restriction` |

## `admins`
`{ email, name, role: super_admin|operations|finance|support, status: invited|active|disabled, createdAt, lastLoginAt, invitedBy }`.
Document id = Firebase Auth uid (an invite is keyed by a placeholder and re-keyed on first sign-in by verified email).
Roles live here, not in the token, so changes apply on the next request.

## `partners`
Fields of the partner form: `legalName`, `displayName`, `contactName`, `phone` (E.164), `email`, `pan` (validated),
`gstin` (checksum + PAN cross-check), `payoutReference` (gateway/vendor reference; raw account numbers are rejected),
`commercialModel: revenue_share|flat_fee_per_kwh|listing_only`, `commissionPercent`, `flatFeePerKwh`, `commissionPlanId`,
`integrationMethod`, `notes`. Workflow: `status: draft|pending_review|active|rejected|suspended`,
`verification: { panVerified, gstinVerified, reviewedBy, reviewedAt, rejectionReason }`, version fields.

## `stations`
`name, partnerId, address, city, state, latitude, longitude, hours, accessInstructions, photos[https], amenities[],
parkingInfo, sessionMode: integrated|external, integrationMethod: api|ocpp|ocpi|manual, operatorInstructions,
verification: unverified|pending|verified`, plus workflow fields:

| Field | Meaning |
|---|---|
| `publication` | `draft` (never shown), `live`, `hidden` (taken down, with a reason in the audit log) |
| `visibleInApp` | **Denormalised** `publication == "live" && !mergedInto && partner.status == "active"`. Recomputed on every publish/hide/merge/partner change. The mobile app can query this one boolean |
| `mergedInto` | Set when the station was merged away as a duplicate |
| `notDuplicateOf[]` | Station ids an admin said are not duplicates (suppresses the duplicate rule) |
| `isDemo` | Demo marker |

## `connectors`
Config: `stationId, evseId, label, chargerId, type (CCS2|CHAdeMO|Type2|...), powerKw, integrationMode`.
Reported state (written by ingestion): `status: available|occupied|offline|maintenance|unknown`,
`statusSource: operator_feed|user_report|manual|none|<third party>`, `statusUpdatedAt`, `lastHeartbeatAt`,
`sessions30d`, `failedSessions30d`, `faults30d`, `uptimePct`, `recentFailures7d`,
`userReports[{ kind: fault|status, status?, at }]`.
Admin state: `override: { status, reason, at, by, expiresAt|null } | null` (while active it wins and confidence is
`manual`), `priceVerifiedTariffId` (the tariff an admin marked as checked, silencing the pricing rule for it).

## `tariffs` (append-only)
`stationId, connectorId|null (null = every connector), pricePerKwh, pricePerMin, pricePerSession, parkingFeePerHour,
idleFeePerMin, gstPercent, effectiveFrom, reason, previous: {…the tariff it replaced…}, createdAt, createdBy`; `status` is only ever
written as `cancelled`. Nothing is overwritten: a change is a new document. The tariff in force at time *t* is the latest
`effectiveFrom <= t` that is not cancelled, and a connector-specific price beats a station-wide one on a tie. A session
stores a **snapshot** of the tariff it was charged under, so history stays correct after later price changes. A
scheduled (future) tariff can be cancelled before it starts.

## `sessions`
`stationId, stationName, partnerId, connectorId, connectorLabel, connectorType, powerKw, userId, vehicle, startedAt,
endedAt, energyKwh, durationMin, tariff (snapshot), breakdown {energy, time, session, idle, parking, subtotal, tax, gross},
grossAmount, paymentMethod, paymentStatus: paid|pending|failed|refunded|partially_refunded|external,
integrationMode: integrated|external, gateway {name, reference}, paymentEvents[], refundedAmount, failureReason,
settlementId`.
`paymentEvents[]` is the payment ledger: `preauth`, `capture`, `release`, `refund` (with `idempotencyKey`, `actor`,
`reason`, `simulated`) and `failure`. `captured = Σ capture`; the refundable amount is `captured − refundedAmount`.

## `users`
Shared with the mobile Backend (`name`, `phone`, `email`, `vehicles[]`, ...). The admin API never returns raw contact
details unless a permitted admin gives a reason to *reveal* them; lists carry masked values only. Restrict/Unrestrict
write `status: "restricted"|"active"`, `restriction: { reason, by, byName, at } | null` and an append-only
`restrictionHistory[]`. **Enforcement belongs to the mobile Backend**: it must refuse to start sessions for a restricted
account ([MOBILE_CONTRACT](MOBILE_CONTRACT.md)).

## `settlements`
`partnerId, partnerName, periodStart, periodEnd, sessionIds[], sessionCount, grossValue, refunds, fee, taxes,
adjustments, adjustmentLines[], netPayable, terms {model, commissionPercent, flatFeePerKwh}, excludedExternal {count, value}
(external sessions are reported, never settled), status: in_review|approved|paid|on_hold, payoutReference (UTR),
createdBy, approvedBy, approvedAt, paidAt, taxNote`.

## `tickets`
`TKT-n` (atomic counter), `category, priority, status, subject, description, ownerId, ownerName, sessionId, stationId,
stationName, userId, notes[{id, body, by, byName, at}] (internal), source, resolvedAt`. SLA due/breached are
derived from priority and age, not stored.

## `dq_issues`
Deterministic id `dq-<type>-<key>` so a re-scan updates instead of duplicating: `type` (stale_status, no_fresh_feed,
wrong_pricing, duplicate_station, missing_connector_data, conflicting_sources, user_fault_report), `severity`, `stationId`,
`stationName`, `title`, `detail`, `status: open|reviewing|resolved|dismissed`, `detectedAt`, `lastSeenAt`, `resolution
{action, by, at, reason}`. An issue an admin resolved is not re-opened for 24 h even if the scanner still sees it (no flapping); one the scanner
auto-cleared re-opens as soon as the problem returns. `meta/dq_last_scan` stores
the last scan result.

## `audit` (append-only, hash-chained)
One document per entry, id = zero-padded `seq`. `{ seq, at, actor {uid, name, email, role}, action, actionLabel,
category, entityType, entityId, entityLabel, before, after, reason, source, requestId, prevHash, hash }` with
`hash = sha256(prevHash | canonical_json(entry without hash))`. Snapshots are passed through `redact()` first
(keys that look like secrets become `[redacted]`). The chain head is `meta/audit_head`. Nothing in the API updates or
deletes an entry, and Firestore rules deny client writes.

## `config/platform`
`liveMaxAgeSec, staleAfterSec, minRouteBatteryReservePct, adminIdleTimeoutMinutes, platformFeeGstPercent,
settlementMakerChecker, rankingWeights, featureFlags, commissionPlans[]`, versioned. Defaults are created on first read.

## `integrations`, `notifications`
`integrations/{key}`: operator-entered notes and the last test result only. **Never** secrets; live connection state is
derived at read time. `notifications/{id}`: `kind, title, body, channels[], audience, stationId, startsAt, endsAt,
status: draft|published, publishedAt`.

## Housekeeping collections
`counters/{name}` (atomic sequences, e.g. `tickets`) and `meta/{audit_head|dq_last_scan}`.

## Indexes

None are required. Every Firestore query the API makes is a conjunction of **equality** filters (for example
`tariffs where stationId == x`, `connectors where stationId == x`), which Firestore serves from its automatic
single-field indexes. Range filters, ordering and paging are applied in the service layer
(see [ARCHITECTURE → Scaling path](ARCHITECTURE.md#scaling-path)). `firestore.indexes.json` is therefore empty by design;
add composite indexes when ordering moves into Firestore.

## Retention and privacy

* Audit entries are kept indefinitely (they hold names of admins, never driver contact data).
* Driver contact details stay in `users` (owned by the mobile Backend) and are masked on the way out.
* KYC documents and bank statements are **not** stored by this system; see
  [PENDING_DECISIONS](PENDING_DECISIONS.md#kyc-documents).
