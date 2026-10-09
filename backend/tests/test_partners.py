from app.domain.validators import gstin_check_digit

from .conftest import code


def partner_body(**over):
    body = {
        "legalName": "Volt Harbour Pvt Ltd", "contactName": "Anil Rao", "phone": "98765 43210", "email": "anil@example.com",
        "pan": "abcde1234f", "gstin": None, "payoutReference": "vendor_voltharbour_1", "commercialModel": "revenue_share",
        "commissionPercent": 11, "integrationMethod": "api",
    }
    body.update(over)
    return body


def gstin_for(pan: str) -> str:
    body = f"07{pan}1Z"
    return body + gstin_check_digit(body)


def test_create_normalises_and_starts_as_draft(ops):
    r = ops.post("/partners", partner_body())
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["status"] == "draft" and p["pan"] == "ABCDE1234F" and p["phone"] == "+919876543210"
    assert p["stationCount"] == 0 and p["payoutReferenceMasked"] == "••••ur_1"
    assert ops.get("/audit?action=partner.create").json()["items"][0]["entityId"] == p["id"]


def test_validation_messages_are_field_level(ops):
    r = ops.post("/partners", partner_body(pan="nope", phone="12"))
    d = r.json()["detail"]
    assert r.status_code == 422 and {"pan", "phone"} <= set(d["fields"])


def test_gstin_must_have_a_valid_check_digit_and_contain_the_pan(ops):
    ok = ops.post("/partners", partner_body(gstin=gstin_for("ABCDE1234F")))
    assert ok.status_code == 201
    bad = ops.post("/partners", partner_body(pan="ABCDE1234G", legalName="Other Co", gstin=gstin_for("ABCDE1234F")))
    assert bad.status_code == 422 and "PAN" in bad.json()["detail"]["message"]


def test_raw_bank_account_numbers_are_refused(ops):
    r = ops.post("/partners", partner_body(payoutReference="123456789012"))
    assert r.status_code == 422 and "account number" in r.json()["detail"]["message"]


def test_duplicate_pan_is_a_conflict(ops):
    assert ops.post("/partners", partner_body()).status_code == 201
    r = ops.post("/partners", partner_body(legalName="Same PAN Again"))
    assert r.status_code == 409 and code(r) == "DUPLICATE_PARTNER"


def test_revenue_share_needs_a_commission(ops):
    r = ops.post("/partners", partner_body(commissionPercent=None))
    assert r.status_code == 422


def test_full_review_workflow_and_illegal_moves(ops):
    pid = ops.post("/partners", partner_body()).json()["id"]
    assert code(ops.post(f"/partners/{pid}/transition", {"to": "active"})) == "ILLEGAL_TRANSITION"  # cannot skip review
    assert ops.post(f"/partners/{pid}/transition", {"to": "pending_review"}).json()["status"] == "pending_review"
    r = ops.post(f"/partners/{pid}/transition", {"to": "active"})
    assert r.status_code == 422 and code(r) == "PAN_NOT_VERIFIED"  # must confirm the PAN check
    r = ops.post(f"/partners/{pid}/transition", {"to": "active", "panVerified": True})
    assert r.json()["status"] == "active" and r.json()["verification"]["reviewedBy"] == "dev-ops"
    assert code(ops.post(f"/partners/{pid}/transition", {"to": "suspended"})) == "REASON_REQUIRED"
    assert ops.post(f"/partners/{pid}/transition", {"to": "suspended", "reason": "Failed site audit"}).json()["status"] == "suspended"
    actions = [e["action"] for e in ops.get(f"/audit?entityId={pid}").json()["items"]]
    assert {"partner.submit", "partner.approve", "partner.suspend", "partner.create"} <= set(actions)


def test_suspending_a_partner_hides_its_stations_from_the_app(ops, store):
    live = [s for s in store.list("stations") if s["partnerId"] == "ptn-chargezone" and s["visibleInApp"]]
    assert live
    ops.post("/partners/ptn-chargezone/transition", {"to": "suspended", "reason": "Safety incident"})
    assert not any(s["visibleInApp"] for s in store.list("stations") if s["partnerId"] == "ptn-chargezone")
    ops.post("/partners/ptn-chargezone/transition", {"to": "active"})
    assert all(s["visibleInApp"] for s in store.list("stations") if s["partnerId"] == "ptn-chargezone" and s["publication"] == "live")


def test_concurrent_edits_conflict_instead_of_overwriting(ops):
    p = ops.get("/partners/ptn-statiq").json()
    body = {k: p[k] for k in ("legalName", "displayName", "contactName", "phone", "email", "pan", "gstin", "payoutReference",
                              "commercialModel", "commissionPercent", "flatFeePerKwh", "commissionPlanId", "integrationMethod", "notes")}
    assert ops.put("/partners/ptn-statiq", {**body, "contactName": "New Person", "expectedVersion": p["version"]}).status_code == 200
    stale = ops.put("/partners/ptn-statiq", {**body, "contactName": "Other Person", "expectedVersion": p["version"]})
    assert stale.status_code == 409 and code(stale) == "STALE_VERSION"


def test_reviewing_needs_the_review_permission(client):
    from .conftest import Admin
    fin = Admin(client, "finance")
    assert fin.post("/partners/ptn-greengrid/transition", {"to": "active", "panVerified": True}).status_code == 403


def test_tax_identifiers_are_masked_for_roles_that_neither_maintain_nor_pay_partners(ops, fin, sup):
    support = sup
    pid = ops.post("/partners", partner_body(gstin=gstin_for("ABCDE1234F"))).json()["id"]

    full = ops.get(f"/partners/{pid}").json()
    assert full["taxIdsMasked"] is False and full["pan"] == "ABCDE1234F" and full["payoutReference"] == "vendor_voltharbour_1"
    assert fin.get(f"/partners/{pid}").json()["pan"] == "ABCDE1234F"  # Finance pays partners, so it may see them

    seen = support.get(f"/partners/{pid}").json()
    assert seen["taxIdsMasked"] is True
    assert seen["pan"] == "••••234F" and seen["gstin"].startswith("••••") and seen["payoutReference"] is None
    assert seen["email"] == "anil@example.com"  # contact details stay visible: support needs to reach the partner
    row = next(p for p in support.get("/partners").json()["items"] if p["id"] == pid)
    assert row["pan"] == "••••234F" and row["taxIdsMasked"] is True
