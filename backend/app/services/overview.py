"""The Overview screen: "what needs my attention right now?"."""
from datetime import datetime, timezone

from ..domain import clock
from ..domain.money import D, r2
from ..security.principal import Principal
from ..store.base import Store
from . import audit, stations
from .colls import DQ_ISSUES, PARTNERS, SESSIONS, SETTLEMENTS, TICKETS
from .support import OPEN_STATES
from .transactions import PAID_STATES, captured


def _day(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def _pct_change(cur: float, prev: float) -> float | None:
    return None if not prev else round(100 * (cur - prev) / prev, 1)


def build(store: Store, principal: Principal) -> dict:
    now = clock.now_ms()
    week, prev_week = now - 7 * clock.DAY, now - 14 * clock.DAY
    views = stations.all_views(store)
    live = [v for v in views if v["publication"] == "live"]
    sessions = store.list(SESSIONS)
    cur = [s for s in sessions if week <= s["startedAt"] <= now]
    prev = [s for s in sessions if prev_week <= s["startedAt"] < week]

    def gmv(rows: list[dict]) -> float:
        return r2(sum((D(captured(s)) for s in rows if s["integrationMode"] == "integrated" and s["paymentStatus"] in PAID_STATES), D(0)))

    attempts = [s for s in cur if s["integrationMode"] == "integrated"]
    paid_ok = [s for s in attempts if s["paymentStatus"] != "failed"]
    live_feed = [v for v in live if v.get("integrationMethod") in ("api", "ocpp", "ocpi")]

    tickets = store.list(TICKETS)
    open_tickets = [t for t in tickets if t["status"] in OPEN_STATES]
    high = [t for t in open_tickets if t["priority"] in ("urgent", "high")]
    issues = [i for i in store.list(DQ_ISSUES) if i["status"] in ("open", "reviewing")]
    critical_issues = [i for i in issues if i["severity"] == "critical"]

    per_day = {_day(now - i * clock.DAY): 0 for i in range(7)}
    for s in cur:
        k = _day(s["startedAt"])
        if k in per_day:
            per_day[k] += 1

    attention = []
    for t in sorted(high, key=lambda t: t["createdAt"])[:4]:
        attention.append({"kind": "ticket", "severity": "critical" if t["priority"] == "urgent" else "warning",
                          "title": t["subject"], "detail": f"{t['id']} · {t['priority']} priority", "href": f"/support?ticket={t['id']}"})
    grouped: dict[tuple[str, str], int] = {}
    for i in sorted(critical_issues, key=lambda i: i.get("lastSeenAt", 0), reverse=True):
        key = (i["title"], i.get("stationName") or "")
        grouped[key] = grouped.get(key, 0) + 1  # one line per problem, not one per connector
    for (title, station_name), n in list(grouped.items())[:4]:
        attention.append({"kind": "data_quality", "severity": "critical", "title": title,
                          "detail": f"{station_name} · {n} connectors" if n > 1 else station_name, "href": "/data-quality"})
    offline_live = [v for v in live if v["status"] == "offline"]
    if offline_live:
        attention.append({"kind": "stations", "severity": "warning", "title": f"{len(offline_live)} live station(s) offline",
                          "detail": ", ".join(v["name"] for v in offline_live[:2]), "href": "/stations?status=offline"})
    awaiting = [d for d in store.list(SETTLEMENTS) if d["status"] == "in_review"]
    if awaiting:
        attention.append({"kind": "settlement", "severity": "info", "title": f"{len(awaiting)} settlement(s) awaiting approval",
                          "detail": "Finance review needed", "href": "/settlements"})
    pending_partners = [p for p in store.list(PARTNERS) if p["status"] == "pending_review"]
    if pending_partners:
        attention.append({"kind": "partner", "severity": "info", "title": f"{len(pending_partners)} partner(s) awaiting verification",
                          "detail": ", ".join(p["legalName"] for p in pending_partners[:2]), "href": "/partners?status=pending_review"})
    failed_unrefunded = [s for s in cur if s["integrationMode"] == "integrated" and s["paymentStatus"] == "failed"]
    if failed_unrefunded:
        attention.append({"kind": "payments", "severity": "warning", "title": f"{len(failed_unrefunded)} failed payment(s) this week",
                          "detail": "Integrated sessions with unpaid balance", "href": "/transactions?status=failed"})
    rank = {"critical": 0, "warning": 1, "info": 2}
    attention.sort(key=lambda a: rank[a["severity"]])

    recent = audit.list_entries(limit=8)["items"] if principal.can("audit:read") else []
    return {
        "generatedAt": now,
        "kpis": {
            "liveStations": len(live), "totalStations": len(views),
            "onlineStations": sum(1 for v in live if v["status"] in ("available", "occupied")),
            "sessions7d": len(cur), "sessionsChangePct": _pct_change(len(cur), len(prev)),
            "gmv7d": gmv(cur), "gmvChangePct": _pct_change(gmv(cur), gmv(prev)),
            "openIssues": len(open_tickets) + len(issues), "openTickets": len(open_tickets),
            "openDataIssues": len(issues), "highPriority": len(high) + len(critical_issues),
        },
        "trend": [{"date": d, "sessions": n} for d, n in sorted(per_day.items())],
        "health": {
            "liveFeedsPct": round(100 * sum(1 for v in live_feed if v["confidence"] == "live") / len(live_feed)) if live_feed else None,
            "paymentSuccessPct": round(1000 * len([s for s in paid_ok if s["paymentStatus"] != "pending"]) / len(attempts)) / 10 if attempts else None,
            "stationDataFreshPct": round(100 * sum(1 for v in live if not v["stale"]) / len(live)) if live else None,
            "offlineStations": len(offline_live),
        },
        "attention": attention[:8],
        "recentActivity": recent,
    }
