# Domain rules: trust, readiness, quality, health, money

These are the rules the console enforces. Each lives in one backend module (named below) with tests, and every threshold is
either configurable in Settings or a named constant.

## 1. Data trust: when may something be called Live?

`backend/app/domain/trust.py` (a port of the mobile app's `domain/trust.ts`, plus `manual`).

| Source | Fresh | Result |
|---|---|---|
| `operator_feed` (API / OCPP / OCPI) | updated ≤ `liveMaxAgeSec` (5 min) ago | **Live** |
| `operator_feed` | older | **Estimated** (the feed went quiet) |
| third-party / aggregated | any | **Estimated** |
| `user_report` (a driver said so) | any | **User-confirmed** |
| `manual` (an admin override) | until it expires | **Manual** |
| none / never updated | n/a | **Unknown** |

* A status is **stale** when it is older than `staleAfterSec` (30 min), except Manual, which is the admin's responsibility.
* A **station** is only as trustworthy as its weakest connector (rank: live > manual > user > estimated > unknown).
* **What the driver app is allowed to show:** `manual` is mapped to `user` ("a person confirmed it"). An admin typing a status never
  produces a Live badge anywhere, in the admin or in the app.
* **Overrides** (station or connector) require a reason. An admin can choose an expiry from 5 minutes to 14 days (or leave none, and it
  stays until cleared); overrides created by a data-quality fix expire after 12 h. An expired override simply stops applying; the reported
  state underneath is never touched.
* The web client re-derives trust from the timestamp on every render, so an open tab cannot keep showing Live.

## 2. Go-live checklist

`services/stations.py → readiness()`. A station is `draft` until **every** check passes; *Go live* is refused with 409 `NOT_READY`
and the failing checks otherwise.

1. Partner is **active** (approved).
2. Map pin is set (not null, not 0,0).
3. Address and opening hours are filled in.
4. At least one connector.
5. Every connector has type, power and charger ID.
6. Every connector has a price (an active tariff).
7. Integrated stations have a real connection method (API / OCPP / OCPI); manually-run stations must be **External**.
8. External stations have operator instructions.
9. Location and details are marked **verified**.

`visibleInApp = publication == "live" AND not merged AND partner.status == "active"`. It is recomputed whenever a station is
published, hidden or merged and whenever a partner changes status, so suspending a partner hides its stations immediately.

## 3. Pricing

`services/tariffs.py`. A price change appends a tariff version with `effectiveFrom` (now or scheduled), the **previous** values
and a required reason; nothing is overwritten and a scheduled change can be cancelled before it starts. A connector-specific
price beats a station-wide one. A change of **more than 50 %** to the per-kWh price needs `confirmLargeChange: true`
(409 `LARGE_PRICE_CHANGE` otherwise). Each charging session snapshots the tariff it was charged under.

## 4. Data-quality scanner

`services/dataquality.py`. `POST /data-quality/scan` is deterministic and idempotent: an issue id is `dq-<type>-<key>`, so a
re-scan updates what is still wrong, re-opens what came back and auto-clears what was fixed. Draft and merged stations are not scanned.

| Type | Raised when | Severity |
|---|---|---|
| Stale charger status | a feed connector's status is older than the stale window | warning |
| No fresh feed | **every** feed connector of an API/OCPP/OCPI station has no heartbeat inside the stale window (the integration is likely down) | critical |
| Missing connector data | no connectors; or a connector lacks type, power or charger ID | critical if live (none at all), else warning |
| Wrong pricing | no active price (critical if live); ₹0 on an integrated station; outside ₹5–₹50 per kWh (critical); more than 60 % from the network median for that connector type, with at least 5 samples (warning) | see left |
| Duplicate station | two non-draft stations within 150 m whose normalised names are ≥ 80 % similar, unless an admin said "not a duplicate" | warning |
| Conflicting sources | a Live feed says *available* while ≥ 2 drivers reported *offline/occupied* in the last hour | warning |
| User fault reports | ≥ 2 driver fault reports on one connector in 24 h (≥ 4 is critical) | warning/critical |

Actions (each needs a reason, is audited, and closes or advances the issue):

* **Mark verified**: for stale/no-feed issues, sets a **Manual** override on the affected connectors for 12 h (never Live); for pricing, records
  the checked tariff so the rule stays quiet for it; for duplicates, records that the pair is not a duplicate.
* **Downgrade confidence**: overrides affected connectors to *Unknown* for 12 h so the app stops showing a status nobody can vouch for.
* **Hide station**: takes the station out of the app.
* **Dismiss** / **Mark reviewed**.
* **Merge duplicates** (separate flow): moves the other station's connectors (skipping charger IDs the kept station already has),
  sessions and tickets to the kept station, hides and flags the merged one, resolves its open issues, and audits it.

An issue an admin resolved is not re-opened for 24 h even if still detected (no flapping).

## 5. Charger health

`services/health.py`. Per connector, with the reasons listed on screen:

| Severity | Any of |
|---|---|
| **Critical** | no heartbeat or silent past the stale window (feed connectors) · ≥ 25 % of ≥ 8 sessions failed in 30 days · ≥ 3 failed sessions this week |
| **Warning** | heartbeat slower than 2 × the live window · ≥ 10 % failure rate · uptime < 95 % · any failed session this week |
| **Healthy** | otherwise |

A critical connector already in maintenance is shown as a warning ("Already in maintenance"), since someone knows. Draft and
merged stations are excluded. The summary also reports integration health by method (connectors online / total).

## 6. Money

### Refunds (`services/transactions.py`)
Allowed only on **integrated** sessions that are `paid` or `partially_refunded`. `refundable = captured − refunded`; asking for more
is 422 `AMOUNT_TOO_HIGH`; nothing left is 409 `NOTHING_TO_REFUND`; operator-paid sessions are 409 `NOT_REFUNDABLE`. A reason is required;
the same `Idempotency-Key` never refunds twice; the result is a `refund` payment event plus an audit entry. The gateway call goes
through the `PaymentGateway` interface: simulated in demo mode, and 501 `INTEGRATION_UNAVAILABLE` until a real gateway is wired.

### Session price (`domain/money.py`)
`subtotal = kWh × price/kWh + minutes × price/min + session fee + idle minutes × idle fee + parking hours × parking fee`;
`GST = subtotal × gst%`; `gross = subtotal + GST` (what the driver pays). All arithmetic is `Decimal`, rounded to paise at the edge.

### Settlement maths
`services/settlements.py`, per partner and period, from **integrated** sessions that were captured and not yet settled:

```
gross        = Σ captured                      (GST-inclusive, what drivers paid)
refunds      = Σ refunded on those sessions
base         = gross − refunds
fee          = revenue_share:        base × commission %
               flat_fee_per_kwh:     Σ energy × flat fee   (sessions not fully refunded)
               listing_only:         0
fee GST      = fee × platformFeeGstPercent (default 18 %)
net payable  = base − fee − fee GST + adjustments
```

`fee` and `fee GST` are rounded to paise first and the net is derived from those exact figures, so a settlement always adds up on paper.
**Operator-paid (external) sessions are never settled**: the operator already took that money; they are reported as `excludedExternal`.
Each session is stamped with `settlementId` and can be settled once. Workflow: `in_review → approved → paid` (with `on_hold` as a side
state that can be released). Adjustments are allowed while in review or on hold. **Maker-checker**: the person who ran a settlement
cannot approve it. **Paid** needs a UTR/reference (an account number is rejected) and a positive net.

> **Tax treatment is not final.** Whether the platform fee is invoiced separately, how GST on a partner's supply is handled
> (marketplace / TCS / TDS) and who is the supplier of record are Finance/CA decisions
> ([PENDING_DECISIONS](PENDING_DECISIONS.md#settlement-tax-treatment)). Every settlement carries a note saying so.
