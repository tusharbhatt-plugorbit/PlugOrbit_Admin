"""Stations and connectors.

Three separate ideas, deliberately not mixed:
  * publication  - does the *user app* show this station? draft -> live <-> hidden. Admin-controlled.
  * status       - what is happening at the station right now? Derived from its connectors.
  * confidence   - how much to trust that status? Live / Manual / User / Estimated / Unknown.
A station reaches `live` only through the go-live checklist (`readiness`).
"""
from collections import defaultdict
from typing import Any

from ..domain import clock
from ..domain.status import derive_station, override_active, resolve_connector
from ..errors import conflict, invalid
from ..schemas.stations import (
    ConnectorClearOverride, ConnectorCreate, ConnectorOverride, ConnectorUpdate,
    StationCreate, StationStatusOverride, StationUpdate,
)
from ..security.principal import Principal
from ..store.base import Store
from . import audit, tariffs
from . import config as config_service
from .colls import CONNECTORS, DQ_ISSUES, PARTNERS, SESSIONS, STATIONS
from .common import check_version, contains, diff, must_get, paginate, stamp

STATION_EDITABLE = ("name", "partnerId", "address", "city", "state", "latitude", "longitude", "hours",
                    "accessInstructions", "photos", "amenities", "parkingInfo", "sessionMode",
                    "integrationMethod", "operatorInstructions", "verification")
CONNECTOR_EDITABLE = ("evseId", "label", "chargerId", "type", "powerKw", "integrationMode")

STATUS_FILTERS = ("all", "live", "occupied", "offline", "unknown", "stale", "needs_review", "available", "maintenance")


# ------------------------------------------------------------------------- views --
def charger_code(station_id: str, label: str) -> str:
    """Same format as the mobile app's `chargerCode()`: <STATION-SLUG>-<LABEL>."""
    slug = station_id.removeprefix("st-").upper()
    return f"{slug}-{label.upper()}"


def connector_view(c: dict, now: int, live_ms: int, stale_ms: int, tariff: dict | None = None) -> dict:
    return {
        **c,
        "qrCode": charger_code(c["stationId"], c["label"]),
        "effective": resolve_connector(c, now, live_ms, stale_ms),
        "tariff": tariffs.snapshot(tariff),
    }


def _reliability(connectors: list[dict]) -> float | None:
    total = sum(c.get("sessions30d", 0) for c in connectors)
    failed = sum(c.get("failedSessions30d", 0) for c in connectors)
    return None if total == 0 else round(100 * (1 - failed / total), 1)


def station_view(station: dict, connectors: list[dict], now: int, live_ms: int, stale_ms: int,
                 partner: dict | None, open_issues: int) -> dict:
    resolved = [resolve_connector(c, now, live_ms, stale_ms) for c in connectors]
    derived = derive_station(resolved)
    return {
        **station,
        "partnerName": (partner or {}).get("displayName") or (partner or {}).get("legalName") or "Unknown partner",
        "partnerStatus": (partner or {}).get("status"),
        "connectorCount": len(connectors),
        "status": derived["status"],
        "confidence": derived["confidence"],
        "appTrust": derived["appTrust"],
        "stale": derived["stale"],
        "counts": derived["counts"],
        "lastUpdatedAt": derived["lastUpdatedAt"],
        "reliabilityPct": _reliability(connectors),
        "openIssues": open_issues,
        "needsReview": open_issues > 0,
        "connectorTypes": sorted({c["type"] for c in connectors}),
        "maxPowerKw": max((c["powerKw"] for c in connectors), default=0),
    }


def _context(store: Store) -> dict[str, Any]:
    cfg = config_service.get(store)
    live_ms, stale_ms = config_service.thresholds(cfg)
    by_station: dict[str, list[dict]] = defaultdict(list)
    for c in store.list(CONNECTORS):
        by_station[c["stationId"]].append(c)
    issues: dict[str, int] = defaultdict(int)
    for i in store.list(DQ_ISSUES, {"status": "open"}):
        issues[i.get("stationId") or i["entityId"]] += 1
    return {
        "now": clock.now_ms(), "live_ms": live_ms, "stale_ms": stale_ms, "cfg": cfg,
        "connectors": by_station, "issues": issues,
        "partners": {p["id"]: p for p in store.list(PARTNERS)},
    }


def _view_from_ctx(station: dict, ctx: dict) -> dict:
    return station_view(station, ctx["connectors"].get(station["id"], []), ctx["now"], ctx["live_ms"],
                        ctx["stale_ms"], ctx["partners"].get(station["partnerId"]), ctx["issues"].get(station["id"], 0))


def all_views(store: Store) -> list[dict]:
    ctx = _context(store)
    return [_view_from_ctx(s, ctx) for s in store.list(STATIONS) if not s.get("mergedInto")]


def matches_status(view: dict, status: str) -> bool:
    if status in ("all", ""):
        return True
    if status == "live":
        return view["confidence"] == "live"
    if status == "stale":
        return view["stale"]
    if status == "needs_review":
        return view["needsReview"]
    return view["status"] == status


def list_stations(store: Store, *, q: str | None, partner_id: str | None, status: str, publication: str | None,
                  city: str | None, source: str | None, limit: int, offset: int, sort: str) -> dict:
    rows = []
    for v in all_views(store):
        if partner_id and v["partnerId"] != partner_id:
            continue
        if publication and v["publication"] != publication:
            continue
        if city and v["city"].lower() != city.lower():
            continue
        if source and v.get("integrationMethod") != source:
            continue
        if not matches_status(v, status):
            continue
        if q and not contains([v["name"], v["city"], v["partnerName"], v["address"], v["id"]], q):
            continue
        rows.append(v)
    key = {"updated": lambda r: -(r["lastUpdatedAt"] or 0), "name": lambda r: r["name"].lower()}.get(sort)
    rows.sort(key=key or (lambda r: r["name"].lower()))
    return paginate(rows, limit, offset)


def get_station(store: Store, station_id: str) -> dict:
    station = must_get(store, STATIONS, station_id, "Station")
    ctx = _context(store)
    view = _view_from_ctx(station, ctx)
    ts = tariffs.station_tariffs(store, station_id)
    now = ctx["now"]
    connectors = sorted(ctx["connectors"].get(station_id, []), key=lambda c: c["label"])
    view["connectors"] = [
        connector_view(c, now, ctx["live_ms"], ctx["stale_ms"], tariffs.active_tariff(ts, c["id"], now))
        for c in connectors
    ]
    view["readiness"] = readiness(store, station, connectors, ctx["partners"].get(station["partnerId"]), ts, now)
    return view


# -------------------------------------------------------------------- readiness --
def readiness(store: Store, station: dict, connectors: list[dict], partner: dict | None,
              ts: list[dict], now: int) -> dict:
    """The go-live checklist. A station cannot appear in the user app until every check passes."""
    lat, lng = station.get("latitude"), station.get("longitude")
    has_pin = lat is not None and lng is not None and not (lat == 0 and lng == 0)
    integrated = station.get("sessionMode") == "integrated"
    unpriced = [c["label"] for c in connectors if tariffs.active_tariff(ts, c["id"], now) is None]
    incomplete = [c["label"] for c in connectors if not (c.get("type") and c.get("powerKw") and c.get("chargerId"))]
    checks = [
        ("partner_active", "Partner is active", bool(partner and partner["status"] == "active"),
         "Approve the partner first." if not partner or partner["status"] != "active" else ""),
        ("location", "Map pin is set", has_pin, "Pick the location on the map." if not has_pin else ""),
        ("address", "Address and hours are filled in", bool(station.get("address") and station.get("hours")), ""),
        ("connectors", "At least one connector", len(connectors) > 0, "Add the charger's connectors."),
        ("connector_data", "Every connector has type, power and charger ID", not incomplete,
         f"Fix: {', '.join(incomplete)}" if incomplete else ""),
        ("pricing", "Every connector has a price", not unpriced and len(connectors) > 0,
         f"No price for: {', '.join(unpriced)}" if unpriced else ""),
        ("integration", "Integrated stations need a live connection (API / OCPP / OCPI)",
         not (integrated and station.get("integrationMethod") == "manual"),
         "Choose External for manually-run stations; the app then shows the operator's instructions."),
        ("operator_instructions", "External stations have operator instructions",
         integrated or bool(station.get("operatorInstructions")), ""),
        ("verified", "Location and details verified", station.get("verification") == "verified",
         "Mark the station verified after checking it."),
    ]
    items = [{"id": i, "label": label, "ok": bool(ok), "detail": (None if ok else detail) or None}
             for i, label, ok, detail in checks]
    return {"ready": all(c["ok"] for c in items), "checks": items}


def recompute_visibility(store: Store, *, partner_id: str | None = None, station_id: str | None = None) -> int:
    """`visibleInApp` is denormalised so the mobile app can simply query `visibleInApp == true`:
    published AND the partner is active AND not merged away."""
    partners = {p["id"]: p for p in store.list(PARTNERS)}
    changed = 0
    for s in store.list(STATIONS):
        if partner_id and s["partnerId"] != partner_id:
            continue
        if station_id and s["id"] != station_id:
            continue
        visible = (s.get("publication") == "live" and not s.get("mergedInto")
                   and (partners.get(s["partnerId"]) or {}).get("status") == "active")
        if s.get("visibleInApp") != visible:
            store.update(STATIONS, s["id"], {"visibleInApp": visible})
            changed += 1
    return changed


# ------------------------------------------------------------------------- CRUD --
def _check_partner(store: Store, partner_id: str) -> dict:
    partner = store.get(PARTNERS, partner_id)
    if partner is None:
        raise invalid("Choose an existing partner.", "UNKNOWN_PARTNER")
    return partner


def create(store: Store, principal: Principal, body: StationCreate) -> dict:
    _check_partner(store, body.partnerId)
    data = body.model_dump()
    station_id = f"st-{clock.slugify(data['name'])[:50]}"
    if store.get(STATIONS, station_id):
        station_id = f"{station_id}-{clock.new_id('x')[-4:]}"
    doc = stamp({**data, "publication": "draft", "visibleInApp": False, "isDemo": False}, None, actor_uid=principal.uid)
    saved = store.create(STATIONS, station_id, doc)
    audit.record(principal, "station.create", "station", station_id, label=saved["name"],
                 after={k: saved.get(k) for k in STATION_EDITABLE})
    return get_station(store, station_id)


def update(store: Store, principal: Principal, station_id: str, body: StationUpdate) -> dict:
    current = must_get(store, STATIONS, station_id, "Station")
    check_version(current, body.expectedVersion)
    _check_partner(store, body.partnerId)
    data = body.model_dump(exclude={"expectedVersion"})
    if current["publication"] == "live":
        projected = {**current, **data}
        connectors = store.list(CONNECTORS, {"stationId": station_id})
        check = readiness(store, projected, connectors, store.get(PARTNERS, projected["partnerId"]),
                          tariffs.station_tariffs(store, station_id), clock.now_ms())
        if not check["ready"]:
            failing = [c["label"] for c in check["checks"] if not c["ok"]]
            raise conflict("WOULD_BREAK_LIVE_STATION",
                           "This edit would leave a live station incomplete. Hide the station first, "
                           f"or fix: {'; '.join(failing)}.", failing=failing)
    saved = store.update(STATIONS, station_id, stamp(data, current, actor_uid=principal.uid))
    before, after = diff(current, saved, STATION_EDITABLE)
    if after:
        audit.record(principal, "station.update", "station", station_id, label=saved["name"], before=before, after=after)
    recompute_visibility(store, station_id=station_id)
    return get_station(store, station_id)


def _publication(store: Store, principal: Principal, station_id: str, to: str, action: str,
                 reason: str | None) -> dict:
    station = must_get(store, STATIONS, station_id, "Station")
    if station["publication"] == to:
        raise conflict("NO_CHANGE", f"This station is already {to}.")
    if to == "live":
        connectors = store.list(CONNECTORS, {"stationId": station_id})
        check = readiness(store, station, connectors, store.get(PARTNERS, station["partnerId"]),
                          tariffs.station_tariffs(store, station_id), clock.now_ms())
        if not check["ready"]:
            failing = [c["label"] for c in check["checks"] if not c["ok"]]
            raise conflict("NOT_READY", "This station is not ready to go live yet.", failing=failing, checks=check["checks"])
    if to == "hidden" and not reason:
        raise invalid("A reason is required to hide a station.", "REASON_REQUIRED")
    store.update(STATIONS, station_id, stamp({"publication": to}, station, actor_uid=principal.uid))
    recompute_visibility(store, station_id=station_id)
    audit.record(principal, action, "station", station_id, label=station["name"],
                 before={"publication": station["publication"]}, after={"publication": to}, reason=reason)
    return get_station(store, station_id)


def publish(store: Store, principal: Principal, station_id: str) -> dict:
    station = must_get(store, STATIONS, station_id, "Station")
    return _publication(store, principal, station_id, "live",
                        "station.unhide" if station["publication"] == "hidden" else "station.publish", None)


def hide(store: Store, principal: Principal, station_id: str, reason: str) -> dict:
    return _publication(store, principal, station_id, "hidden", "station.hide", reason)


# -------------------------------------------------------------- station overrides --
def _expiry(minutes: int | None) -> int | None:
    return None if minutes is None else clock.now_ms() + minutes * 60_000


def override_station(store: Store, principal: Principal, station_id: str, body: StationStatusOverride) -> dict:
    """Mark a whole station maintenance/offline (etc.) by overriding every connector."""
    station = must_get(store, STATIONS, station_id, "Station")
    connectors = store.list(CONNECTORS, {"stationId": station_id})
    if not connectors:
        raise conflict("NO_CONNECTORS", "This station has no connectors to override.")
    now = clock.now_ms()
    before = {c["label"]: c["override"]["status"] if override_active(c, now) else None for c in connectors}
    for c in connectors:
        store.update(CONNECTORS, c["id"], {"override": {
            "status": body.status, "reason": body.reason, "by": principal.uid, "byName": principal.name,
            "at": now, "expiresAt": _expiry(body.expiresInMinutes)}})
    audit.record(principal, "station.status_override", "station", station_id, label=station["name"],
                 before=before, after={"status": body.status, "connectors": len(connectors),
                                        "expiresAt": _expiry(body.expiresInMinutes)}, reason=body.reason)
    return get_station(store, station_id)


def clear_station_override(store: Store, principal: Principal, station_id: str, reason: str | None) -> dict:
    station = must_get(store, STATIONS, station_id, "Station")
    now = clock.now_ms()
    cleared = 0
    for c in store.list(CONNECTORS, {"stationId": station_id}):
        if override_active(c, now) or c.get("override"):
            store.update(CONNECTORS, c["id"], {"override": None})
            cleared += 1
    audit.record(principal, "station.status_override", "station", station_id, label=station["name"],
                 before={"overrides": cleared}, after={"overrides": 0}, reason=reason or "Override cleared")
    return get_station(store, station_id)


# --------------------------------------------------------------------- connectors --
def connector_id_for(station_id: str, label: str) -> str:
    return f"{station_id}-{clock.slugify(label)}"


def list_connectors(store: Store, station_id: str) -> list[dict]:
    must_get(store, STATIONS, station_id, "Station")
    cfg = config_service.get(store)
    live_ms, stale_ms = config_service.thresholds(cfg)
    now = clock.now_ms()
    ts = tariffs.station_tariffs(store, station_id)
    rows = sorted(store.list(CONNECTORS, {"stationId": station_id}), key=lambda c: c["label"])
    return [connector_view(c, now, live_ms, stale_ms, tariffs.active_tariff(ts, c["id"], now)) for c in rows]


def _unique_connector(store: Store, station_id: str, label: str, evse: str, self_id: str | None = None) -> None:
    for other in store.list(CONNECTORS, {"stationId": station_id}):
        if other["id"] == self_id:
            continue
        if other["label"].lower() == label.lower():
            raise conflict("DUPLICATE_CONNECTOR", f"This station already has a connector labelled {label}.")
        if other["evseId"].lower() == evse.lower():
            raise conflict("DUPLICATE_CONNECTOR", f"EVSE ID {evse} is already used at this station.")


def create_connector(store: Store, principal: Principal, station_id: str, body: ConnectorCreate) -> dict:
    station = must_get(store, STATIONS, station_id, "Station")
    _unique_connector(store, station_id, body.label, body.evseId)
    cid = connector_id_for(station_id, body.label)
    doc = stamp({
        **body.model_dump(), "stationId": station_id,
        "status": "unknown", "statusSource": "none", "statusUpdatedAt": None, "lastHeartbeatAt": None,
        "override": None, "sessions30d": 0, "failedSessions30d": 0, "faults30d": 0, "uptimePct": None,
    }, None, actor_uid=principal.uid)
    saved = store.create(CONNECTORS, cid, doc)
    audit.record(principal, "connector.create", "station", station_id, label=f"{station['name']} · {body.label}",
                 after={k: saved.get(k) for k in CONNECTOR_EDITABLE})
    return connector_view(saved, clock.now_ms(), *config_service.thresholds(config_service.get(store)))


def update_connector(store: Store, principal: Principal, connector_id: str, body: ConnectorUpdate) -> dict:
    current = must_get(store, CONNECTORS, connector_id, "Connector")
    check_version(current, body.expectedVersion)
    _unique_connector(store, current["stationId"], body.label, body.evseId, connector_id)
    saved = store.update(CONNECTORS, connector_id, stamp(body.model_dump(exclude={"expectedVersion"}), current,
                                                         actor_uid=principal.uid))
    before, after = diff(current, saved, CONNECTOR_EDITABLE)
    station = store.get(STATIONS, current["stationId"]) or {"name": current["stationId"]}
    if after:
        audit.record(principal, "connector.update", "station", current["stationId"],
                     label=f"{station['name']} · {saved['label']}", before=before, after=after)
    return connector_view(saved, clock.now_ms(), *config_service.thresholds(config_service.get(store)))


def delete_connector(store: Store, principal: Principal, connector_id: str) -> None:
    c = must_get(store, CONNECTORS, connector_id, "Connector")
    station = must_get(store, STATIONS, c["stationId"], "Station")
    if store.list(SESSIONS, {"connectorId": connector_id}):
        raise conflict("HAS_SESSIONS", "This connector has charging history, so it cannot be deleted. "
                                       "Set it to maintenance instead.")
    remaining = [x for x in store.list(CONNECTORS, {"stationId": station["id"]}) if x["id"] != connector_id]
    if station["publication"] == "live" and not remaining:
        raise conflict("LAST_CONNECTOR", "A live station needs at least one connector. Hide the station first.")
    store.delete(CONNECTORS, connector_id)
    audit.record(principal, "connector.delete", "station", station["id"], label=f"{station['name']} · {c['label']}",
                 before={k: c.get(k) for k in CONNECTOR_EDITABLE})


def set_override(store: Store, principal: Principal, connector_id: str, body: ConnectorOverride) -> dict:
    c = must_get(store, CONNECTORS, connector_id, "Connector")
    station = must_get(store, STATIONS, c["stationId"], "Station")
    now = clock.now_ms()
    override = {"status": body.status, "reason": body.reason, "by": principal.uid, "byName": principal.name,
                "at": now, "expiresAt": _expiry(body.expiresInMinutes)}
    saved = store.update(CONNECTORS, connector_id, {"override": override})
    audit.record(principal, "connector.override", "station", station["id"], label=f"{station['name']} · {c['label']}",
                 before={"status": (c["override"] or {}).get("status") if override_active(c, now) else c["status"],
                         "manual": override_active(c, now)},
                 after={"status": body.status, "manual": True, "expiresAt": override["expiresAt"]}, reason=body.reason)
    return connector_view(saved, now, *config_service.thresholds(config_service.get(store)))


def clear_override(store: Store, principal: Principal, connector_id: str, body: ConnectorClearOverride) -> dict:
    c = must_get(store, CONNECTORS, connector_id, "Connector")
    station = must_get(store, STATIONS, c["stationId"], "Station")
    if not c.get("override"):
        raise conflict("NO_OVERRIDE", "This connector has no manual override.")
    saved = store.update(CONNECTORS, connector_id, {"override": None})
    audit.record(principal, "connector.override_clear", "station", station["id"],
                 label=f"{station['name']} · {c['label']}", before={"status": c["override"]["status"]},
                 after={"status": c["status"], "manual": False}, reason=body.reason or "Override cleared")
    return connector_view(saved, clock.now_ms(), *config_service.thresholds(config_service.get(store)))


# ---------------------------------------------------------------------------- map --
def map_rows(store: Store, *, partner_id: str | None, city: str | None, connector_type: str | None,
             min_power: float | None, status: str, source: str | None, q: str | None) -> dict:
    ctx = _context(store)
    rows = []
    for s in store.list(STATIONS):
        if s.get("mergedInto"):
            continue
        view = _view_from_ctx(s, ctx)
        conns = ctx["connectors"].get(s["id"], [])
        if partner_id and s["partnerId"] != partner_id:
            continue
        if city and s["city"].lower() != city.lower():
            continue
        if connector_type and connector_type not in view["connectorTypes"]:
            continue
        if min_power and view["maxPowerKw"] < min_power:
            continue
        if source and s.get("integrationMethod") != source:
            continue
        if not matches_status(view, status):
            continue
        if q and not contains([s["name"], s["city"], view["partnerName"]], q):
            continue
        rows.append({
            "id": s["id"], "name": s["name"], "city": s["city"], "state": s["state"],
            "latitude": s["latitude"], "longitude": s["longitude"],
            "partnerId": s["partnerId"], "partnerName": view["partnerName"],
            "publication": s["publication"], "status": view["status"], "confidence": view["confidence"],
            "stale": view["stale"], "counts": view["counts"], "lastUpdatedAt": view["lastUpdatedAt"],
            "integrationMethod": s.get("integrationMethod"), "sessionMode": s.get("sessionMode"),
            "reliabilityPct": view["reliabilityPct"], "connectorTypes": view["connectorTypes"],
            "maxPowerKw": view["maxPowerKw"],
            "connectors": [{"label": c["label"], "type": c["type"], "powerKw": c["powerKw"],
                            "status": resolve_connector(c, ctx["now"], ctx["live_ms"], ctx["stale_ms"])["status"]}
                           for c in sorted(conns, key=lambda c: c["label"])],
        })
    return {"items": rows, "total": len(rows), "generatedAt": ctx["now"]}
