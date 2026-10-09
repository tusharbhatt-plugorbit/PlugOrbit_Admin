# API reference

Base path: `/admin/v1`. JSON over HTTPS. Every endpoint needs `Authorization: Bearer <Firebase ID token>` except `GET /health`, `GET /meta` and the two development-only demo sign-in endpoints.
In development (and only there) the FastAPI-generated, always-current reference is served at `/docs` and `/openapi.json`;
both are disabled when `ENVIRONMENT` is `staging` or `production`. This page documents the conventions and which
permission guards each endpoint.

## Conventions

**Errors.** One envelope, identical to the mobile Backend, for every failure (including validation and 404/405):

```json
{ "detail": { "code": "STALE_VERSION", "message": "Someone else changed this. Reload and try again.", "fields": { "name": "Too short" } } }
```

`code` is stable and machine-readable; `message` is safe to show to the admin; `fields` appears on 422 validation
errors (`VALIDATION_ERROR`) and maps input names to messages. Some codes carry extra context (`missing` and `role` on 403,
`failing` and `checks` on `NOT_READY`, `maximum` on `AMOUNT_TOO_HIGH`).

| Status | Typical codes |
|---|---|
| 401 | `MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `TOKEN_REVOKED` |
| 403 | `FORBIDDEN` (role lacks the permission), `NOT_AN_ADMIN`, `ADMIN_DISABLED`, `MAKER_CHECKER`, `DEV_AUTH_DISABLED` |
| 404 | `NOT_FOUND` |
| 409 | `STALE_VERSION`, `NOT_READY`, `LARGE_PRICE_CHANGE`, `NOT_REFUNDABLE`, `NOTHING_TO_REFUND`, `NOTHING_PAYABLE`, `LAST_SUPER_ADMIN`, `SELF_CHANGE`, `ALREADY_MERGED`, `ALREADY_CLOSED`, `ALREADY_RESTRICTED`, `NOT_RESTRICTED` |
| 422 | `VALIDATION_ERROR`, `INVALID_REQUEST`, `AMOUNT_TOO_HIGH`, `UNKNOWN_PARTNER` |
| 501 | `INTEGRATION_UNAVAILABLE` (a dependency is not wired, e.g. the payment gateway outside demo mode) |
| 503 | `AUTH_NOT_CONFIGURED` |

**Request bodies** reject unknown fields (`extra="forbid"`) and trim whitespace, so a typo is an error, not a silent no-op.
**Reasons** (3–500 characters) are required on every sensitive action: price changes, refunds, status overrides, hides,
restrictions, partner decisions, settlement adjustments/holds, data-quality actions, configuration saves.

**Optimistic concurrency.** Editable resources return a `version`. `PUT`/`PATCH` bodies include `expectedVersion`; if it
is stale the API answers 409 `STALE_VERSION` and changes nothing.

**Idempotency.** `POST /transactions/{id}/refund` accepts an `Idempotency-Key` header; repeating a key returns the
current state instead of refunding again.

**Pagination.** List endpoints take `limit` (1–200, default 50) and `offset` and return
`{ "items": [...], "total": n, "limit": n, "offset": n }` (the audit log pages by `before_seq`).

**Money** is INR, computed with `Decimal` and serialised as numbers rounded to 2 places. **Time** is epoch milliseconds (UTC).

**Request tracing.** Send `X-Request-ID` (or let the server create one); it is returned in the same header and recorded on
audit entries together with `X-PlugOrbit-Source` (default `admin-web`). Client IPs are not recorded yet (see PENDING_DECISIONS).

**Caching.** Responses carry `Cache-Control: no-store`.

## Authentication flow

1. The web app signs the admin in with Firebase Auth (email + password) and obtains an ID token.
2. `POST /auth/session` (once, after sign-in) records the login in the audit trail and returns the principal
   (`uid`, `name`, `email`, `role`, `roleLabel`, `permissions[]`), the idle timeout and the feature flags.
3. Every later call sends the ID token. The API verifies it with revocation checking, loads the admin record, and
   uses its **current** role. A role change or disable takes effect on the next request.
4. `POST /auth/logout` audits the sign-out and revokes the refresh tokens.

First sign-in: an invited admin's pending record is adopted by verified email, or, if the email is in
`BOOTSTRAP_SUPER_ADMIN_EMAILS`, the account becomes a Super Admin. Anyone else gets 403 `NOT_AN_ADMIN`.

`GET /auth/dev-roles` and `POST /auth/dev-login` exist only when `ADMIN_DEV_AUTH=true` (development/test).

## Endpoints

### Auth and session

| Method | Path | Permission |
|---|---|---|
| GET | `/auth/dev-roles` | none; development only (403 `DEV_AUTH_DISABLED` otherwise) |
| POST | `/auth/dev-login` | none; development only (403 `DEV_AUTH_DISABLED` otherwise) |
| POST | `/auth/session` | any signed-in admin |
| GET | `/auth/me` | any signed-in admin |
| POST | `/auth/logout` | any signed-in admin |

### Meta and lookups

| Method | Path | Permission |
|---|---|---|
| GET | `/meta` | none (public, secret-free: environment, data mode, which sign-in methods exist) |
| GET | `/lookups` | any signed-in admin |

### Overview

| Method | Path | Permission |
|---|---|---|
| GET | `/overview` | `overview:read` |

### Partners

| Method | Path | Permission |
|---|---|---|
| GET | `/partners` | `partners:read` |
| POST | `/partners` | `partners:write` |
| GET | `/partners/{partner_id}` | `partners:read` |
| PUT | `/partners/{partner_id}` | `partners:write` |
| POST | `/partners/{partner_id}/transition` | `partners:write` |

### Stations, connectors, pricing, map

| Method | Path | Permission |
|---|---|---|
| GET | `/stations` | `stations:read` |
| POST | `/stations` | `stations:write` |
| GET | `/stations/{station_id}` | `stations:read` |
| PUT | `/stations/{station_id}` | `stations:write` |
| POST | `/stations/{station_id}/publish` | `stations:publish` |
| POST | `/stations/{station_id}/hide` | `stations:publish` |
| POST | `/stations/{station_id}/status` | `stations:override` |
| DELETE | `/stations/{station_id}/status` | `stations:override` |
| GET | `/stations/{station_id}/connectors` | `stations:read` |
| POST | `/stations/{station_id}/connectors` | `connectors:write` |
| PUT | `/connectors/{connector_id}` | `connectors:write` |
| DELETE | `/connectors/{connector_id}` | `connectors:write` |
| POST | `/connectors/{connector_id}/override` | `stations:override` |
| DELETE | `/connectors/{connector_id}/override` | `stations:override` |
| GET | `/stations/{station_id}/tariffs` | `stations:read` |
| POST | `/stations/{station_id}/tariffs` | `pricing:write` |
| POST | `/tariffs/{tariff_id}/cancel` | `pricing:write` |
| GET | `/map/stations` | `stations:read` |

### Transactions and refunds

| Method | Path | Permission |
|---|---|---|
| GET | `/transactions` | `transactions:read` |
| GET | `/transactions/{session_id}` | `transactions:read` |
| POST | `/transactions/{session_id}/refund` | `refunds:issue` |

### Settlements

| Method | Path | Permission |
|---|---|---|
| GET | `/settlements` | `settlements:read` |
| POST | `/settlements/run` | `settlements:run` |
| GET | `/settlements/{settlement_id}` | `settlements:read` |
| POST | `/settlements/{settlement_id}/adjustments` | `settlements:run` |
| POST | `/settlements/{settlement_id}/approve` | `settlements:approve` |
| POST | `/settlements/{settlement_id}/hold` | `settlements:approve` |
| POST | `/settlements/{settlement_id}/paid` | `settlements:pay` |

### Support

| Method | Path | Permission |
|---|---|---|
| GET | `/tickets` | `support:read` |
| POST | `/tickets` | `support:write` |
| GET | `/tickets/{ticket_id}` | `support:read` |
| PATCH | `/tickets/{ticket_id}` | `support:write` |
| POST | `/tickets/{ticket_id}/notes` | `support:write` |

### Users

| Method | Path | Permission |
|---|---|---|
| GET | `/users` | `users:read` |
| GET | `/users/{user_id}` | `users:read` |
| GET | `/users/{user_id}/sessions` | `users:read`, `transactions:read` |
| POST | `/users/{user_id}/restrict` | `users:restrict` |
| POST | `/users/{user_id}/unrestrict` | `users:restrict` |
| POST | `/users/{user_id}/reveal` | `users:reveal` |

### Data quality

| Method | Path | Permission |
|---|---|---|
| GET | `/data-quality/summary` | `dataquality:read` |
| GET | `/data-quality/issues` | `dataquality:read` |
| POST | `/data-quality/scan` | `dataquality:resolve` |
| POST | `/data-quality/issues/{issue_id}/action` | `dataquality:resolve` |
| POST | `/data-quality/merge` | `dataquality:resolve`, `stations:write` |

### Charger health

| Method | Path | Permission |
|---|---|---|
| GET | `/health/summary` | `health:read` |
| GET | `/health/chargers` | `health:read` |

### Analytics

| Method | Path | Permission |
|---|---|---|
| GET | `/analytics/summary` | `analytics:read` |

### Notifications

| Method | Path | Permission |
|---|---|---|
| GET | `/notifications` | `notifications:read` |
| POST | `/notifications` | `notifications:write` |
| PUT | `/notifications/{nid}` | `notifications:write` |
| POST | `/notifications/{nid}/publish` | `notifications:write` |

### Integrations

| Method | Path | Permission |
|---|---|---|
| GET | `/integrations` | `integrations:read` |
| PATCH | `/integrations/{key}` | `integrations:write` |
| POST | `/integrations/{key}/test` | `integrations:write` |

### Audit log

| Method | Path | Permission |
|---|---|---|
| GET | `/audit` | `audit:read` |
| GET | `/audit/verify` | `audit:read` |
| GET | `/audit/catalog` | `audit:read` |

### Settings, roles, configuration

| Method | Path | Permission |
|---|---|---|
| GET | `/config` | `settings:read` |
| PUT | `/config` | `settings:write` |
| GET | `/roles` | any signed-in admin |
| GET | `/admins` | `roles:manage` |
| POST | `/admins` | `roles:manage` |
| PATCH | `/admins/{admin_id}` | `roles:manage` |

`GET /health` (outside `/admin/v1`, so not reachable through the Hosting rewrite) is an unauthenticated liveness check that returns no data.

## Examples

Set a price (new tariff version, with a reason; a >50% change also needs `confirmLargeChange`):

```http
POST /admin/v1/stations/st-chargezone-neemrana/tariffs
{ "connectorId": "st-chargezone-neemrana-c1", "pricePerKwh": 19.5, "gstPercent": 18, "reason": "Operator notice dated 3 Oct" }
```

A price that moves more than 50% is rejected with 409 `LARGE_PRICE_CHANGE` until the request is repeated with
`"confirmLargeChange": true`.

Partial refund (safe to retry with the same key):

```http
POST /admin/v1/transactions/PO-6A4K92/refund
Idempotency-Key: 5d2f0c8e-...
{ "amount": 100.00, "reason": "Charger slowed down mid-session" }
```

Go live (fails with 409 `NOT_READY` and the list of failing checks until the go-live checklist passes):

```http
POST /admin/v1/stations/st-e2e-test-plaza/publish
```
