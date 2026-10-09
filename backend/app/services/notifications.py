"""Notifications & content (Phase 2). Operational messages only: marketing campaigns, partner
offers and promotions are a separate, later module and are deliberately not creatable here.

Publishing records the message for the apps to read. Push/email/SMS *delivery* is a separate
integration that is not wired yet (see Integrations), and the API says so rather than implying
messages were sent.
"""
from ..domain import clock
from ..errors import conflict, invalid
from ..schemas.ops import NotificationCreate, NotificationUpdate
from ..security.principal import Principal
from ..store.base import Store
from . import audit
from .colls import NOTIFICATIONS, STATIONS
from .common import check_version, must_get, paginate, stamp

DELIVERY_NOTE = "Published in-app content only. Push, email and SMS delivery are not connected yet."
MARKETING = {"enabled": False, "note": "Marketing campaigns, partner offers and promotions are a later module, kept apart from operational messages."}


def _view(n: dict) -> dict:
    return {**n, "deliveryNote": DELIVERY_NOTE if any(c != "in_app" for c in n.get("channels", [])) else None}


def list_notifications(store: Store, *, kind: str | None, status: str | None, limit: int, offset: int) -> dict:
    rows = [_view(n) for n in store.list(NOTIFICATIONS)
            if (not kind or n["kind"] == kind) and (not status or n["status"] == status)]
    rows.sort(key=lambda n: n["updatedAt"], reverse=True)
    page = paginate(rows, limit, offset)
    page["marketing"] = MARKETING
    return page


def _check(store: Store, body) -> None:
    if body.stationId and store.get(STATIONS, body.stationId) is None:
        raise invalid("That station does not exist.", "UNKNOWN_STATION")
    if body.startsAt and body.endsAt and body.endsAt <= body.startsAt:
        raise invalid("The end time must be after the start time.", "BAD_WINDOW")
    if body.kind == "charger_outage" and not body.stationId:
        raise invalid("A charger-outage notice must name the station.", "STATION_REQUIRED")


def create(store: Store, principal: Principal, body: NotificationCreate) -> dict:
    _check(store, body)
    nid = clock.new_id("nt")
    doc = store.create(NOTIFICATIONS, nid, stamp({**body.model_dump(), "status": "draft"}, None, actor_uid=principal.uid))
    audit.record(principal, "notification.create", "notification", nid, label=doc["title"],
                 after={"kind": doc["kind"], "channels": doc["channels"]})
    return _view(doc)


def update(store: Store, principal: Principal, nid: str, body: NotificationUpdate) -> dict:
    n = must_get(store, NOTIFICATIONS, nid, "Notification")
    check_version(n, body.expectedVersion)
    if n["status"] != "draft":
        raise conflict("NOT_EDITABLE", "Only drafts can be edited. Duplicate it to change a published message.")
    _check(store, body)
    saved = store.update(NOTIFICATIONS, nid, stamp(body.model_dump(exclude={"expectedVersion"}), n, actor_uid=principal.uid))
    audit.record(principal, "notification.update", "notification", nid, label=saved["title"], before={"title": n["title"]}, after={"title": saved["title"]})
    return _view(saved)


def publish(store: Store, principal: Principal, nid: str) -> dict:
    n = must_get(store, NOTIFICATIONS, nid, "Notification")
    if n["status"] != "draft":
        raise conflict("NOT_EDITABLE", "This message is already published.")
    saved = store.update(NOTIFICATIONS, nid, stamp({"status": "published", "publishedAt": clock.now_ms(),
                                                    "publishedBy": principal.uid}, n, actor_uid=principal.uid))
    audit.record(principal, "notification.publish", "notification", nid, label=n["title"],
                 before={"status": "draft"}, after={"status": "published", "channels": n["channels"]})
    return _view(saved)
