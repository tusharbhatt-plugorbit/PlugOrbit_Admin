"""Support & issue management."""
from ..domain import clock
from ..domain.redact import mask_email, mask_phone
from ..errors import invalid
from ..schemas.ops import TicketCreate, TicketNote, TicketUpdate
from ..security.principal import Principal
from ..store.base import Store
from . import audit
from .colls import ADMINS, SESSIONS, STATIONS, TICKETS, USERS
from .common import check_version, contains, must_get, paginate, stamp
from .users import display_name

OPEN_STATES = ("open", "in_review", "waiting_user", "waiting_partner")
CLOSED_STATES = ("resolved", "closed")
# Response targets by priority (hours): drives the "SLA" column so urgent work is never lost.
SLA_HOURS = {"urgent": 4, "high": 24, "medium": 72, "low": 168}
PRIORITY_RANK = {"urgent": 0, "high": 1, "medium": 2, "low": 3}

CATEGORY_LABEL = {
    "charging_issue": "Charging issue", "payment_issue": "Payment issue", "charger_offline": "Charger offline",
    "broken_connector": "Broken connector", "wrong_pricing": "Wrong pricing", "access_blocked": "Access blocked",
    "location_problem": "Location problem", "refund_dispute": "Refund / dispute", "other": "Other",
}


def view(t: dict, users: dict[str, dict], now: int) -> dict:
    u = users.get(t.get("userId") or "", {})
    due = t["createdAt"] + SLA_HOURS[t["priority"]] * 3_600_000
    active = t["status"] in OPEN_STATES
    return {
        **{k: v for k, v in t.items() if k != "notes"},
        "categoryLabel": CATEGORY_LABEL[t["category"]],
        "userName": display_name(u.get("name")) if u else None,
        "userPhone": mask_phone(u.get("phone")) if u else None,
        "userEmail": mask_email(u.get("email")) if u else None,
        "noteCount": len(t.get("notes", [])),
        "slaDueAt": due if active else None,
        "slaBreached": active and now > due,
    }


def list_tickets(store: Store, *, q: str | None, status: str | None, category: str | None, priority: str | None,
                 owner_id: str | None, station_id: str | None, user_id: str | None, session_id: str | None,
                 limit: int, offset: int) -> dict:
    now = clock.now_ms()
    users = {u["id"]: u for u in store.list(USERS)}
    rows = []
    for t in store.list(TICKETS):
        if status == "active" and t["status"] not in OPEN_STATES:
            continue
        if status and status != "active" and t["status"] != status:
            continue
        if category and t["category"] != category:
            continue
        if priority and t["priority"] != priority:
            continue
        if owner_id == "unassigned" and t.get("ownerId"):
            continue
        if owner_id and owner_id != "unassigned" and t.get("ownerId") != owner_id:
            continue
        if station_id and t.get("stationId") != station_id:
            continue
        if user_id and t.get("userId") != user_id:
            continue
        if session_id and t.get("sessionId") != session_id:
            continue
        if q and not contains([t["id"], t["subject"], t.get("sessionId"), t.get("stationName")], q):
            continue
        rows.append(view(t, users, now))
    rows.sort(key=lambda r: (r["status"] in CLOSED_STATES, PRIORITY_RANK[r["priority"]], -r["updatedAt"]))
    page = paginate(rows, limit, offset)
    page["summary"] = {
        "open": sum(1 for r in rows if r["status"] in OPEN_STATES),
        "urgent": sum(1 for r in rows if r["status"] in OPEN_STATES and r["priority"] in ("urgent", "high")),
        "breached": sum(1 for r in rows if r["slaBreached"]),
        "unassigned": sum(1 for r in rows if r["status"] in OPEN_STATES and not r.get("ownerId")),
    }
    return page


def get_ticket(store: Store, ticket_id: str) -> dict:
    t = must_get(store, TICKETS, ticket_id, "Ticket")
    users = {t["userId"]: store.get(USERS, t["userId"]) or {}} if t.get("userId") else {}
    out = view(t, users, clock.now_ms())
    out["notes"] = t.get("notes", [])
    out["description"] = t.get("description")
    return out


def create(store: Store, principal: Principal, body: TicketCreate) -> dict:
    data = body.model_dump()
    session = None
    if data.get("sessionId"):
        session = store.get(SESSIONS, data["sessionId"])
        if session is None:
            raise invalid(f"Session {data['sessionId']} does not exist.", "UNKNOWN_SESSION")
        data["stationId"] = data.get("stationId") or session["stationId"]
        data["userId"] = data.get("userId") or session["userId"]
    station = None
    if data.get("stationId"):
        station = store.get(STATIONS, data["stationId"])
        if station is None:
            raise invalid(f"Station {data['stationId']} does not exist.", "UNKNOWN_STATION")
    if data.get("userId") and store.get(USERS, data["userId"]) is None:
        raise invalid("That user does not exist.", "UNKNOWN_USER")
    ticket_id = f"TKT-{store.next_seq('tickets')}"
    doc = store.create(TICKETS, ticket_id, stamp({
        **data, "status": "open", "ownerId": principal.uid, "ownerName": principal.name,
        "stationName": station["name"] if station else None, "notes": [], "resolvedAt": None,
        "source": "admin",
    }, None, actor_uid=principal.uid))
    audit.record(principal, "ticket.create", "ticket", ticket_id, label=doc["subject"],
                 after={"category": doc["category"], "priority": doc["priority"], "sessionId": doc.get("sessionId")})
    return get_ticket(store, ticket_id)


def update(store: Store, principal: Principal, ticket_id: str, body: TicketUpdate) -> dict:
    t = must_get(store, TICKETS, ticket_id, "Ticket")
    check_version(t, body.expectedVersion)
    patch: dict = {}
    for field in ("category", "priority", "status", "sessionId", "stationId"):
        value = getattr(body, field)
        if value is not None and value != t.get(field):
            patch[field] = value
    if body.stationId:
        station = store.get(STATIONS, body.stationId)
        if station is None:
            raise invalid("That station does not exist.", "UNKNOWN_STATION")
        patch["stationName"] = station["name"]
    if body.unassign:
        patch.update(ownerId=None, ownerName=None)
    elif body.ownerId is not None and body.ownerId != t.get("ownerId"):
        owner = store.get(ADMINS, body.ownerId)
        if owner is None or owner.get("status") == "disabled":
            raise invalid("Assign the ticket to an active admin.", "UNKNOWN_OWNER")
        patch.update(ownerId=owner["id"], ownerName=owner.get("name") or owner.get("email"))
    if not patch:
        return get_ticket(store, ticket_id)
    if "status" in patch:
        patch["resolvedAt"] = clock.now_ms() if patch["status"] in CLOSED_STATES else None
    store.update(TICKETS, ticket_id, stamp(patch, t, actor_uid=principal.uid))
    audit.record(principal, "ticket.update", "ticket", ticket_id, label=t["subject"],
                 before={k: t.get(k) for k in patch if k in t or k in ("ownerId",)},
                 after={k: v for k, v in patch.items() if k not in ("resolvedAt",)})
    return get_ticket(store, ticket_id)


def add_note(store: Store, principal: Principal, ticket_id: str, body: TicketNote) -> dict:
    t = must_get(store, TICKETS, ticket_id, "Ticket")
    note = {"id": clock.new_id("nt"), "body": body.body, "by": principal.uid, "byName": principal.name,
            "at": clock.now_ms(), "internal": True}
    store.update(TICKETS, ticket_id, stamp({"notes": [*t.get("notes", []), note]}, t, actor_uid=principal.uid))
    audit.record(principal, "ticket.note", "ticket", ticket_id, label=t["subject"],
                 after={"note": body.body[:200] + ("…" if len(body.body) > 200 else "")})
    return get_ticket(store, ticket_id)
