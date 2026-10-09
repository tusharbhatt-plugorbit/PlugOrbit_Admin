# Pending decisions and open items

Things this build deliberately did **not** decide on the company's behalf, or could not finish inside Phase 1. Each has a recommended default
(what the code does today) and an owner who should confirm it. Items that start with **Blocks launch.** must be settled before a production launch.

## Product and platform

### Repository and branch
**Needs a decision now.** The brief says to work only on `dev_phase1` (and never touch `main`). The mobile project's branch is `Dev_Phase1` in the separate `PlugOrbit` repository, and this
work was done on `claude/awesome-hopper-mxe8n9` in `PlugOrbit_Admin`, which had no commits and no `dev_phase1` branch. **Decide** where the admin lives: keep `PlugOrbit_Admin`
as its own repository (recommended: the stacks differ, React/Python vs React Native/Python, and the deploy targets differ) or move the folders into the mobile repo's
`Dev_Phase1`. Nothing was pushed to any `main`, and no pull request was opened.

### Feed ingestion
**Blocks launch.** The admin **reads** live charger state (`status`, `statusSource`, `statusUpdatedAt`, `lastHeartbeatAt`, session and fault counters) but nothing in this repository **produces** it.
Operator API / OCPP / OCPI receivers and the driver-report path are a separate service. Until one writes those fields, every real connector is *Unknown*
(the honest state) and Charger Health has nothing to rank. **Decide** build order and ownership (a worker in this API vs a separate ingestion service);
see [MOBILE_CONTRACT](MOBILE_CONTRACT.md#what-the-status-ingestion-service-must-write) for the field list.

### Mobile read path and restriction enforcement
**Blocks launch.** The mobile app does not read curated stations from Firestore yet, and it does not check `users.status == "restricted"`. **Decide** whether the app reads through a mapped
server endpoint (recommended) or Firestore rules, and who enforces restrictions (the mobile Backend, before starting a session). Details in
[MOBILE_CONTRACT](MOBILE_CONTRACT.md).

### Freshness windows
Defaults mirror the mobile app (Live ≤ 5 min, stale > 30 min) and are editable in Settings (audited). Operators with faster feeds may justify a shorter live window.
**Confirm** the numbers with Product before launch. (Changing them changes what counts as Live everywhere in the console.)

### Ranking weights, commission plans, SLAs
Seeded defaults: ranking weights per mode (price is refused in battery-critical), plans *Standard 12 %*, *Launch 8 %*, *Listing only*, and ticket response targets urgent 4 h / high 24 h /
medium 72 h / low 7 d (`services/support.py`). All are placeholders for Product/Operations to confirm; weights and plans are editable in Settings, SLAs are a code constant.

### Partner and staff access
Phase 1 has four internal roles. Partner self-service, partner staff accounts, fleet accounts and similar are reserved feature flags (Phase 3) and have no UI.
**Decide** whether any partner-facing view is needed earlier (read-only settlement statements are the usual first ask).

### Analytics sources
Four metrics are listed as *Not available yet* because the data does not exist: search → station conversion, navigation → session, average wait time, route repeat rate.
They need app events (Firebase Analytics → BigQuery export is the usual route). **Decide** the event schema with the mobile team.

## Money, tax and legal

### Payment gateway
**Blocks launch.** No payment provider is integrated. The demo uses a simulated gateway; production returns 501 `INTEGRATION_UNAVAILABLE` on refund rather than pretending money moved.
**Decide** the provider and whether it supports marketplace split/route payouts, then implement the `PaymentGateway` interface (`services/gateway.py`): refund, status lookup,
webhooks for async refunds and settlement-to-bank reconciliation.

### Settlement tax treatment
**Blocks launch.** The maths is implemented and tested (see [DATA_QUALITY](DATA_QUALITY.md#settlement-maths)) but **Finance/CA must sign off** how it is treated in law: who is the supplier of record for the charging
service, whether the platform fee is invoiced separately (GST at the configurable 18 %), TCS under GST e-commerce rules, TDS on partner payouts, and invoice generation. Every settlement
carries a note saying tax treatment is pending. Do not pay real partners from this until that is answered.

### Maker-checker for small teams
On, by default: the person who ran a settlement cannot approve it. A two-person finance team may find this blocking; it can be switched off in Settings (audited). **Decide** the policy.

### Refund limits
Any Finance admin may refund up to the captured amount, with a reason. **Decide** whether to add an approval threshold (for example, refunds above ₹2,000 need a second approver).

### Data protection (DPDP Act)
The console minimises personal data (masking, reason-gated reveal, audited), but retention periods, deletion requests, consent records and breach procedures are not defined.
**Decide** them with Legal; the audit log intentionally retains actor identities indefinitely.

### KYC documents
KYC and bank documents are **not** uploaded, stored or displayed anywhere. Partners are verified by recording that PAN (and GSTIN) were checked. If documents are needed:
private bucket, per-document access control, short-lived signed URLs, malware scanning, retention and deletion rules, and a `partners:documents` permission. **Decide** before adding any upload.

## Security and operations

- **MFA** for admin accounts is a Firebase setting, not enforced by this code. Recommended: required for everyone.
- **Client IP in audit entries.** Not recorded. Behind Hosting and Cloud Run the socket address is a proxy, so a trusted `X-Forwarded-For` hop count must be configured first.
- **Content-Security-Policy** is not set. A policy must allow Google Maps (`maps.googleapis.com`, `maps.gstatic.com`, `*.googleapis.com` images), Firebase Auth
  (`identitytoolkit.googleapis.com`, `securetoken.googleapis.com`, `apis.google.com`), and inline styles used by the charts. Recommended: ship `Content-Security-Policy-Report-Only` first.
- **Audit export / anchoring.** The chain makes edits detectable, not impossible. Anchor the head hash externally on a schedule ([SECURITY](SECURITY.md#audit)).
- **Rate limiting** is not implemented in the API; use Cloud Armor or an API gateway.
- **Firestore adapter** is verified only against its interface and the in-memory twin. Run the staging smoke test and, ideally, add an emulator-backed CI job ([TESTING](TESTING.md#known-gaps-stated-plainly)).

## Features that were scoped but are not wired

| Item | State |
|---|---|
| Notification **delivery** (push/email/SMS) | Authoring, scheduling and publish are real; delivery is not wired and the screen says so |
| Payout execution | Settlement is computed, approved and marked paid with a UTR; no bank/gateway payout is sent |
| Address search / geocoding in the pin picker | Pin by click/drag or typed coordinates; a Places Autocomplete search box needs the Places API enabled on the browser key and a decision on quota/cost |
| Audit log export (CSV) | Not offered in Phase 1 |
| Partner KYC document upload | Not built (see above) |
| Roll-up documents for dashboards | Not needed at Phase 1 volumes; see the scaling path in [ARCHITECTURE](ARCHITECTURE.md#scaling-path) |

## Design notes to confirm

### Placeholder contrast
Input placeholder text uses the mobile theme's `placeholder` colour (`#94A3B8` on `#EEF2F7`, 2.3:1), which is below the 4.5:1 text guideline. It was kept to avoid diverging from the
mobile visual language. **Decide** whether to darken it in the mobile theme first (then mirror here) or accept it for placeholders only. All other text/background pairs measure ≥ 4.7:1.

### Demo mode
The in-memory store and simulated gateway exist for demos and tests, and every page shows a *Demo data* banner when they are active. A shared demo environment must run with `ENVIRONMENT=development` (the API refuses the in-memory store in staging and
production, so demo data can never reach a real project). **Decide** whether such an environment is wanted for sales or training.
