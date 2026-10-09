from .conftest import code

NEEMRANA = "st-chargezone-neemrana"


def station_body(**over):
    body = {"name": "ChargeZone Test Plaza", "partnerId": "ptn-chargezone", "address": "NH-48, Test Road", "city": "Neemrana",
            "state": "Rajasthan", "latitude": 27.99, "longitude": 76.39, "hours": "24x7", "amenities": ["cafe", "cafe", "parking"],
            "sessionMode": "integrated", "integrationMethod": "api", "verification": "unverified"}
    body.update(over)
    return body


def test_derived_status_and_confidence_for_the_reference_station(ops):
    s = ops.get(f"/stations/{NEEMRANA}").json()
    assert s["counts"]["available"] == 2 and s["counts"]["occupied"] == 1 and s["counts"]["offline"] == 1
    assert s["confidence"] == "live" and s["appTrust"] == "live" and not s["stale"]
    assert s["lastUpdatedAt"] is not None


def test_a_silent_feed_is_never_reported_as_live(ops):
    s = ops.get("/stations/st-tata-power-jaipur-hub").json()
    assert s["confidence"] == "estimated" and s["appTrust"] == "estimated" and s["stale"]
    c = s["connectors"][0]["effective"]
    assert c["confidence"] != "live" and c["appTrust"] != "live"


def test_manual_status_is_labelled_manual_and_shown_to_the_app_as_user_confirmed(ops):
    s = ops.get("/stations/st-local-cpo-sector-18-noida").json()
    assert s["confidence"] == "manual" and s["appTrust"] == "user"


def test_filters(ops):
    names = lambda q: {s["id"] for s in ops.get(f"/stations?{q}&limit=100").json()["items"]}  # noqa: E731
    assert NEEMRANA in names("status=live") and "st-tata-power-jaipur-hub" not in names("status=live")
    assert names("status=offline") == {"st-tata-power-jaipur-hub"}
    assert "st-tata-power-jaipur-hub" in names("status=stale")
    assert "st-statiq-highway-hub-gurgaon" in names("status=needs_review")
    assert names("publication=draft") == {"st-greengrid-pune-hinjewadi", "st-voltpath-alwar-bypass"}
    assert names("q=neemrana") == {NEEMRANA}


def test_new_stations_start_as_drafts_hidden_from_the_app(ops):
    r = ops.post("/stations", station_body())
    assert r.status_code == 201
    s = r.json()
    assert s["publication"] == "draft" and s["visibleInApp"] is False and s["amenities"] == ["cafe", "parking"]
    assert s["readiness"]["ready"] is False


def test_go_live_is_blocked_until_the_checklist_passes(ops):
    sid = ops.post("/stations", station_body()).json()["id"]
    r = ops.post(f"/stations/{sid}/publish")
    assert r.status_code == 409 and code(r) == "NOT_READY"
    failing = set(r.json()["detail"]["failing"])
    assert "Every connector has a price" in failing or "At least one connector" in failing
    assert "Location and details verified" in failing


def test_a_complete_station_can_go_live_and_then_be_hidden(ops, store):
    r = ops.post("/stations/st-voltpath-alwar-bypass/publish")
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["publication"] == "live" and s["visibleInApp"] is True
    assert ops.post("/stations/st-voltpath-alwar-bypass/hide", {"reason": "  "}).status_code == 422
    h = ops.post("/stations/st-voltpath-alwar-bypass/hide", {"reason": "Charger removed for upgrade"}).json()
    assert h["publication"] == "hidden" and h["visibleInApp"] is False
    assert [e["action"] for e in ops.get("/audit?entityId=st-voltpath-alwar-bypass").json()["items"]][:2] == ["station.hide", "station.publish"]


def test_a_partner_that_is_not_active_blocks_go_live(ops):
    r = ops.post("/stations/st-greengrid-pune-hinjewadi/publish")
    assert r.status_code == 409
    checks = {c["id"]: c for c in r.json()["detail"]["checks"]}
    assert checks["partner_active"]["ok"] is False and checks["connectors"]["ok"] is False


def test_integrated_stations_cannot_be_manual(ops):
    body = station_body(integrationMethod="manual")
    sid = ops.post("/stations", body).json()["id"]
    check = {c["id"]: c for c in ops.get(f"/stations/{sid}").json()["readiness"]["checks"]}
    assert check["integration"]["ok"] is False


def test_external_station_needs_operator_instructions(ops):
    r = ops.post("/stations", station_body(sessionMode="external", integrationMethod="manual"))
    assert r.status_code == 422 and "instructions" in r.json()["detail"]["message"]


def test_editing_a_live_station_cannot_break_it(ops):
    s = ops.get(f"/stations/{NEEMRANA}").json()
    body = {k: s[k] for k in ("name", "partnerId", "address", "city", "state", "latitude", "longitude", "hours", "accessInstructions",
                              "photos", "amenities", "parkingInfo", "sessionMode", "integrationMethod", "operatorInstructions", "verification")}
    r = ops.put(f"/stations/{NEEMRANA}", {**body, "verification": "unverified", "expectedVersion": s["version"]})
    assert r.status_code == 409 and code(r) == "WOULD_BREAK_LIVE_STATION"


def test_marking_a_station_maintenance_overrides_every_connector_and_is_manual(ops):
    r = ops.post(f"/stations/{NEEMRANA}/status", {"status": "maintenance", "reason": "Planned panel upgrade", "expiresInMinutes": 120})
    s = r.json()
    assert s["status"] == "maintenance" and s["confidence"] == "manual"
    assert all(c["effective"]["overridden"] for c in s["connectors"])
    cleared = ops.delete(f"/stations/{NEEMRANA}/status").json()
    assert cleared["status"] == "available" and cleared["confidence"] == "live"


def test_connector_override_requires_a_reason_and_clears(ops):
    cid = f"{NEEMRANA}-c1"
    assert ops.post(f"/connectors/{cid}/override", {"status": "offline"}).status_code == 422
    c = ops.post(f"/connectors/{cid}/override", {"status": "offline", "reason": "Cable damaged"}).json()
    assert c["effective"]["status"] == "offline" and c["effective"]["confidence"] == "manual"
    assert ops.delete(f"/connectors/{cid}/override").json()["effective"]["confidence"] == "live"
    assert code(ops.delete(f"/connectors/{cid}/override")) == "NO_OVERRIDE"


def test_connector_crud_and_qr_code_matches_the_mobile_format(ops):
    r = ops.post(f"/stations/{NEEMRANA}/connectors", {"evseId": "EVSE-009", "label": "C9", "chargerId": "CZ-NMR-09",
                                                      "type": "CCS2", "powerKw": 120, "integrationMode": "api"})
    assert r.status_code == 201
    c = r.json()
    assert c["id"] == f"{NEEMRANA}-c9" and c["qrCode"] == "CHARGEZONE-NEEMRANA-C9"  # mobile: chargerCode()
    assert code(ops.post(f"/stations/{NEEMRANA}/connectors", {"evseId": "EVSE-010", "label": "c9", "chargerId": "X1",
                                                              "type": "CCS2", "powerKw": 60})) == "DUPLICATE_CONNECTOR"
    assert ops.delete(f"/connectors/{c['id']}").status_code == 204
    assert code(ops.delete(f"/connectors/{NEEMRANA}-c1")) == "HAS_SESSIONS"


def test_map_rows_filter_and_carry_pin_data(ops):
    rows = ops.get("/map/stations?status=all").json()["items"]
    assert all({"latitude", "longitude", "status", "counts", "connectors", "reliabilityPct"} <= set(r) for r in rows)
    only_dc = ops.get("/map/stations?minPowerKw=100").json()["items"]
    assert only_dc and all(r["maxPowerKw"] >= 100 for r in only_dc)
    assert {r["partnerId"] for r in ops.get("/map/stations?partnerId=ptn-statiq").json()["items"]} == {"ptn-statiq"}
