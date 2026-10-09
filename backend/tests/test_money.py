import time

from app.domain.money import r2
from app.services import settlements
from app.services.colls import SESSIONS

from .conftest import Admin, code

REF = "PO-6A4K92"


def refund(fin, sid, **body):
    return fin.post(f"/transactions/{sid}/refund", {"reason": "Charger slowed mid-session", **body})


# ----------------------------------------------------------------------- refunds -----
def test_reference_session_detail(fin):
    t = fin.get(f"/transactions/{REF}").json()
    assert t["userPhone"] == "98•••41" and t["grossAmount"] == 556.49
    assert (t["preauthAmount"], t["capturedAmount"], t["releasedAmount"]) == (600.0, 556.49, 43.51)
    assert t["refundableAmount"] == 556.49 and t["refundSupported"] and t["gatewaySimulated"]
    assert [e["type"] for e in t["paymentEvents"]] == ["preauth", "capture", "release"]


def test_partial_then_full_refund_tracks_the_balance(fin):
    r = refund(fin, REF, amount=100)
    assert r.status_code == 200 and r.json()["paymentStatus"] == "partially_refunded"
    assert r.json()["refundableAmount"] == 456.49 and r.json()["refundedAmount"] == 100
    r = refund(fin, REF)  # full = whatever remains
    assert r.json()["paymentStatus"] == "refunded" and r.json()["refundableAmount"] == 0
    assert code(refund(fin, REF)) in ("NOT_REFUNDABLE", "NOTHING_TO_REFUND")


def test_cannot_refund_more_than_was_captured(fin):
    r = refund(fin, REF, amount=600)
    assert r.status_code == 422 and code(r) == "AMOUNT_TOO_HIGH" and r.json()["detail"]["maximum"] == 556.49


def test_refund_is_idempotent(fin):
    h = {"Idempotency-Key": "abc-123"}
    first = fin.post(f"/transactions/{REF}/refund", {"reason": "Goodwill refund", "amount": 50}, headers=h).json()
    second = fin.post(f"/transactions/{REF}/refund", {"reason": "Goodwill refund", "amount": 50}, headers=h).json()
    assert first["refundedAmount"] == second["refundedAmount"] == 50
    assert sum(1 for e in second["paymentEvents"] if e["type"] == "refund") == 1


def test_operator_paid_sessions_cannot_be_refunded_by_plugorbit(fin, store):
    ext = next(s for s in store.list(SESSIONS) if s["integrationMode"] == "external")
    r = refund(fin, ext["id"])
    assert r.status_code == 409 and code(r) == "NOT_REFUNDABLE"
    t = fin.get(f"/transactions/{ext['id']}").json()
    assert t["paymentStatus"] == "external" and t["refundSupported"] is False and t["paymentEvents"] == []


def test_failed_and_pending_sessions_have_nothing_to_refund(fin, store):
    for status in ("failed", "pending"):
        s = next(x for x in store.list(SESSIONS) if x["paymentStatus"] == status)
        assert code(refund(fin, s["id"])) == "NOT_REFUNDABLE"


def test_refund_is_refused_honestly_when_no_gateway_is_connected(fin):
    from app.services import gateway
    gateway.set_gateway(gateway.NotConfiguredGateway())
    r = refund(fin, REF, amount=10)
    assert r.status_code == 501 and code(r) == "INTEGRATION_UNAVAILABLE"
    assert fin.get(f"/transactions/{REF}").json()["refundedAmount"] == 0  # nothing recorded as refunded


def test_refund_audit_entry(fin):
    refund(fin, REF, amount=25)
    e = fin.get(f"/audit?action=refund.issue&entityId={REF}").json()["items"][0]
    assert e["after"]["amount"] == 25 and e["after"]["simulated"] is True and e["actor"]["role"] == "finance"


def test_transaction_filters_and_summary(fin):
    ext = fin.get("/transactions?mode=external&limit=200").json()
    assert ext["items"] and all(i["paymentStatus"] == "external" for i in ext["items"])
    paid = fin.get("/transactions?status=paid&limit=200").json()
    assert paid["summary"]["count"] == paid["total"] > 0
    assert fin.get(f"/transactions?q={REF}").json()["total"] == 1
    assert all(i["userPhone"] and "•" in i["userPhone"] for i in paid["items"])  # always masked


# ------------------------------------------------------------------- settlements -----
def day_range(days_ago_start, days_ago_end):
    now = int(time.time() * 1000)
    return now - days_ago_start * 86_400_000, now - days_ago_end * 86_400_000


def test_settlement_maths_is_exact(store):
    partner = store.get("partners", "ptn-chargezone")
    cfg = {"platformFeeGstPercent": 18.0, "commissionPlans": []}
    mk = lambda i, gross, refunded=0, mode="integrated", status="paid": {  # noqa: E731
        "id": f"S{i}", "integrationMode": mode, "paymentStatus": status, "endedAt": 1_000, "energyKwh": 10,
        "grossAmount": gross, "refundedAmount": refunded,
        "paymentEvents": [{"type": "capture", "amount": gross}] if mode == "integrated" else []}
    sessions = [mk(1, 1000), mk(2, 500, refunded=100, status="partially_refunded"), mk(3, 300, mode="external", status="external"),
                mk(4, 0, status="failed")]
    out = settlements.compute({**partner, "commissionPercent": 12.0, "commercialModel": "revenue_share"}, sessions, cfg, 0, 2_000)
    assert out["sessionCount"] == 2 and out["grossValue"] == 1500 and out["refunds"] == 100
    assert out["fee"] == r2(1400 * 0.12) == 168.0 and out["taxes"] == r2(168 * 0.18) == 30.24
    assert out["netPayable"] == r2(1400 - 168 - 30.24) and out["excludedExternal"] == {"count": 1, "value": 300.0}


def test_flat_fee_and_listing_only_models(store):
    cfg = {"platformFeeGstPercent": 18.0, "commissionPlans": []}
    s = [{"id": "S1", "integrationMode": "integrated", "paymentStatus": "paid", "endedAt": 5, "energyKwh": 20, "grossAmount": 400,
          "refundedAmount": 0, "paymentEvents": [{"type": "capture", "amount": 400}]}]
    flat = settlements.compute({"commercialModel": "flat_fee_per_kwh", "flatFeePerKwh": 2.5}, s, cfg, 0, 10)
    assert flat["fee"] == 50.0
    listing = settlements.compute({"commercialModel": "listing_only"}, s, cfg, 0, 10)
    assert listing["fee"] == 0 and listing["netPayable"] == 400


def test_a_session_can_only_be_settled_once(client, store):
    fin = Admin(client, "finance")
    start, end = day_range(60, 0)
    first = fin.post("/settlements/run", {"periodStart": start, "periodEnd": end, "partnerIds": ["ptn-chargezone"]})
    assert first.status_code == 201
    same_period = fin.post("/settlements/run", {"periodStart": start, "periodEnd": end, "partnerIds": ["ptn-chargezone"]}).json()
    assert same_period["created"] == [] and "already exists" in same_period["skipped"][0]["reason"]
    # an overlapping but different period must not pick up sessions that are already settled
    start2, _ = day_range(59, 0)
    overlap = fin.post("/settlements/run", {"periodStart": start2, "periodEnd": end, "partnerIds": ["ptn-chargezone"]}).json()
    assert overlap["created"] == [] and "No settleable" in overlap["skipped"][0]["reason"]
    # the invariant that matters: across *all* settlements, no session is paid out twice
    seen: dict[str, str] = {}
    for doc in store.list("settlements"):
        for session_id in doc["sessionIds"]:
            assert session_id not in seen, f"{session_id} is in both {seen[session_id]} and {doc['id']}"
            seen[session_id] = doc["id"]
    assert seen and all(store.get(SESSIONS, sid)["settlementId"] == stl for sid, stl in seen.items())


def test_run_period_must_be_valid(fin):
    assert fin.post("/settlements/run", {"periodStart": 10, "periodEnd": 5}).status_code == 422


def _fresh_settlement(fin):
    start, end = day_range(60, 0)
    created = fin.post("/settlements/run", {"periodStart": start, "periodEnd": end, "partnerIds": ["ptn-voltpath"]}).json()["created"]
    if created:
        return created[0]
    # seeded runs already consumed the sessions: use an in-review seeded one
    return next(d for d in fin.get("/settlements?status=in_review").json()["items"])


def test_maker_checker_blocks_self_approval_and_adjustments_change_net(client):
    fin, other = Admin(client, "finance"), Admin(client, "super_admin")
    s = _fresh_settlement(fin)
    sid = s["id"]
    before = fin.get(f"/settlements/{sid}").json()["netPayable"]
    adj = fin.post(f"/settlements/{sid}/adjustments", {"label": "Goodwill credit", "amount": -250, "reason": "Agreed on call"}).json()
    assert adj["netPayable"] == r2(before - 250) and adj["adjustments"] == -250
    # `created_by` of seeded runs is dev-finance, so the same person cannot approve
    r = fin.post(f"/settlements/{sid}/approve")
    assert r.status_code == 403 and code(r) == "MAKER_CHECKER"
    assert other.post(f"/settlements/{sid}/approve").json()["status"] == "approved"
    assert code(fin.post(f"/settlements/{sid}/adjustments", {"label": "Late", "amount": 5, "reason": "after approval"})) == "ILLEGAL_STATE"


def test_paying_needs_approval_and_a_real_reference(client):
    fin, other = Admin(client, "finance"), Admin(client, "super_admin")
    sid = _fresh_settlement(fin)["id"]
    assert code(fin.post(f"/settlements/{sid}/paid", {"payoutReference": "UTR2026100999"})) == "ILLEGAL_STATE"  # not approved yet
    other.post(f"/settlements/{sid}/approve")
    assert fin.post(f"/settlements/{sid}/paid", {"payoutReference": "123456789012"}).status_code == 422  # looks like an account no.
    paid = fin.post(f"/settlements/{sid}/paid", {"payoutReference": "UTR2026100999"}).json()
    assert paid["status"] == "paid" and paid["payoutReference"] == "UTR2026100999"
    assert [e["action"] for e in paid["audit"]][0] == "settlement.paid"


def test_hold_and_release(client):
    fin = Admin(client, "finance")
    sid = _fresh_settlement(fin)["id"]
    assert fin.post(f"/settlements/{sid}/hold", {"reason": "Dispute with partner"}).json()["status"] == "on_hold"
    assert fin.post(f"/settlements/{sid}/hold", {"reason": "Resolved"}).json()["status"] == "in_review"


def test_seeded_settlements_reconcile_with_sessions(fin, store):
    for d in fin.get("/settlements?limit=100").json()["items"]:
        full = fin.get(f"/settlements/{d['id']}").json()
        assert abs(full["netPayable"] - r2(full["grossValue"] - full["refunds"] - full["fee"] - full["taxes"] + full["adjustments"])) < 0.01
        assert full["sessionCount"] == len(full["sessionIds"])
