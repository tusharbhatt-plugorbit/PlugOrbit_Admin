"""Partner settlements (admin-reviewed runs; scheduled automatic payouts are Phase 2).

Formula, per partner and period (all from *integrated* sessions PlugOrbit collected):

    gross        = what drivers paid (captured), GST-inclusive
    refunds      = refunded on those sessions
    base         = gross - refunds
    fee          = revenue_share:       base x commission%
                   flat_fee_per_kwh:    energy delivered x flat fee   (sessions not fully refunded)
                   listing_only:        0
    fee GST      = fee x platformFeeGstPercent
    net payable  = base - fee - fee GST + adjustments

External (operator-paid) sessions are never settled: the operator already took that money; they
are reported alongside as "excluded". TAX TREATMENT IS A PENDING FINANCE/CA DECISION: see
docs/PENDING_DECISIONS.md.

Controls: each session can be settled once (`settlementId` stamp), approval is maker-checker
(the person who ran it cannot approve it, unless disabled in Settings), payout needs a UTR/reference.
"""
from datetime import datetime, timezone

from ..domain import clock
from ..domain.money import D, r2
from ..errors import conflict, forbidden, invalid
from ..schemas.money import SettlementAdjustment, SettlementHold, SettlementPaid, SettlementRun
from ..security.principal import Principal
from ..store.base import Store
from . import audit
from . import config as config_service
from .colls import PARTNERS, SESSIONS, SETTLEMENTS
from .common import must_get, paginate
from .transactions import PAID_STATES, captured

STATUSES = ("in_review", "approved", "paid", "on_hold")


def _day(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y%m%d")


def _plan_for(partner: dict, cfg: dict) -> dict:
    """Effective commercial terms: the partner's own numbers, else its commission plan."""
    plan = next((p for p in cfg["commissionPlans"] if p["id"] == partner.get("commissionPlanId")), None)
    model = partner.get("commercialModel", "revenue_share")
    percent = partner.get("commissionPercent")
    flat = partner.get("flatFeePerKwh")
    if percent is None and plan:
        percent = plan.get("commissionPercent")
    if flat is None and plan:
        flat = plan.get("flatFeePerKwh")
    return {"model": model, "commissionPercent": percent, "flatFeePerKwh": flat}


def compute(partner: dict, sessions: list[dict], cfg: dict, start: int, end: int) -> dict:
    terms = _plan_for(partner, cfg)
    eligible = [s for s in sessions
                if s["integrationMode"] == "integrated" and s["paymentStatus"] in PAID_STATES
                and start <= (s.get("endedAt") or 0) < end and not s.get("settlementId")]
    external = [s for s in sessions if s["integrationMode"] == "external" and start <= (s.get("endedAt") or 0) < end]
    gross = sum((D(captured(s)) for s in eligible), D(0))
    refunds = sum((D(s.get("refundedAmount", 0)) for s in eligible), D(0))
    base = gross - refunds
    if terms["model"] == "revenue_share":
        fee = base * D(terms["commissionPercent"] or 0) / D(100)
    elif terms["model"] == "flat_fee_per_kwh":
        fee = sum((D(s["energyKwh"]) * D(terms["flatFeePerKwh"] or 0) for s in eligible
                   if s["paymentStatus"] != "refunded"), D(0))
    else:
        fee = D(0)
    # Round each displayed component first, then derive the net from those exact figures, so the
    # settlement always adds up on paper to the paisa.
    fee = D(r2(fee))
    gst = D(r2(fee * D(cfg["platformFeeGstPercent"]) / D(100)))
    return {
        "sessionIds": [s["id"] for s in eligible],
        "sessionCount": len(eligible),
        "grossValue": r2(gross), "refunds": r2(refunds), "fee": r2(fee), "taxes": r2(gst),
        "adjustments": 0.0, "netPayable": r2(base - fee - gst),
        "terms": terms,
        "excludedExternal": {"count": len(external), "value": r2(sum((D(s["grossAmount"]) for s in external), D(0)))},
    }


def _recompute_net(doc: dict) -> float:
    return r2(D(doc["grossValue"]) - D(doc["refunds"]) - D(doc["fee"]) - D(doc["taxes"]) + D(doc["adjustments"]))


def run(store: Store, principal: Principal, body: SettlementRun) -> dict:
    cfg = config_service.get(store)
    partners = [p for p in store.list(PARTNERS) if p["status"] == "active"]
    if body.partnerIds:
        wanted = set(body.partnerIds)
        unknown = wanted - {p["id"] for p in store.list(PARTNERS)}
        if unknown:
            raise invalid(f"Unknown partner(s): {', '.join(sorted(unknown))}", "UNKNOWN_PARTNER")
        partners = [p for p in store.list(PARTNERS) if p["id"] in wanted]
    created, skipped = [], []
    for p in partners:
        sid = f"stl-{p['id'].removeprefix('ptn-')}-{_day(body.periodStart)}-{_day(body.periodEnd)}"
        if store.get(SETTLEMENTS, sid):
            skipped.append({"partnerId": p["id"], "reason": "A settlement for this period already exists."})
            continue
        calc = compute(p, store.list(SESSIONS, {"partnerId": p["id"]}), cfg, body.periodStart, body.periodEnd)
        if calc["sessionCount"] == 0:
            skipped.append({"partnerId": p["id"], "reason": "No settleable sessions in this period."})
            continue
        doc = store.create(SETTLEMENTS, sid, {
            "partnerId": p["id"], "partnerName": p.get("displayName") or p["legalName"],
            "periodStart": body.periodStart, "periodEnd": body.periodEnd,
            **calc, "adjustmentLines": [], "status": "in_review", "payoutReference": None,
            "createdAt": clock.now_ms(), "createdBy": principal.uid, "createdByName": principal.name,
            "taxNote": "Tax treatment pending finance sign-off.",
        })
        for session_id in calc["sessionIds"]:
            store.update(SESSIONS, session_id, {"settlementId": sid})
        audit.record(principal, "settlement.run", "settlement", sid, label=doc["partnerName"],
                     after={"gross": doc["grossValue"], "net": doc["netPayable"], "sessions": doc["sessionCount"]})
        created.append(sid)
    return {"created": [get(store, c) for c in created], "skipped": skipped}


def _row(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k != "sessionIds"}


def list_settlements(store: Store, *, partner_id: str | None, status: str | None, limit: int, offset: int) -> dict:
    rows = [d for d in store.list(SETTLEMENTS)
            if (not partner_id or d["partnerId"] == partner_id) and (not status or d["status"] == status)]
    rows.sort(key=lambda d: (d["periodEnd"], d["partnerName"]), reverse=True)
    allrows = store.list(SETTLEMENTS)
    summary = {
        "payable": r2(sum((D(d["netPayable"]) for d in allrows if d["status"] in ("in_review", "approved")), D(0))),
        "paid": r2(sum((D(d["netPayable"]) for d in allrows if d["status"] == "paid"), D(0))),
        "onHold": r2(sum((D(d["netPayable"]) for d in allrows if d["status"] == "on_hold"), D(0))),
        "awaitingApproval": sum(1 for d in allrows if d["status"] == "in_review"),
    }
    page = paginate(rows, limit, offset)
    page["items"] = [_row(d) for d in page["items"]]
    page["summary"] = summary
    return page


def get(store: Store, settlement_id: str) -> dict:
    doc = must_get(store, SETTLEMENTS, settlement_id, "Settlement")
    sessions = []
    for sid in doc.get("sessionIds", [])[:200]:
        s = store.get(SESSIONS, sid)
        if s:
            sessions.append({"id": s["id"], "stationName": s["stationName"], "endedAt": s.get("endedAt"),
                             "gross": captured(s), "refunded": s.get("refundedAmount", 0), "energyKwh": s["energyKwh"]})
    return {**doc, "sessions": sessions, "audit": audit.list_entries(entity_type="settlement", entity_id=settlement_id, limit=30)["items"]}


def _must_be(doc: dict, *statuses: str, what: str) -> None:
    if doc["status"] not in statuses:
        raise conflict("ILLEGAL_STATE", f"A settlement that is {doc['status'].replace('_', ' ')} cannot be {what}.")


def adjust(store: Store, principal: Principal, settlement_id: str, body: SettlementAdjustment) -> dict:
    doc = must_get(store, SETTLEMENTS, settlement_id, "Settlement")
    _must_be(doc, "in_review", "on_hold", what="adjusted")
    line = {"id": clock.new_id("adj"), "label": body.label, "amount": r2(body.amount), "reason": body.reason,
            "by": principal.uid, "byName": principal.name, "at": clock.now_ms()}
    lines = [*doc.get("adjustmentLines", []), line]
    adjustments = r2(sum((D(x["amount"]) for x in lines), D(0)))
    patch = {"adjustmentLines": lines, "adjustments": adjustments}
    patch["netPayable"] = _recompute_net({**doc, **patch})
    store.update(SETTLEMENTS, settlement_id, patch)
    audit.record(principal, "settlement.adjust", "settlement", settlement_id, label=doc["partnerName"],
                 before={"adjustments": doc["adjustments"], "net": doc["netPayable"]},
                 after={"adjustments": adjustments, "net": patch["netPayable"], "line": body.label}, reason=body.reason)
    return get(store, settlement_id)


def approve(store: Store, principal: Principal, settlement_id: str) -> dict:
    doc = must_get(store, SETTLEMENTS, settlement_id, "Settlement")
    _must_be(doc, "in_review", what="approved")
    if config_service.get(store).get("settlementMakerChecker", True) and doc.get("createdBy") == principal.uid:
        raise forbidden("The person who ran a settlement cannot approve it. Ask a second finance admin "
                        "(or switch maker-checker off in Settings).", "MAKER_CHECKER")
    store.update(SETTLEMENTS, settlement_id, {"status": "approved", "approvedBy": principal.uid,
                                              "approvedByName": principal.name, "approvedAt": clock.now_ms()})
    audit.record(principal, "settlement.approve", "settlement", settlement_id, label=doc["partnerName"],
                 before={"status": "in_review"}, after={"status": "approved", "net": doc["netPayable"]})
    return get(store, settlement_id)


def hold(store: Store, principal: Principal, settlement_id: str, body: SettlementHold) -> dict:
    doc = must_get(store, SETTLEMENTS, settlement_id, "Settlement")
    if doc["status"] == "on_hold":  # release the hold
        store.update(SETTLEMENTS, settlement_id, {"status": "in_review", "holdReason": None})
        audit.record(principal, "settlement.hold", "settlement", settlement_id, label=doc["partnerName"],
                     before={"status": "on_hold"}, after={"status": "in_review"}, reason=body.reason)
    else:
        _must_be(doc, "in_review", "approved", what="put on hold")
        store.update(SETTLEMENTS, settlement_id, {"status": "on_hold", "holdReason": body.reason})
        audit.record(principal, "settlement.hold", "settlement", settlement_id, label=doc["partnerName"],
                     before={"status": doc["status"]}, after={"status": "on_hold"}, reason=body.reason)
    return get(store, settlement_id)


def mark_paid(store: Store, principal: Principal, settlement_id: str, body: SettlementPaid) -> dict:
    doc = must_get(store, SETTLEMENTS, settlement_id, "Settlement")
    _must_be(doc, "approved", what="marked paid")
    if doc["netPayable"] <= 0:
        raise conflict("NOTHING_PAYABLE", "The net payable is zero or negative, so there is nothing to pay. "
                                          "Carry the balance forward with an adjustment in the next run.")
    store.update(SETTLEMENTS, settlement_id, {"status": "paid", "payoutReference": body.payoutReference,
                                              "paidBy": principal.uid, "paidByName": principal.name,
                                              "paidAt": clock.now_ms()})
    audit.record(principal, "settlement.paid", "settlement", settlement_id, label=doc["partnerName"],
                 before={"status": "approved"}, after={"status": "paid", "net": doc["netPayable"],
                                                       "payoutReference": body.payoutReference})
    return get(store, settlement_id)
