"""Phase 2 analytics, computed from the sessions/stations/tickets we actually hold.

Metrics that need *app events* (search -> station, navigation -> session, wait time, route
repeat) are reported as `unavailable` with the reason, never estimated or faked.
"""
from collections import defaultdict
from datetime import datetime, timezone

from ..domain import clock
from ..domain.money import D, r2
from ..store.base import Store
from . import config as config_service
from .colls import CONNECTORS, PARTNERS, SESSIONS, STATIONS
from .transactions import PAID_STATES, captured

RANGES = {"7d": 7, "30d": 30, "90d": 90}

UNAVAILABLE = [
    {"id": "search_to_station", "label": "Search → station conversion", "reason": "Needs app search/view events (Firebase Analytics export)."},
    {"id": "nav_to_session", "label": "Navigation → successful session", "reason": "Needs navigation-start events from the mobile app."},
    {"id": "avg_wait", "label": "Average wait time", "reason": "Needs queue/arrival telemetry; not collected yet."},
    {"id": "route_repeat", "label": "Route repeat rate", "reason": "Needs saved-route and trip events from the mobile app."},
]


def _day(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def _window(sessions: list[dict], start: int, end: int) -> list[dict]:
    return [s for s in sessions if start <= s["startedAt"] < end]


def _kpis(win: list[dict]) -> dict:
    completed = [s for s in win if s["paymentStatus"] != "failed"]
    integrated_paid = [s for s in win if s["integrationMode"] == "integrated" and s["paymentStatus"] in PAID_STATES]
    gmv = sum((D(captured(s)) for s in integrated_paid), D(0))
    refunds = [s for s in win if s.get("refundedAmount", 0) > 0]
    users: dict[str, int] = defaultdict(int)
    for s in completed:
        users[s["userId"]] += 1
    payment_attempts = [s for s in win if s["integrationMode"] == "integrated"]
    failed_payments = [s for s in payment_attempts if s["paymentStatus"] == "failed"]
    return {
        "attemptedSessions": len(win), "successfulSessions": len(completed),
        "gmv": r2(gmv), "refundCount": len(refunds),
        "refundValue": r2(sum((D(s["refundedAmount"]) for s in refunds), D(0))),
        "activeUsers": len(users), "repeatUsers": sum(1 for n in users.values() if n >= 2),
        "paymentFailureRatePct": round(100 * len(failed_payments) / len(payment_attempts), 1) if payment_attempts else None,
        "faultRatePct": round(100 * sum(1 for s in win if s["paymentStatus"] == "failed" or s.get("failureReason")) / len(win), 1) if win else None,
        "revenuePerSession": r2(gmv / len(integrated_paid)) if integrated_paid else None,
        "energyKwh": r2(sum((D(s["energyKwh"]) for s in completed), D(0))),
    }


def summary(store: Store, range_: str = "30d") -> dict:
    days = RANGES.get(range_, 30)
    now = clock.now_ms()
    start, prev_start = now - days * clock.DAY, now - 2 * days * clock.DAY
    sessions = store.list(SESSIONS)
    cur, prev = _window(sessions, start, now + 1), _window(sessions, prev_start, start)
    first = min((s["startedAt"] for s in sessions), default=None)
    # A comparison is only honest if we hold data for (nearly) the whole earlier period.
    previous_complete = first is not None and first <= prev_start + clock.DAY
    k, kp = _kpis(cur), _kpis(prev)

    # daily series (zero-filled so the chart never skips a day)
    per_day: dict[str, dict] = {_day(now - i * clock.DAY): {"sessions": 0, "gmv": 0.0} for i in range(days)}
    for s in cur:
        d = per_day.get(_day(s["startedAt"]))
        if d is None:
            continue
        d["sessions"] += 1
        if s["integrationMode"] == "integrated" and s["paymentStatus"] in PAID_STATES:
            d["gmv"] = r2(D(d["gmv"]) + D(captured(s)))
    series = [{"date": d, **v} for d, v in sorted(per_day.items())]

    # PlugOrbit revenue = the fee we would book per the partners' terms (revenue-share only; flat-fee needs settlements)
    partners = {p["id"]: p for p in store.list(PARTNERS)}
    cfg = config_service.get(store)
    plans = {p["id"]: p for p in cfg["commissionPlans"]}
    revenue = D(0)
    for s in cur:
        if s["integrationMode"] != "integrated" or s["paymentStatus"] not in PAID_STATES:
            continue
        p = partners.get(s.get("partnerId") or "", {})
        pct = p.get("commissionPercent")
        if pct is None:
            pct = (plans.get(p.get("commissionPlanId")) or {}).get("commissionPercent")
        if p.get("commercialModel", "revenue_share") == "revenue_share" and pct:
            revenue += (D(captured(s)) - D(s.get("refundedAmount", 0))) * D(pct) / D(100)

    # utilisation: charging minutes / available minutes across all connectors
    drafts = {s["id"] for s in store.list(STATIONS) if s["publication"] == "draft" or s.get("mergedInto")}
    n_conn = sum(1 for c in store.list(CONNECTORS) if c["stationId"] not in drafts)
    minutes = sum(s["durationMin"] for s in cur if s["paymentStatus"] != "failed")
    utilisation = round(100 * minutes / (n_conn * days * 24 * 60), 2) if n_conn else None

    by_partner: dict[str, dict] = {}
    for s in cur:
        pid = s.get("partnerId") or "unknown"
        row = by_partner.setdefault(pid, {"partnerId": pid, "partnerName": (partners.get(pid) or {}).get("displayName")
                                          or (partners.get(pid) or {}).get("legalName") or pid,
                                          "sessions": 0, "gmv": 0.0, "failed": 0})
        row["sessions"] += 1
        row["failed"] += 1 if s["paymentStatus"] == "failed" else 0
        if s["integrationMode"] == "integrated" and s["paymentStatus"] in PAID_STATES:
            row["gmv"] = r2(D(row["gmv"]) + D(captured(s)))

    active_now = {s.get("partnerId") for s in cur}
    active_prev = {s.get("partnerId") for s in prev}
    retention = round(100 * len(active_now & active_prev) / len(active_prev)) if active_prev else None

    by_type: dict[str, int] = defaultdict(int)
    for s in cur:
        by_type[s["connectorType"]] += 1

    stations = [s for s in store.list(STATIONS) if not s.get("mergedInto")]
    return {
        "range": range_, "days": days, "generatedAt": now,
        "kpis": {**k, "platformRevenue": r2(revenue), "stationUtilisationPct": utilisation,
                 "partnerRetentionPct": retention, "stationsLive": sum(1 for s in stations if s.get("visibleInApp"))},
        "previous": kp if previous_complete else {},
        "previousComplete": previous_complete,
        "series": series,
        "byPartner": sorted(by_partner.values(), key=lambda r: -r["gmv"]),
        "byConnectorType": [{"type": t, "sessions": n} for t, n in sorted(by_type.items(), key=lambda x: -x[1])],
        "unavailable": UNAVAILABLE,
    }
