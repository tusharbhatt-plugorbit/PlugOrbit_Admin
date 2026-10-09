"""Data quality: find data the user app should not trust, and give admins the tools to fix it.

`scan()` is deterministic and idempotent: issue ids are derived from (type, entity), so a rescan
updates what is still wrong, re-opens what came back, and auto-clears what got fixed. Detection
rules (documented in docs/DATA_QUALITY.md):

  stale_status             some connector feeds have gone quiet (older than the stale threshold)
  no_fresh_feed            every connector of an API/OCPP/OCPI station is silent: the integration is down
  wrong_pricing            missing, free, out of the sane band, or far from the network median for its type
  duplicate_station        two stations within 150 m with near-identical names
  missing_connector_data   a non-draft station with no connectors, or connectors missing type/power/id
  conflicting_sources      a "live" feed says available while recent drivers report otherwise
  user_fault_report        repeated driver fault reports on one connector in 24 h
"""
import difflib
import math
from collections import defaultdict
from statistics import median

from ..domain import clock
from ..domain.status import override_active, resolve_connector
from ..errors import conflict, invalid
from ..schemas.ops import DqAction, DqMerge
from ..security.principal import SYSTEM, Principal
from ..store.base import Store
from . import audit, stations, tariffs
from . import config as config_service
from .colls import CONNECTORS, DQ_ISSUES, SESSIONS, STATIONS, TICKETS
from .common import must_get, paginate, stamp

TYPES: dict[str, str] = {
    "stale_status": "Stale charger status",
    "no_fresh_feed": "No fresh feed",
    "wrong_pricing": "Wrong pricing",
    "duplicate_station": "Duplicate station",
    "missing_connector_data": "Missing connector data",
    "conflicting_sources": "Conflicting data sources",
    "user_fault_report": "User fault reports",
}
FEED_METHODS = ("api", "ocpp", "ocpi")
DUP_RADIUS_M = 150
DUP_NAME_SIMILARITY = 0.8
PRICE_MIN, PRICE_MAX = 5.0, 50.0  # sane INR/kWh band for public charging
PRICE_MEDIAN_TOLERANCE = 0.6
MIN_SAMPLE = 5
FAULT_WINDOW_MS = 24 * clock.HOUR
FAULT_THRESHOLD = 2
CONFLICT_WINDOW_MS = clock.HOUR
CONFLICT_THRESHOLD = 2
OVERRIDE_HOURS = 12
RESOLVE_COOLDOWN_MS = 24 * clock.HOUR


def _haversine_m(a: dict, b: dict) -> float:
    r = 6_371_000
    p1, p2 = math.radians(a["latitude"]), math.radians(b["latitude"])
    dp, dl = p2 - p1, math.radians(b["longitude"] - a["longitude"])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _norm(name: str) -> str:
    return " ".join(sorted("".join(c if c.isalnum() else " " for c in name.lower()).split()))


def _issue(kind: str, key: str, severity: str, station: dict, title: str, detail: str, **extra) -> dict:
    return {"id": f"dq-{kind}-{key}", "type": kind, "severity": severity, "stationId": station["id"],
            "stationName": station["name"], "title": title, "detail": detail, **extra}


# ----------------------------------------------------------------------- detection --
def detect(store: Store) -> list[dict]:
    cfg = config_service.get(store)
    live_ms, stale_ms = config_service.thresholds(cfg)
    now = clock.now_ms()
    all_stations = [s for s in store.list(STATIONS) if not s.get("mergedInto") and s["publication"] != "draft"]
    conns: dict[str, list[dict]] = defaultdict(list)
    for c in store.list(CONNECTORS):
        conns[c["stationId"]].append(c)
    tariff_cache = {s["id"]: tariffs.station_tariffs(store, s["id"]) for s in all_stations}

    # network price medians per connector type, for the outlier rule
    prices_by_type: dict[str, list[float]] = defaultdict(list)
    for s in all_stations:
        for c in conns[s["id"]]:
            t = tariffs.active_tariff(tariff_cache[s["id"]], c["id"], now)
            if t and t["pricePerKwh"] > 0:
                prices_by_type[c["type"]].append(t["pricePerKwh"])
    medians = {k: median(v) for k, v in prices_by_type.items() if len(v) >= MIN_SAMPLE}

    found: list[dict] = []
    for s in all_stations:
        cs = conns[s["id"]]
        resolved = {c["id"]: resolve_connector(c, now, live_ms, stale_ms) for c in cs}

        # missing connector data
        if not cs:
            found.append(_issue("missing_connector_data", s["id"], "critical" if s["publication"] == "live" else "warning",
                                s, "No connectors on file", "This station has no connectors, so the app cannot show what is available."))
        else:
            bad = [c["label"] for c in cs if not (c.get("type") and c.get("powerKw") and c.get("chargerId"))]
            if bad:
                found.append(_issue("missing_connector_data", s["id"], "warning", s, "Incomplete connector data",
                                    f"Connectors missing type, power or charger ID: {', '.join(bad)}."))

        # stale status / no fresh feed (only feeds can go quiet; manual connectors are admin-owned)
        if s.get("integrationMethod") in FEED_METHODS and cs:
            feed_cs = [c for c in cs if c.get("integrationMode") in FEED_METHODS and not override_active(c, now)]
            stale_cs = [c for c in feed_cs if resolved[c["id"]]["stale"]]
            heartbeat_dead = [c for c in feed_cs if c.get("lastHeartbeatAt") is None or now - c["lastHeartbeatAt"] > stale_ms]
            if feed_cs and len(heartbeat_dead) == len(feed_cs):
                found.append(_issue("no_fresh_feed", s["id"], "critical", s, "Feed has gone quiet",
                                    f"No heartbeat from any connector for over {stale_ms // 60000} min "
                                    f"({s['integrationMethod'].upper()} link may be down). The app must not show this station as Live."))
            elif stale_cs:
                found.append(_issue("stale_status", s["id"], "warning", s, "Stale charger status",
                                    f"Status older than {stale_ms // 60000} min on: {', '.join(c['label'] for c in stale_cs)}.",
                                    connectorIds=[c["id"] for c in stale_cs]))

        # pricing
        for c in cs:
            t = tariffs.active_tariff(tariff_cache[s["id"]], c["id"], now)
            if t is not None and c.get("priceVerifiedTariffId") == t["id"]:
                continue
            problem = None
            if t is None:
                problem = ("critical" if s["publication"] == "live" else "warning", "No price set",
                           f"Connector {c['label']} has no active tariff, so drivers cannot be quoted a cost.")
            else:
                p = t["pricePerKwh"]
                if p == 0 and s.get("sessionMode") == "integrated":
                    problem = ("warning", "Free charging configured", f"{c['label']} is set to ₹0/kWh. Confirm this is intended.")
                elif p and not PRICE_MIN <= p <= PRICE_MAX:
                    problem = ("critical", "Price outside the usual range",
                               f"{c['label']} is ₹{p}/kWh; public charging is normally ₹{PRICE_MIN:.0f}–₹{PRICE_MAX:.0f}.")
                elif p and c["type"] in medians and abs(p - medians[c["type"]]) / medians[c["type"]] > PRICE_MEDIAN_TOLERANCE:
                    problem = ("warning", "Price far from the network norm",
                               f"{c['label']} is ₹{p}/kWh vs a network median of ₹{medians[c['type']]:.1f} for {c['type']}.")
            if problem:
                found.append(_issue("wrong_pricing", c["id"], problem[0], s, problem[1], problem[2], connectorId=c["id"]))

        # conflicting sources / user fault reports
        for c in cs:
            reports = c.get("userReports", [])
            fault_recent = [r for r in reports if r["kind"] == "fault" and now - r["at"] <= FAULT_WINDOW_MS]
            if len(fault_recent) >= FAULT_THRESHOLD:
                found.append(_issue("user_fault_report", c["id"], "warning" if len(fault_recent) < 4 else "critical", s,
                                    "Repeated driver fault reports",
                                    f"{len(fault_recent)} drivers reported a fault on {c['label']} in the last 24 h.",
                                    connectorId=c["id"]))
            r = resolved[c["id"]]
            if r["confidence"] == "live" and r["status"] == "available":
                contra = [x for x in reports if x["kind"] == "status" and x.get("status") in ("offline", "occupied")
                          and now - x["at"] <= CONFLICT_WINDOW_MS]
                if len(contra) >= CONFLICT_THRESHOLD:
                    found.append(_issue("conflicting_sources", c["id"], "warning", s, "Feed and drivers disagree",
                                        f"The live feed says {c['label']} is available, but {len(contra)} drivers "
                                        f"reported it {contra[-1]['status']} in the last hour.", connectorId=c["id"]))

    # duplicate stations (pairwise; n is small in Phase 1)
    for i, a in enumerate(all_stations):
        for b in all_stations[i + 1:]:
            if _haversine_m(a, b) > DUP_RADIUS_M:
                continue
            if difflib.SequenceMatcher(None, _norm(a["name"]), _norm(b["name"])).ratio() < DUP_NAME_SIMILARITY:
                continue
            if b["id"] in (a.get("notDuplicateOf") or []) or a["id"] in (b.get("notDuplicateOf") or []):
                continue
            first, second = sorted((a, b), key=lambda s: s["createdAt"])
            key = f"{first['id']}--{second['id']}"
            found.append(_issue("duplicate_station", key, "warning", second, "Possible duplicate station",
                                f"“{second['name']}” is {round(_haversine_m(a, b))} m from “{first['name']}” "
                                "with a near-identical name.", relatedStationId=first["id"]))
    return found


def scan(store: Store, principal: Principal | None = None) -> dict:
    actor = principal or SYSTEM
    now = clock.now_ms()
    found = {i["id"]: i for i in detect(store)}
    existing = {i["id"]: i for i in store.list(DQ_ISSUES)}
    opened = reopened = cleared = 0
    for iid, item in found.items():
        cur = existing.get(iid)
        if cur is None:
            store.create(DQ_ISSUES, iid, {**item, "status": "open", "detectedAt": now, "lastSeenAt": now})
            opened += 1
        elif cur["status"] == "resolved":
            by_admin = (cur.get("resolution") or {}).get("action") not in (None, "auto_cleared")
            if by_admin and now - (cur.get("resolvedAt") or 0) < RESOLVE_COOLDOWN_MS:
                continue  # an admin just handled it: don't flap straight back to open
            store.update(DQ_ISSUES, iid, {**item, "status": "open", "lastSeenAt": now, "resolution": None})
            reopened += 1
        else:
            store.update(DQ_ISSUES, iid, {**item, "lastSeenAt": now})
    for iid, cur in existing.items():
        if iid not in found and cur["status"] in ("open", "reviewing"):
            store.update(DQ_ISSUES, iid, {"status": "resolved", "resolvedAt": now,
                                          "resolution": {"action": "auto_cleared", "by": "system", "at": now,
                                                         "reason": "No longer detected."}})
            cleared += 1
    result = {"opened": opened, "reopened": reopened, "autoCleared": cleared, "open": sum(
        1 for i in store.list(DQ_ISSUES) if i["status"] in ("open", "reviewing")), "scannedAt": now}
    store.set("meta", "dq_last_scan", {"at": now, "result": result})
    if actor is not SYSTEM:
        audit.record(actor, "dq.scan", "data_quality", "scan", label="Data-quality scan", after=result)
    return result


# ------------------------------------------------------------------------- queries --
def last_scan(store: Store) -> dict | None:
    return store.get("meta", "dq_last_scan")


def list_issues(store: Store, *, type_: str | None, status: str | None, severity: str | None,
                station_id: str | None, limit: int, offset: int) -> dict:
    rows = []
    for i in store.list(DQ_ISSUES):
        if status == "active" and i["status"] not in ("open", "reviewing"):
            continue
        if status and status != "active" and i["status"] != status:
            continue
        if type_ and i["type"] != type_:
            continue
        if severity and i["severity"] != severity:
            continue
        if station_id and i.get("stationId") != station_id:
            continue
        rows.append({**i, "typeLabel": TYPES.get(i["type"], i["type"])})
    rank = {"critical": 0, "warning": 1, "info": 2}
    rows.sort(key=lambda r: (r["status"] not in ("open", "reviewing"), rank[r["severity"]], -(r.get("lastSeenAt") or 0)))
    return paginate(rows, limit, offset)


def summary(store: Store) -> dict:
    cfg = config_service.get(store)
    live_ms, stale_ms = config_service.thresholds(cfg)
    now = clock.now_ms()
    views = stations.all_views(store)
    live = [v for v in views if v["publication"] == "live"]
    fresh = [v for v in live if not v["stale"]]
    active = [i for i in store.list(DQ_ISSUES) if i["status"] in ("open", "reviewing")]
    by_type = {t: sum(1 for i in active if i["type"] == t) for t in TYPES}
    return {
        "freshPct": round(100 * len(fresh) / len(live)) if live else None,
        "liveStations": len(live),
        "openIssues": len(active),
        "critical": sum(1 for i in active if i["severity"] == "critical"),
        "byType": [{"type": t, "label": TYPES[t], "count": n} for t, n in by_type.items()],
        "lastScan": last_scan(store),
        "thresholds": {"liveSec": live_ms // 1000, "staleSec": stale_ms // 1000}, "generatedAt": now,
    }


# --------------------------------------------------------------------------- actions --
def _apply_override(store: Store, principal: Principal, connector: dict, status: str, reason: str) -> None:
    now = clock.now_ms()
    store.update(CONNECTORS, connector["id"], {"override": {
        "status": status, "reason": reason, "by": principal.uid, "byName": principal.name, "at": now,
        "expiresAt": now + OVERRIDE_HOURS * clock.HOUR}})


def _issue_connectors(store: Store, issue: dict) -> list[dict]:
    if issue.get("connectorIds"):
        return [c for c in (store.get(CONNECTORS, i) for i in issue["connectorIds"]) if c]
    if issue.get("connectorId"):
        c = store.get(CONNECTORS, issue["connectorId"])
        return [c] if c else []
    if issue["type"] in ("no_fresh_feed", "stale_status"):
        return store.list(CONNECTORS, {"stationId": issue["stationId"]})
    return []


def act(store: Store, principal: Principal, issue_id: str, body: DqAction) -> dict:
    issue = must_get(store, DQ_ISSUES, issue_id, "Issue")
    if issue["status"] in ("resolved", "dismissed"):
        raise conflict("ALREADY_CLOSED", "This issue is already closed.")
    now = clock.now_ms()
    cfg = config_service.get(store)
    live_ms, stale_ms = config_service.thresholds(cfg)
    station = store.get(STATIONS, issue["stationId"])
    outcome = {"action": body.action, "by": principal.uid, "byName": principal.name, "at": now, "reason": body.reason}
    new_status = "resolved"
    detail: dict = {}

    if body.action == "mark_reviewed":
        new_status = "reviewing"
    elif body.action == "dismiss":
        new_status = "dismissed"
    elif body.action == "hide_station":
        if station is None:
            raise invalid("The station no longer exists.", "UNKNOWN_STATION")
        if station["publication"] != "hidden":
            stations.hide(store, principal, station["id"], body.reason)
        detail = {"hidden": True}
    elif body.action == "mark_verified":
        t = issue["type"]
        if t in ("stale_status", "no_fresh_feed"):
            targets = _issue_connectors(store, issue)
            for c in targets:  # a person confirms the current status: confidence becomes Manual, never Live
                _apply_override(store, principal, c, resolve_connector(c, now, live_ms, stale_ms)["status"], body.reason)
            detail = {"connectorsVerified": len(targets), "confidence": "manual"}
        elif t == "wrong_pricing" and issue.get("connectorId"):
            c = store.get(CONNECTORS, issue["connectorId"])
            tariff = tariffs.active_tariff(tariffs.station_tariffs(store, issue["stationId"]), issue["connectorId"], now)
            if c and tariff:
                store.update(CONNECTORS, c["id"], {"priceVerifiedTariffId": tariff["id"]})
            detail = {"priceVerified": True}
        elif t == "duplicate_station" and station:
            other = store.get(STATIONS, issue.get("relatedStationId") or "")
            store.update(STATIONS, station["id"], {"notDuplicateOf": [*(station.get("notDuplicateOf") or []), issue["relatedStationId"]]})
            if other:
                store.update(STATIONS, other["id"], {"notDuplicateOf": [*(other.get("notDuplicateOf") or []), station["id"]]})
            detail = {"notDuplicate": True}
        elif station and station.get("verification") != "verified" and t == "missing_connector_data":
            detail = {"note": "Marked as verified without changes."}
    elif body.action == "downgrade_confidence":
        targets = _issue_connectors(store, issue)
        if not targets:
            raise invalid("This kind of issue has no connector status to downgrade.", "NOT_APPLICABLE")
        for c in targets:  # app will show Unknown instead of a status nobody can vouch for
            _apply_override(store, principal, c, "unknown", body.reason)
        detail = {"connectorsDowngraded": len(targets)}
        new_status = "reviewing"

    patch = {"status": new_status, "resolution": {**outcome, **detail}}
    if new_status in ("resolved", "dismissed"):
        patch["resolvedAt"] = now
    store.update(DQ_ISSUES, issue_id, patch)
    audit.record(principal, "dq.action", "data_quality", issue_id, label=f"{issue['title']} · {issue.get('stationName')}",
                 before={"status": issue["status"]}, after={"status": new_status, "action": body.action, **detail},
                 reason=body.reason)
    return {**store.get(DQ_ISSUES, issue_id), "typeLabel": TYPES.get(issue["type"], issue["type"])}


def merge(store: Store, principal: Principal, body: DqMerge) -> dict:
    keep = must_get(store, STATIONS, body.keepStationId, "Station")
    gone = must_get(store, STATIONS, body.mergeStationId, "Station")
    if gone.get("mergedInto"):
        raise conflict("ALREADY_MERGED", "That station was already merged into another one.")
    keep_conns = store.list(CONNECTORS, {"stationId": keep["id"]})
    known_chargers = {c["chargerId"].lower() for c in keep_conns}
    labels = {c["label"].lower() for c in keep_conns}
    moved: list[str] = []
    for c in store.list(CONNECTORS, {"stationId": gone["id"]}):
        if c["chargerId"].lower() in known_chargers:
            continue  # the same physical charger already exists on the surviving station
        label = c["label"]
        while label.lower() in labels:
            label += "-m"
        labels.add(label.lower())
        new_id = stations.connector_id_for(keep["id"], label)
        store.create(CONNECTORS, new_id, {**{k: v for k, v in c.items() if k != "id"}, "stationId": keep["id"], "label": label})
        store.delete(CONNECTORS, c["id"])
        for s in store.list(SESSIONS, {"connectorId": c["id"]}):
            store.update(SESSIONS, s["id"], {"connectorId": new_id, "connectorLabel": label})
        moved.append(label)
    for s in store.list(SESSIONS, {"stationId": gone["id"]}):
        store.update(SESSIONS, s["id"], {"stationId": keep["id"], "stationName": keep["name"]})
    for t in store.list(TICKETS, {"stationId": gone["id"]}):
        store.update(TICKETS, t["id"], {"stationId": keep["id"], "stationName": keep["name"]})
    store.update(STATIONS, gone["id"], stamp({"mergedInto": keep["id"], "publication": "hidden", "visibleInApp": False},
                                             gone, actor_uid=principal.uid))
    for issue in store.list(DQ_ISSUES):
        if gone["id"] in (issue.get("stationId"), issue.get("relatedStationId")) and issue["status"] in ("open", "reviewing"):
            store.update(DQ_ISSUES, issue["id"], {"status": "resolved", "resolvedAt": clock.now_ms(),
                         "resolution": {"action": "merged", "by": principal.uid, "byName": principal.name,
                                        "at": clock.now_ms(), "reason": body.reason}})
    audit.record(principal, "station.merge", "station", keep["id"], label=f"{gone['name']} → {keep['name']}",
                 before={"merged": gone["id"]}, after={"keep": keep["id"], "connectorsMoved": moved}, reason=body.reason)
    return stations.get_station(store, keep["id"])
