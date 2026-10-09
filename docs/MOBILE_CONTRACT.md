# Mobile app contract

How the admin console and the PlugOrbit mobile app (`plugorbit/LoginApp`, branch `Dev_Phase1`) relate. The admin changes **none** of the
mobile code and none of its visuals; it shares a Firebase project, a vocabulary and a few identifiers.

**Status today.** The mobile app currently reads stations from its own mock data and Google Places (`src/services/mock/*`) and uses the
Backend only for OTP/auth and the `users` profile document. So this contract is the **target** for the day the app reads PlugOrbit-curated
stations; nothing here has been wired into the mobile app yet, and that work is outside this repository.

## What is shared today

| Thing | Shared how |
|---|---|
| Firebase project and service-account key | Same `FIREBASE_CREDENTIALS_PATH` convention; one project serves both |
| `users/{uid}` documents | Written by the mobile Backend; read by the admin (masked) and annotated with `status`, `restriction`, `restrictionHistory` |
| Error envelope | `{"detail": {"code", "message", "fields?"}}` in both APIs |
| Design tokens | Ported 1:1 and checked by `npm run check:theme` ([DESIGN_SYSTEM](DESIGN_SYSTEM.md)) |
| Trust vocabulary and freshness windows | `live / estimated / user / unknown` and 5 min / 30 min defaults ([DATA_QUALITY](DATA_QUALITY.md#1-data-trust-when-may-something-be-called-live)) |
| Connector types and amenities | Same ids (`CCS2, Type2, CHAdeMO, GBT, LECCS`; `restroom, cafe, food, shopping, parking, wifi, lounge, shade`, plus `open_24x7` here) |
| Charger/QR code | `STATION-SLUG-LABEL`, see below |

## The rules the app can rely on

1. **Visibility.** Query `stations where visibleInApp == true`. That boolean is maintained by the admin as
   `publication == "live" AND not merged AND partner active`; a draft, hidden, merged or suspended-partner station is never visible.
2. **Trust.** The app must derive trust from the feed's source and timestamp with its own `dataTrust()`. The admin guarantees it never
   stores a status that claims more than it can prove: an admin-entered status is exposed to the app as `source: user_report` (never `operator_feed`),
   so the app labels it *User-confirmed*, not Live.
3. **Prices** are the tariff in force now (`effectiveFrom <= now`, not cancelled; connector-specific beats station-wide), and the
   app should treat an admin-entered price as `user_report` too.
4. **Restricted users.** The admin sets `users/{uid}.status = "restricted"`. **The mobile Backend must refuse to start sessions for them**;
   the admin only records the decision (and audits it).
5. **Refunds** are issued by the admin through the payment gateway and appended to the session's `paymentEvents`; the app should read the
   session ledger rather than keep its own balance.
6. **External stations** (`sessionMode: external`) have `operatorInstructions`; the app shows them and never starts or bills a session itself.

## Mapping an admin station to the app's `Station`

A suggested mapping for whoever builds the app-facing read endpoint (or Firestore read rule). It is documentation, not shipped code.

| App `Station` field | Source in the admin data |
|---|---|
| `id` | `stations/{id}` (`st-<slug>`) |
| `name`, `address`, `latitude`, `longitude`, `hours` | same-named fields |
| `operator` | partner `displayName`, else `legalName` |
| `amenities` | `amenities` without `open_24x7` (which the app expresses in `hours`) |
| `integration` | `sessionMode` |
| `operatorInstructions` | same |
| `connectors[]` | `{ id, label, type, powerKw }` from `connectors`; `status` = the **effective** status (override wins while active, otherwise the reported status, with trust applied); `pricePerKwh` and `idleFeePerMin` from the active tariff |
| `statusFeed` | `{ source, updatedAt }` of the weakest connector: reported `statusSource`/`statusUpdatedAt`, or `{ user_report, override.at }` while an override is active |
| `priceFeed` | `{ user_report, tariff.createdAt }` for admin-entered prices (an operator pricing feed does not exist yet) |
| `rating`, `successfulSessionsPct`, `reliabilityPct` | **Not owned by the admin.** Compute from sessions/health in the mobile Backend; `0` means unknown. Never invent them |
| `sponsored` | `false` in Phase 1 (the `sponsored_stations` flag is reserved) |

## Charger code (QR)

The app's `chargerCode(station, connector)` is `station.id` without the `st-` prefix, upper-cased, a hyphen, then the connector label upper-cased:
`st-chargezone-neemrana` + `C2` → `CHARGEZONE-NEEMRANA-C2`. The admin generates exactly that string
(`connector.qrCode`) and renders it as a QR on the connector panel, so a printed code scans in the existing app. Connector ids are
`<stationId>-<label slug>` (`st-chargezone-neemrana-c2`), which the app also accepts. The mobile code marks this format as a placeholder
(`TODO(integration)`), so if an operator's own QR payload is adopted, change it in one place on each side.

## What the status-ingestion service must write

The admin reads, but does not produce, live charger state. Whatever receives operator feeds (API, OCPP, OCPI) and driver reports must
maintain these `connectors/{id}` fields; the console's trust, health and data-quality screens all depend on them:

`status`, `statusSource` (`operator_feed | user_report | none | ...`), `statusUpdatedAt`, `lastHeartbeatAt`, `sessions30d`,
`failedSessions30d`, `faults30d`, `uptimePct`, `recentFailures7d`, `userReports[{ kind: "fault"|"status", status?, at }]`.

Until that exists, new connectors show **Unknown**, which is the truthful state.

## Firestore rules for a mobile read path

`firestore.rules` is deny-all. When the app reads stations directly, add a narrow rule, for example:

```
match /stations/{id} { allow read: if resource.data.visibleInApp == true; }
match /connectors/{id} { allow read: if get(/databases/$(database)/documents/stations/$(resource.data.stationId)).data.visibleInApp == true; }
match /tariffs/{id}     { allow read: if get(/databases/$(database)/documents/stations/$(resource.data.stationId)).data.visibleInApp == true; }
```

and keep partners, sessions, settlements, tickets, audit, config and admins closed. Note that `connectors` documents also hold
overrides with admin reasons and user reports, so prefer a server-side read endpoint that returns the mapped shape above over exposing the raw documents.
