import time

from .conftest import code

NEEMRANA = "st-chargezone-neemrana"
C1 = f"{NEEMRANA}-c1"


def price(**over):
    body = {"connectorId": C1, "pricePerKwh": 20.0, "pricePerMin": 0, "pricePerSession": 0, "parkingFeePerHour": 0,
            "idleFeePerMin": 2, "gstPercent": 18, "reason": "Align with network average"}
    body.update(over)
    return body


def current(ops, connector=C1):
    return ops.get(f"/stations/{NEEMRANA}/tariffs").json()["current"][connector]


def test_a_price_change_adds_a_version_and_never_overwrites(ops):
    before = ops.get(f"/stations/{NEEMRANA}/tariffs").json()
    old = current(ops)
    r = ops.post(f"/stations/{NEEMRANA}/tariffs", price(pricePerKwh=old["pricePerKwh"] + 1))
    assert r.status_code == 201, r.text
    after = ops.get(f"/stations/{NEEMRANA}/tariffs").json()
    assert len(after["items"]) == len(before["items"]) + 1
    new = r.json()
    assert new["previous"]["pricePerKwh"] == old["pricePerKwh"]  # previous value recorded
    assert new["createdBy"] == "dev-ops" and new["createdByName"] and new["createdAt"]  # actor + timestamp
    states = {t["id"]: t["state"] for t in after["items"]}
    assert states[new["id"]] == "active" and states[old["tariffId"]] == "superseded"
    assert any(t["id"] == old["tariffId"] for t in after["items"])  # history intact


def test_price_changes_are_audited_with_before_and_after(ops):
    old = current(ops)["pricePerKwh"]
    ops.post(f"/stations/{NEEMRANA}/tariffs", price(pricePerKwh=old + 2, reason="Peak pricing"))
    e = ops.get("/audit?action=tariff.create").json()["items"][0]
    assert e["before"]["pricePerKwh"] == old and e["after"]["pricePerKwh"] == old + 2 and e["reason"] == "Peak pricing"
    assert e["actor"]["uid"] == "dev-ops"


def test_a_reason_is_required(ops):
    assert ops.post(f"/stations/{NEEMRANA}/tariffs", price(reason="")).status_code == 422


def test_prices_cannot_start_in_the_past(ops):
    r = ops.post(f"/stations/{NEEMRANA}/tariffs", price(effectiveFrom=int(time.time() * 1000) - 3_600_000))
    assert r.status_code == 422 and code(r) == "PRICE_IN_PAST"


def test_large_moves_need_explicit_confirmation(ops):
    old = current(ops)["pricePerKwh"]
    r = ops.post(f"/stations/{NEEMRANA}/tariffs", price(pricePerKwh=old * 2))
    assert r.status_code == 409 and code(r) == "LARGE_PRICE_CHANGE"
    assert ops.post(f"/stations/{NEEMRANA}/tariffs", price(pricePerKwh=old * 2, confirmLargeChange=True)).status_code == 201


def test_future_prices_are_scheduled_and_can_be_cancelled(ops):
    old = current(ops)
    at = int(time.time() * 1000) + 86_400_000
    t = ops.post(f"/stations/{NEEMRANA}/tariffs", price(pricePerKwh=old["pricePerKwh"] + 1, effectiveFrom=at)).json()
    assert current(ops)["tariffId"] == old["tariffId"]  # not in force yet
    hist = {x["id"]: x["state"] for x in ops.get(f"/stations/{NEEMRANA}/tariffs").json()["items"]}
    assert hist[t["id"]] == "scheduled"
    assert ops.post(f"/tariffs/{t['id']}/cancel", {"reason": "Entered by mistake"}).json()["status"] == "cancelled"
    assert code(ops.post(f"/tariffs/{old['tariffId']}/cancel", {"reason": "Not allowed"})) == "NOT_SCHEDULED"  # in force: immutable


def test_station_wide_price_applies_to_connectors_without_their_own(ops):
    sid = "st-voltpath-alwar-bypass"
    r = ops.post(f"/stations/{sid}/tariffs", price(connectorId=None, pricePerKwh=25))
    assert r.status_code == 201
    cur = ops.get(f"/stations/{sid}/tariffs").json()
    assert cur["stationWide"]["pricePerKwh"] == 25
    assert all(v["pricePerKwh"] == 25 for v in cur["current"].values())  # newest effective wins


def test_finance_can_read_but_not_change_prices(client):
    from .conftest import Admin
    fin = Admin(client, "finance")
    assert fin.get(f"/stations/{NEEMRANA}/tariffs").status_code == 200
    assert fin.post(f"/stations/{NEEMRANA}/tariffs", price()).status_code == 403
