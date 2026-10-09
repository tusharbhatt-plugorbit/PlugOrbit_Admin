"""Charger health: which connectors need a person's attention, and why.

Severity rules (explicit, so ops can predict them; thresholds live here, not in the UI):
  critical  heartbeat silent past the stale window on a feed connector, OR fault rate >= 25 % over
            at least 8 sessions, OR 3+ failed sessions this week
  warning   heartbeat slower than 2x the live window, OR fault rate >= 10 %, OR uptime < 95 %,
            OR any failed session this week
  healthy   otherwise.  Connectors in maintenance are never critical: someone already knows.
"""
from ..domain import clock
from ..domain.status import resolve_connector
from ..store.base import Store
from . import config as config_service
from .colls import CONNECTORS, STATIONS, PARTNERS
from .common import contains, paginate

FEED = ("api", "ocpp", "ocpi")
SEVERITY_RANK = {"critical": 0, "warning": 1, "healthy": 2}


def _fault_rate(c: dict) -> float | None:
    n = c.get("sessions30d", 0)
    return None if n == 0 else round(100 * c.get("failedSessions30d", 0) / n, 1)


def classify(c: dict, resolved: dict, now: int, live_ms: int, stale_ms: int) -> tuple[str, list[str]]:
    reasons: list[str] = []
    severity = "healthy"

    def raise_to(level: str, why: str) -> None:
        nonlocal severity
        reasons.append(why)
        if SEVERITY_RANK[level] < SEVERITY_RANK[severity]:
            severity = level

    feed = c.get("integrationMode") in FEED
    hb_age = None if c.get("lastHeartbeatAt") is None else now - c["lastHeartbeatAt"]
    if feed:
        if hb_age is None or hb_age > stale_ms:
            raise_to("critical", "No heartbeat from the charger" if hb_age is None
                     else f"Heartbeat silent for {hb_age // 60000} min")
        elif hb_age > 2 * live_ms:
            raise_to("warning", f"Heartbeat slow ({hb_age // 60000} min)")
    rate, sessions = _fault_rate(c), c.get("sessions30d", 0)
    if rate is not None and sessions >= 8 and rate >= 25:
        raise_to("critical", f"{rate}% of sessions failed in 30 days")
    elif rate is not None and rate >= 10:
        raise_to("warning", f"{rate}% of sessions failed in 30 days")
    uptime = c.get("uptimePct")
    if uptime is not None and uptime < 95:
        raise_to("warning", f"Uptime {uptime}%")
    recent = c.get("recentFailures7d", 0)
    if recent >= 3:
        raise_to("critical", f"{recent} failed sessions this week")
    elif recent >= 1:
        raise_to("warning", f"{recent} failed session{'s' if recent > 1 else ''} this week")
    if resolved["status"] == "maintenance" and severity == "critical":
        severity, reasons = "warning", [*reasons, "Already in maintenance"]
    return severity, reasons


def rows(store: Store) -> list[dict]:
    cfg = config_service.get(store)
    live_ms, stale_ms = config_service.thresholds(cfg)
    now = clock.now_ms()
    stations = {s["id"]: s for s in store.list(STATIONS)}
    partners = {p["id"]: p for p in store.list(PARTNERS)}
    out = []
    for c in store.list(CONNECTORS):
        st = stations.get(c["stationId"])
        if st is None or st.get("mergedInto") or st["publication"] == "draft":
            continue  # a station that is not live yet has no feed to be unhealthy
        resolved = resolve_connector(c, now, live_ms, stale_ms)
        severity, reasons = classify(c, resolved, now, live_ms, stale_ms)
        partner = partners.get(st["partnerId"], {})
        out.append({
            "connectorId": c["id"], "label": c["label"], "type": c["type"], "powerKw": c["powerKw"],
            "stationId": st["id"], "stationName": st["name"], "city": st["city"],
            "partnerId": st["partnerId"], "partnerName": partner.get("displayName") or partner.get("legalName"),
            "status": resolved["status"], "confidence": resolved["confidence"], "statusSource": resolved["source"],
            "integrationMode": c.get("integrationMode"), "lastHeartbeatAt": c.get("lastHeartbeatAt"),
            "heartbeatAgeMs": resolved["heartbeatAgeMs"], "faultRatePct": _fault_rate(c),
            "faults30d": c.get("faults30d", 0), "sessions30d": c.get("sessions30d", 0),
            "uptimePct": c.get("uptimePct"), "repeatedFailures": c.get("recentFailures7d", 0),
            "severity": severity, "reasons": reasons, "overridden": resolved["overridden"],
        })
    return out


def summary(store: Store) -> dict:
    items = rows(store)
    feed = [r for r in items if r["integrationMode"] in FEED]
    online = [r for r in items if r["status"] in ("available", "occupied")]
    uptimes = [r["uptimePct"] for r in feed if r["uptimePct"] is not None]
    methods = {}
    for r in items:
        m = methods.setdefault(r["integrationMode"], {"method": r["integrationMode"], "connectors": 0, "online": 0})
        m["connectors"] += 1
        m["online"] += 1 if r["status"] in ("available", "occupied") else 0
    return {
        "total": len(items),
        "onlinePct": round(100 * len(online) / len(items), 1) if items else None,
        "offline": sum(1 for r in items if r["status"] == "offline"),
        "maintenance": sum(1 for r in items if r["status"] == "maintenance"),
        "critical": sum(1 for r in items if r["severity"] == "critical"),
        "warning": sum(1 for r in items if r["severity"] == "warning"),
        "integrationUptimePct": round(sum(uptimes) / len(uptimes), 1) if uptimes else None,
        "byMethod": sorted(methods.values(), key=lambda m: m["method"]),
        "generatedAt": clock.now_ms(),
    }


def list_rows(store: Store, *, severity: str | None, partner_id: str | None, station_id: str | None,
              status: str | None, q: str | None, limit: int, offset: int) -> dict:
    items = []
    for r in rows(store):
        if severity and r["severity"] != severity:
            continue
        if partner_id and r["partnerId"] != partner_id:
            continue
        if station_id and r["stationId"] != station_id:
            continue
        if status and r["status"] != status:
            continue
        if q and not contains([r["stationName"], r["label"], r["partnerName"], r["city"]], q):
            continue
        items.append(r)
    items.sort(key=lambda r: (SEVERITY_RANK[r["severity"]], r["stationName"].lower(), r["label"]))
    return paginate(items, limit, offset)
