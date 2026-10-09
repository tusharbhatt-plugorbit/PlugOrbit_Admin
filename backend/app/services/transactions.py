"""Charging/payment sessions ("transactions") and refunds.

`integrationMode` is the key idea: an *integrated* session is controlled and charged by
PlugOrbit (pre-authorisation, capture, release, refund); an *external* session was started and
paid at the operator's own app/QR/terminal, so PlugOrbit only records it and can never refund it.
"""
from ..domain import clock
from ..domain.redact import mask_email, mask_phone
from ..errors import ApiError, conflict, invalid
from ..schemas.money import RefundRequest
from ..security.principal import Principal
from ..store.base import Store
from . import audit
from . import gateway as gateway_service
from .colls import SESSIONS, STATIONS, TICKETS, USERS
from .common import contains, must_get, paginate
from .users import display_name
from ..domain.money import D, r2

PAID_STATES = ("paid", "partially_refunded", "refunded")


def captured(session: dict) -> float:
    return r2(sum(D(e["amount"]) for e in session.get("paymentEvents", []) if e["type"] == "capture"))


def refundable_amount(session: dict) -> float:
    if session.get("integrationMode") != "integrated" or session.get("paymentStatus") not in ("paid", "partially_refunded"):
        return 0.0
    return max(0.0, r2(D(captured(session)) - D(session.get("refundedAmount", 0))))


def _user_bits(users: dict[str, dict], user_id: str) -> dict:
    u = users.get(user_id) or {}
    return {"userId": user_id, "userName": display_name(u.get("name")), "userPhone": mask_phone(u.get("phone")),
            "userEmail": mask_email(u.get("email"))}


def row(session: dict, users: dict[str, dict]) -> dict:
    return {
        "id": session["id"], "stationId": session["stationId"], "stationName": session["stationName"],
        "partnerId": session.get("partnerId"), "connectorId": session["connectorId"],
        "connectorLabel": session["connectorLabel"], "connectorType": session["connectorType"],
        "powerKw": session["powerKw"], "energyKwh": session["energyKwh"], "durationMin": session["durationMin"],
        "grossAmount": session["grossAmount"], "refundedAmount": session.get("refundedAmount", 0),
        "paymentMethod": session["paymentMethod"], "paymentStatus": session["paymentStatus"],
        "integrationMode": session["integrationMode"], "startedAt": session["startedAt"], "endedAt": session.get("endedAt"),
        **_user_bits(users, session["userId"]),
    }


def list_sessions(store: Store, *, q: str | None, status: str | None, mode: str | None, station_id: str | None,
                  user_id: str | None, partner_id: str | None, since: int | None, until: int | None,
                  limit: int, offset: int) -> dict:
    users = {u["id"]: u for u in store.list(USERS)}
    rows, summary = [], {"count": 0, "gross": 0.0, "paid": 0, "pending": 0, "failed": 0, "refunded": 0, "external": 0}
    for s in store.list(SESSIONS):
        if status and s["paymentStatus"] != status:
            continue
        if mode and s["integrationMode"] != mode:
            continue
        if station_id and s["stationId"] != station_id:
            continue
        if user_id and s["userId"] != user_id:
            continue
        if partner_id and s.get("partnerId") != partner_id:
            continue
        if since and s["startedAt"] < since:
            continue
        if until and s["startedAt"] > until:
            continue
        if q and not contains([s["id"], s["stationName"], s["userId"], (s.get("gateway") or {}).get("reference")], q):
            continue
        rows.append(s)
    rows.sort(key=lambda s: s["startedAt"], reverse=True)
    for s in rows:
        summary["count"] += 1
        if s["paymentStatus"] in PAID_STATES:
            summary["gross"] = r2(D(summary["gross"]) + D(captured(s)))
        key = {"paid": "paid", "partially_refunded": "paid", "pending": "pending", "failed": "failed",
               "refunded": "refunded", "external": "external"}[s["paymentStatus"]]
        summary[key] += 1
    page = paginate(rows, limit, offset)
    page["items"] = [row(s, users) for s in page["items"]]
    page["summary"] = summary
    return page


def get_session(store: Store, session_id: str) -> dict:
    s = must_get(store, SESSIONS, session_id, "Transaction")
    users = {s["userId"]: store.get(USERS, s["userId"]) or {}}
    station = store.get(STATIONS, s["stationId"]) or {}
    gw = gateway_service.get_gateway()
    refundable = refundable_amount(s)
    return {
        **row(s, {k: v for k, v in users.items()}),
        "vehicle": s.get("vehicle"), "tariff": s.get("tariff"), "breakdown": s.get("breakdown"),
        "gateway": s.get("gateway"), "paymentEvents": s.get("paymentEvents", []),
        "preauthAmount": next((e["amount"] for e in s.get("paymentEvents", []) if e["type"] == "preauth"), None),
        "capturedAmount": captured(s),
        "releasedAmount": r2(sum(D(e["amount"]) for e in s.get("paymentEvents", []) if e["type"] == "release")),
        "failureReason": s.get("failureReason"),
        "stationCity": station.get("city"),
        "refundableAmount": refundable,
        "refundSupported": bool(gw.supports_refunds) and s.get("integrationMode") == "integrated",
        "gatewaySimulated": bool(gw.simulated),
        "settlementId": s.get("settlementId"),
        "tickets": [{"id": t["id"], "subject": t["subject"], "status": t["status"]}
                    for t in store.list(TICKETS, {"sessionId": session_id})],
        "audit": audit.list_entries(entity_type="session", entity_id=session_id, limit=50)["items"],
    }


def refund(store: Store, principal: Principal, session_id: str, body: RefundRequest, idempotency_key: str | None) -> dict:
    s = must_get(store, SESSIONS, session_id, "Transaction")
    key = idempotency_key or clock.new_id("idem")

    # Idempotent retry: the same key never refunds twice (double-click, flaky network).
    if idempotency_key:
        for e in s.get("paymentEvents", []):
            if e["type"] == "refund" and e.get("idempotencyKey") == idempotency_key:
                return get_session(store, session_id)

    if s["integrationMode"] != "integrated":
        raise conflict("NOT_REFUNDABLE", "This session was paid to the operator directly. "
                                         "PlugOrbit cannot refund it; raise it with the operator.")
    if s["paymentStatus"] not in ("paid", "partially_refunded"):
        raise conflict("NOT_REFUNDABLE", f"A {s['paymentStatus'].replace('_', ' ')} session has nothing to refund.")
    remaining = refundable_amount(s)
    amount = r2(body.amount) if body.amount is not None else remaining
    if amount <= 0:
        raise conflict("NOTHING_TO_REFUND", "This session has already been fully refunded.")
    if amount > remaining + 1e-9:
        raise invalid(f"You can refund at most ₹{remaining:.2f} on this session.", "AMOUNT_TOO_HIGH", maximum=remaining)

    gw = gateway_service.get_gateway()
    result = gw.refund((s.get("gateway") or {}).get("reference", ""), amount, key)  # may raise 501

    total_refunded = r2(D(s.get("refundedAmount", 0)) + D(amount))
    full = total_refunded >= captured(s) - 1e-9
    event = {"id": clock.new_id("ev"), "type": "refund", "amount": amount, "at": clock.now_ms(),
             "ref": result["ref"], "actor": principal.uid, "actorName": principal.name,
             "reason": body.reason, "idempotencyKey": key, "simulated": gw.simulated}
    store.update(SESSIONS, session_id, {
        "paymentEvents": [*s.get("paymentEvents", []), event],
        "refundedAmount": total_refunded,
        "paymentStatus": "refunded" if full else "partially_refunded",
    })
    audit.record(principal, "refund.issue", "session", session_id, label=f"{s['stationName']} · {s['id']}",
                 before={"refundedAmount": s.get("refundedAmount", 0), "paymentStatus": s["paymentStatus"]},
                 after={"refundedAmount": total_refunded, "paymentStatus": "refunded" if full else "partially_refunded",
                        "amount": amount, "gatewayRef": result["ref"], "simulated": gw.simulated},
                 reason=body.reason)
    return get_session(store, session_id)


def require_known(session_id: str, store: Store) -> dict:
    s = store.get(SESSIONS, session_id)
    if s is None:
        raise ApiError(422, "UNKNOWN_SESSION", f"Session {session_id} does not exist.")
    return s
