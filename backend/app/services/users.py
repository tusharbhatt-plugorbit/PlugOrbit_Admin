"""App users, as seen by support/finance. Personal data is minimised **on the server**: lists and
details only ever carry masked phone/email and a short display name. Raw contact details need an
explicit, reasoned, audited `reveal`."""
import re
from collections import defaultdict

from ..domain import clock
from ..domain.money import D, r2
from ..domain.redact import mask_email, mask_phone
from ..errors import conflict
from ..security.principal import Principal
from ..store.base import Store
from . import audit
from .colls import SESSIONS, TICKETS, USERS
from .common import contains, must_get, paginate

PAID = ("paid", "partially_refunded", "refunded")


def display_name(name: str | None) -> str:
    """'Asha Kulkarni' -> 'Asha K.' (enough to recognise, not enough to identify)."""
    parts = (name or "").split()
    if not parts:
        return "Unnamed user"
    return parts[0] if len(parts) == 1 else f"{parts[0]} {parts[-1][0]}."


def _stats(store: Store) -> dict[str, dict]:
    stats: dict[str, dict] = defaultdict(lambda: {"sessionCount": 0, "spend": 0.0, "unpaidIntegrated": 0, "lastSessionAt": None})
    for s in store.list(SESSIONS):
        st = stats[s["userId"]]
        st["sessionCount"] += 1
        if s["integrationMode"] == "integrated" and s["paymentStatus"] in ("pending", "failed"):
            st["unpaidIntegrated"] += 1
        if s["paymentStatus"] in ("paid", "partially_refunded"):
            net = D(sum(D(e["amount"]) for e in s.get("paymentEvents", []) if e["type"] == "capture")) - D(s.get("refundedAmount", 0))
            st["spend"] = r2(D(st["spend"]) + net)
        if st["lastSessionAt"] is None or s["startedAt"] > st["lastSessionAt"]:
            st["lastSessionAt"] = s["startedAt"]
    return stats


def _open_tickets(store: Store) -> dict[str, int]:
    out: dict[str, int] = defaultdict(int)
    for t in store.list(TICKETS):
        if t.get("userId") and t["status"] not in ("resolved", "closed"):
            out[t["userId"]] += 1
    return out


def view(user: dict, stats: dict, open_tickets: int) -> dict:
    return {
        "id": user["id"],
        "displayName": display_name(user.get("name")),
        "phoneMasked": mask_phone(user.get("phone")),
        "emailMasked": mask_email(user.get("email")),
        "vehicles": [{"id": v.get("id"), "label": f"{v.get('make', '')} {v.get('model', '')}".strip(),
                      "connector": v.get("connector")} for v in user.get("vehicles", [])],
        "status": user.get("status", "active"),
        "restriction": user.get("restriction"),
        "sessionCount": stats.get("sessionCount", 0),
        "spend": stats.get("spend", 0.0),
        "unpaidIntegratedSessions": stats.get("unpaidIntegrated", 0),
        "lastSessionAt": stats.get("lastSessionAt"),
        "openTickets": open_tickets,
        "createdAt": user.get("createdAt"),
    }


def _matches(user: dict, q: str) -> bool:
    needle = q.strip().lower()
    digits = re.sub(r"\D", "", needle)
    phone_digits = re.sub(r"\D", "", user.get("phone") or "")
    if needle == user["id"].lower() or needle == (user.get("email") or "").lower():
        return True
    if len(digits) >= 6 and digits in phone_digits:
        return True
    return (user.get("name") or "").lower().startswith(needle) if len(needle) >= 2 else False


def list_users(store: Store, *, q: str | None, status: str | None, unpaid: bool, limit: int, offset: int) -> dict:
    stats, tickets = _stats(store), _open_tickets(store)
    rows = []
    for u in store.list(USERS):
        if status and u.get("status", "active") != status:
            continue
        if q and not _matches(u, q):
            continue
        v = view(u, stats.get(u["id"], {}), tickets.get(u["id"], 0))
        if unpaid and v["unpaidIntegratedSessions"] == 0:
            continue
        rows.append(v)
    rows.sort(key=lambda r: r["lastSessionAt"] or 0, reverse=True)
    return paginate(rows, limit, offset)


def get_user(store: Store, user_id: str) -> dict:
    user = must_get(store, USERS, user_id, "User")
    v = view(user, _stats(store).get(user_id, {}), _open_tickets(store).get(user_id, 0))
    sessions = sorted(store.list(SESSIONS, {"userId": user_id}), key=lambda s: s["startedAt"], reverse=True)
    v["restrictionHistory"] = user.get("restrictionHistory", [])
    v["recentSessions"] = [{"id": s["id"], "stationName": s["stationName"], "startedAt": s["startedAt"],
                            "grossAmount": s["grossAmount"], "paymentStatus": s["paymentStatus"],
                            "integrationMode": s["integrationMode"]} for s in sessions[:10]]
    v["tickets"] = [{"id": t["id"], "subject": t["subject"], "status": t["status"], "priority": t["priority"]}
                    for t in store.list(TICKETS, {"userId": user_id})]
    return v


def restrict(store: Store, principal: Principal, user_id: str, reason: str) -> dict:
    user = must_get(store, USERS, user_id, "User")
    if user.get("status") == "restricted":
        raise conflict("ALREADY_RESTRICTED", "This account is already restricted.")
    entry = {"action": "restricted", "reason": reason, "by": principal.uid, "byName": principal.name, "at": clock.now_ms()}
    store.update(USERS, user_id, {
        "status": "restricted",
        "restriction": {"reason": reason, "by": principal.uid, "byName": principal.name, "at": entry["at"]},
        "restrictionHistory": [*user.get("restrictionHistory", []), entry],
    })
    audit.record(principal, "user.restrict", "user", user_id, label=display_name(user.get("name")),
                 before={"status": user.get("status", "active")}, after={"status": "restricted"}, reason=reason)
    return get_user(store, user_id)


def unrestrict(store: Store, principal: Principal, user_id: str, reason: str) -> dict:
    user = must_get(store, USERS, user_id, "User")
    if user.get("status") != "restricted":
        raise conflict("NOT_RESTRICTED", "This account is not restricted.")
    entry = {"action": "unrestricted", "reason": reason, "by": principal.uid, "byName": principal.name, "at": clock.now_ms()}
    store.update(USERS, user_id, {"status": "active", "restriction": None,
                                  "restrictionHistory": [*user.get("restrictionHistory", []), entry]})
    audit.record(principal, "user.unrestrict", "user", user_id, label=display_name(user.get("name")),
                 before={"status": "restricted"}, after={"status": "active"}, reason=reason)
    return get_user(store, user_id)


def reveal(store: Store, principal: Principal, user_id: str, reason: str) -> dict:
    """Show the real phone/email once. The reason is mandatory and the access is audited."""
    user = must_get(store, USERS, user_id, "User")
    audit.record(principal, "user.reveal", "user", user_id, label=display_name(user.get("name")),
                 after={"fields": ["phone", "email"]}, reason=reason)
    return {"phone": user.get("phone"), "email": user.get("email"), "name": user.get("name")}
