"""Integration registry and health.

The rule for this module: **never claim an integration works when it is not wired.** Each entry
reports its `mode`:
  live       a real probe ran (Firebase)
  derived    computed from real data we hold (charging-network feeds, from connector heartbeats)
  simulated  a demo stand-in (payment gateway in development)
  client     can only be verified in the browser (Google Maps key); the web app overlays this
  not_wired  not built yet: shown as 'Not configured' with how to set it up

Secrets are never stored, returned or shown. Only non-secret settings and the *names* of the
secrets in Secret Manager are kept.
"""
from collections import defaultdict

from ..domain import clock
from ..errors import not_found
from ..firebase import firebase_ready
from ..schemas.ops import IntegrationPatch
from ..security.principal import Principal
from ..store.base import Store
from . import audit
from . import config as config_service
from . import gateway as gateway_service
from .colls import CONNECTORS, INTEGRATIONS, STATIONS

FEED = ("api", "ocpp", "ocpi")

# key, group, name, description, setup hint, secret names (references only)
CATALOG: list[dict] = [
    {"key": "net_api", "group": "Charging networks", "name": "Operator API", "desc": "Vendor REST/webhook status feeds",
     "hint": "Register the operator's webhook with the ingestion service, then add the station's connectors in API mode.", "secrets": []},
    {"key": "net_ocpp", "group": "Charging networks", "name": "OCPP", "desc": "Direct charger connections (WebSocket)",
     "hint": "Point the charger's OCPP central-system URL at the ingestion service and register its charger ID.", "secrets": []},
    {"key": "net_ocpi", "group": "Charging networks", "name": "OCPI", "desc": "Roaming/CPO data exchange",
     "hint": "Exchange OCPI tokens with the partner and enable the Locations & Sessions modules.", "secrets": ["OCPI credentials token"]},
    {"key": "net_manual", "group": "Charging networks", "name": "Manual fallback", "desc": "Admin-entered status (shown as Manual, never Live)",
     "hint": "Always available. Use connector overrides in Stations.", "secrets": []},
    {"key": "maps_sdk", "group": "Maps", "name": "Google Maps JavaScript API", "desc": "Admin map and station pin picker",
     "hint": "Set VITE_GOOGLE_MAPS_API_KEY in the web build; restrict it to this site's origin and to the Maps JavaScript API.",
     "secrets": []},
    {"key": "maps_routes", "group": "Maps", "name": "Routes API", "desc": "Used by the mobile app for trip planning",
     "hint": "Enable Routes API in Google Cloud; restrict the key to that API.", "secrets": ["Routes API key"]},
    {"key": "maps_places", "group": "Maps", "name": "Places API (New)", "desc": "Used by the mobile app for nearby chargers",
     "hint": "Enable Places API (New); proxy through the Backend so the key stays server-side.", "secrets": ["Places API key"]},
    {"key": "pay_gateway", "group": "Payments", "name": "Payment gateway", "desc": "UPI / cards / netbanking, pre-authorisation and capture",
     "hint": "Choose a provider (pending decision), store its keys in Secret Manager and implement the gateway adapter.",
     "secrets": ["Gateway key ID", "Gateway key secret", "Webhook secret"]},
    {"key": "pay_refunds", "group": "Payments", "name": "Refunds", "desc": "Full and partial refunds from Transactions",
     "hint": "Needs the payment gateway adapter's refund() implemented.", "secrets": []},
    {"key": "pay_split", "group": "Payments", "name": "Marketplace split / payouts", "desc": "Automatic partner payouts (Phase 2)",
     "hint": "Phase 2. Phase 1 uses admin-reviewed settlement runs in Settlements.", "secrets": []},
    {"key": "msg_push", "group": "Messaging", "name": "Push (FCM)", "desc": "Service and charger-outage notifications",
     "hint": "Enable Firebase Cloud Messaging and implement the sender in the notifications service.", "secrets": []},
    {"key": "msg_email", "group": "Messaging", "name": "Email", "desc": "Transactional email",
     "hint": "Configure SMTP or an email API; keep credentials in Secret Manager.", "secrets": ["SMTP password"]},
    {"key": "msg_sms", "group": "Messaging", "name": "SMS / DLT", "desc": "OTP and alerts over a DLT-registered route",
     "hint": "Register sender ID and templates on DLT, then configure the SMS provider.", "secrets": ["SMS provider key"]},
    {"key": "mon_analytics", "group": "Analytics & monitoring", "name": "Firebase Analytics", "desc": "App events for conversion metrics",
     "hint": "Enable the SDK in the mobile app and export to BigQuery for funnel analytics.", "secrets": []},
    {"key": "mon_crashlytics", "group": "Analytics & monitoring", "name": "Crashlytics", "desc": "Mobile crash reporting",
     "hint": "Add the Crashlytics SDK to the mobile app.", "secrets": []},
    {"key": "mon_backend", "group": "Analytics & monitoring", "name": "Backend monitoring", "desc": "Uptime and error alerts for this API",
     "hint": "Use Cloud Run metrics + Cloud Monitoring alert policies on /health.", "secrets": []},
    {"key": "firebase", "group": "Platform", "name": "Firebase (Auth + Firestore)", "desc": "Admin sign-in and the database",
     "hint": "Place serviceAccountKey.json in backend/ (or use workload identity on Cloud Run).", "secrets": ["Service-account key"]},
    {"key": "later_oem", "group": "Later", "name": "OEM / OBD automatic SoC", "desc": "Read battery level from the car",
     "hint": "Planned for a later phase.", "secrets": []},
]


def _network_status(store: Store) -> dict[str, dict]:
    """Derive the three feed integrations from real connector heartbeats."""
    stale_ms = config_service.thresholds(config_service.get(store))[1]
    now = clock.now_ms()
    agg: dict[str, dict] = defaultdict(lambda: {"connectors": 0, "fresh": 0, "last": None})
    drafts = {s["id"] for s in store.list(STATIONS) if s["publication"] == "draft" or s.get("mergedInto")}
    for c in store.list(CONNECTORS):
        if c["stationId"] in drafts:
            continue
        m = c.get("integrationMode")
        a = agg[m]
        a["connectors"] += 1
        hb = c.get("lastHeartbeatAt")
        if hb is not None:
            a["last"] = max(a["last"] or 0, hb)
            if now - hb <= stale_ms:
                a["fresh"] += 1
    out = {}
    for key, method in (("net_api", "api"), ("net_ocpp", "ocpp"), ("net_ocpi", "ocpi")):
        a = agg.get(method)
        if not a or a["connectors"] == 0:
            out[key] = {"connection": "not_configured", "health": "unknown", "mode": "derived", "lastSyncAt": None,
                        "error": None, "detail": "No connectors use this method yet."}
            continue
        ratio = a["fresh"] / a["connectors"]
        health = "healthy" if ratio >= 0.9 else "degraded" if ratio >= 0.5 else "down"
        out[key] = {"connection": "connected" if a["fresh"] else "disconnected", "health": health, "mode": "derived",
                    "lastSyncAt": a["last"], "detail": f"{a['fresh']} of {a['connectors']} connectors reporting",
                    "error": None if health == "healthy" else f"{a['connectors'] - a['fresh']} connector(s) silent past the stale window."}
    manual = agg.get("manual", {"connectors": 0})
    out["net_manual"] = {"connection": "connected", "health": "healthy", "mode": "derived", "lastSyncAt": None, "error": None,
                         "detail": f"{manual['connectors']} connectors on manual status"}
    return out


def _probe(store: Store) -> dict[str, dict]:
    nets = _network_status(store)
    gw = gateway_service.get_gateway()
    live = firebase_ready()
    states: dict[str, dict] = {
        **nets,
        "maps_sdk": {"connection": "unknown", "health": "unknown", "mode": "client", "lastSyncAt": None, "error": None,
                     "detail": "Checked in your browser: the map shows the exact error if the key is wrong."},
        "pay_gateway": ({"connection": "connected", "health": "healthy", "mode": "simulated", "lastSyncAt": None, "error": None,
                         "detail": "Simulated gateway for demos. No real money moves."} if gw.simulated else
                        {"connection": "not_configured", "health": "unknown", "mode": "not_wired", "lastSyncAt": None,
                         "error": "No payment gateway adapter is configured.", "detail": ""}),
        "firebase": ({"connection": "connected", "health": "healthy", "mode": "live", "lastSyncAt": clock.now_ms(), "error": None,
                      "detail": f"Data store: {store.name}"} if live else
                     {"connection": "not_configured", "health": "unknown", "mode": "live", "lastSyncAt": None,
                      "error": "serviceAccountKey.json not found. Using the in-memory demo store.",
                      "detail": f"Data store: {store.name}"}),
        "mon_backend": {"connection": "connected", "health": "healthy", "mode": "live", "lastSyncAt": clock.now_ms(), "error": None,
                        "detail": "This API is answering requests (see /health)."},
        "pay_refunds": ({"connection": "connected" if gw.supports_refunds else "not_configured",
                         "health": "healthy" if gw.supports_refunds else "unknown",
                         "mode": "simulated" if gw.simulated else "not_wired", "lastSyncAt": None,
                         "error": None if gw.supports_refunds else "Requires a payment gateway.", "detail": ""}),
        "later_oem": {"connection": "later", "health": "unknown", "mode": "not_wired", "lastSyncAt": None, "error": None, "detail": "Not enabled"},
    }
    for entry in CATALOG:
        states.setdefault(entry["key"], {"connection": "not_configured", "health": "unknown", "mode": "not_wired",
                                         "lastSyncAt": None, "error": "Not configured.", "detail": ""})
    return states


def list_integrations(store: Store) -> dict:
    probes = _probe(store)
    saved = {d["id"]: d for d in store.list(INTEGRATIONS)}
    items = []
    for entry in CATALOG:
        s = saved.get(entry["key"], {})
        items.append({
            **{k: entry[k] for k in ("key", "group", "name", "desc", "hint")},
            "secretNames": entry["secrets"],  # names only, never values
            **probes[entry["key"]],
            "enabled": s.get("enabled", True), "settings": s.get("settings", {}), "notes": s.get("notes"),
            "lastTestAt": s.get("lastTestAt"), "lastTestOk": s.get("lastTestOk"),
        })
    groups: dict[str, list[dict]] = {}
    for i in items:
        groups.setdefault(i["group"], []).append(i)
    return {"items": items, "groups": [{"name": g, "items": v} for g, v in groups.items()],
            "gateway": {"name": gateway_service.get_gateway().name, "simulated": gateway_service.get_gateway().simulated}}


def _find(key: str) -> dict:
    entry = next((e for e in CATALOG if e["key"] == key), None)
    if entry is None:
        raise not_found("Integration", key)
    return entry


def update(store: Store, principal: Principal, key: str, body: IntegrationPatch) -> dict:
    entry = _find(key)
    current = store.get(INTEGRATIONS, key) or {}
    patch = {}
    if body.enabled is not None:
        patch["enabled"] = body.enabled
    if body.notes is not None:
        patch["notes"] = body.notes
    if body.settings is not None:
        patch["settings"] = body.settings
    if patch:
        store.set(INTEGRATIONS, key, {**{k: v for k, v in current.items() if k != "id"}, **patch, "updatedAt": clock.now_ms()})
        audit.record(principal, "integration.update", "integration", key, label=entry["name"],
                     before={k: current.get(k) for k in patch}, after=patch)
    return next(i for i in list_integrations(store)["items"] if i["key"] == key)


def test(store: Store, principal: Principal, key: str) -> dict:
    entry = _find(key)
    state = _probe(store)[key]
    ok = state["connection"] == "connected" and state["health"] in ("healthy", "unknown") and state["mode"] != "client"
    current = store.get(INTEGRATIONS, key) or {}
    store.set(INTEGRATIONS, key, {**{k: v for k, v in current.items() if k != "id"},
                                  "lastTestAt": clock.now_ms(), "lastTestOk": ok})
    audit.record(principal, "integration.test", "integration", key, label=entry["name"],
                 after={"ok": ok, "mode": state["mode"], "connection": state["connection"]})
    return {"key": key, "ok": ok, "mode": state["mode"], "connection": state["connection"], "health": state["health"],
            "message": state["error"] or state["detail"] or "OK"}
