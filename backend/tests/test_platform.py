import copy

from .conftest import code


def cfg_body(sa, **changes):
    cfg = sa.get("/config").json()
    body = {k: copy.deepcopy(cfg[k]) for k in ("liveMaxAgeSec", "staleAfterSec", "minRouteBatteryReservePct", "adminIdleTimeoutMinutes",
                                               "platformFeeGstPercent", "settlementMakerChecker", "rankingWeights", "featureFlags", "commissionPlans")}
    body.update(changes)
    body["expectedVersion"] = cfg["version"]
    return body


def test_defaults_mirror_the_mobile_app(sa):
    c = sa.get("/config").json()
    assert c["liveMaxAgeSec"] == 300 and c["staleAfterSec"] == 1800 and c["minRouteBatteryReservePct"] == 12
    assert c["rankingWeights"]["plan_trip"]["reliability"] == 22 and "price" not in c["rankingWeights"]["battery_critical"]
    assert "sponsored" not in str(c["rankingWeights"])


def test_price_can_never_enter_battery_critical_ranking(sa):
    w = sa.get("/config").json()["rankingWeights"]
    w["battery_critical"]["price"] = 5
    r = sa.put("/config", cfg_body(sa, rankingWeights=w))
    assert r.status_code == 422 and "Price" in r.json()["detail"]["message"]


def test_sponsorship_is_not_a_ranking_factor(sa):
    w = sa.get("/config").json()["rankingWeights"]
    w["plan_trip"]["sponsored"] = 10
    assert sa.put("/config", cfg_body(sa, rankingWeights=w)).status_code == 422


def test_stale_window_must_exceed_live_window_and_flags_must_exist(sa):
    assert sa.put("/config", cfg_body(sa, liveMaxAgeSec=600, staleAfterSec=300)).status_code == 422
    flags = sa.get("/config").json()["featureFlags"] | {"time_machine": True}
    assert sa.put("/config", cfg_body(sa, featureFlags=flags)).status_code == 422


def test_changing_the_live_window_changes_what_counts_as_live(sa, ops):
    assert ops.get("/stations/st-chargezone-neemrana").json()["confidence"] == "live"
    sa.put("/config", cfg_body(sa, liveMaxAgeSec=10, staleAfterSec=60))  # feeds here are 30-100 s old
    assert ops.get("/stations/st-chargezone-neemrana").json()["confidence"] == "estimated"


def test_config_edits_are_versioned_and_audited(sa):
    c = sa.get("/config").json()
    assert sa.put("/config", cfg_body(sa, minRouteBatteryReservePct=15)).json()["version"] == c["version"] + 1
    stale = sa.put("/config", {**cfg_body(sa, minRouteBatteryReservePct=20), "expectedVersion": c["version"]})
    assert stale.status_code == 409 and code(stale) == "STALE_VERSION"


def test_operations_can_read_but_not_change_settings(ops):
    assert ops.get("/config").status_code == 200
    assert ops.put("/config", {}).status_code == 403


# ---------------------------------------------------------------------- admins ------
def test_roles_catalog_is_served_to_every_admin(sup):
    roles = {r["role"]: r for r in sup.get("/roles").json()}
    assert set(roles) == {"super_admin", "operations", "finance", "support"} and "refunds:issue" in roles["finance"]["permissions"]


def test_invite_change_role_and_guards(sa):
    inv = sa.post("/admins", {"email": "new.person@plugorbit.demo", "name": "New Person", "role": "support"})
    assert inv.status_code == 201 and inv.json()["status"] == "invited"
    assert code(sa.post("/admins", {"email": "NEW.person@plugorbit.demo", "name": "Dup Person", "role": "support"})) == "ALREADY_ADMIN"
    aid = inv.json()["id"]
    assert code(sa.patch(f"/admins/{aid}", {"role": "finance"})) == "REASON_REQUIRED"
    assert sa.patch(f"/admins/{aid}", {"role": "finance", "reason": "Joined the finance team"}).json()["role"] == "finance"
    assert sa.get("/audit?action=admin.role_change").json()["items"][0]["after"] == {"role": "finance"}


def test_the_last_super_admin_cannot_be_removed_and_you_cannot_demote_yourself(sa):
    r = sa.patch("/admins/dev-super", {"role": "operations", "reason": "oops, mistake"})
    assert r.status_code == 409 and code(r) in ("LAST_SUPER_ADMIN", "SELF_CHANGE")
    sa.post("/admins", {"email": "second.super@plugorbit.demo", "name": "Second Super", "role": "super_admin"})
    r = sa.patch("/admins/dev-super", {"status": "disabled", "reason": "testing safeguards"})
    assert code(r) == "SELF_CHANGE"


def test_only_super_admin_manages_roles(ops, fin):
    assert ops.get("/admins").status_code == 403 and fin.post("/admins", {"email": "a@b.co", "name": "Ab", "role": "support"}).status_code == 403


# ------------------------------------------------------------------- the rest -------
def test_integrations_are_honest_about_what_is_wired(sa):
    items = {i["key"]: i for i in sa.get("/integrations").json()["items"]}
    assert items["pay_gateway"]["mode"] == "simulated" and items["maps_sdk"]["mode"] == "client"
    assert items["msg_sms"]["connection"] == "not_configured" and items["later_oem"]["connection"] == "later"
    assert items["net_api"]["mode"] == "derived" and items["net_api"]["health"] in ("healthy", "degraded", "down")
    assert "secrets" not in str(items).lower().replace("secretnames", "")


def test_integration_settings_reject_secrets(sa):
    r = sa.patch("/integrations/pay_gateway", {"settings": {"api_key": "not-a-real-secret"}})
    assert r.status_code == 422 and "Secret Manager" in r.json()["detail"]["message"]
    ok = sa.patch("/integrations/msg_sms", {"settings": {"senderId": "PLGORB"}, "notes": "DLT pending"})
    assert ok.status_code == 200 and ok.json()["settings"] == {"senderId": "PLGORB"}


def test_integration_test_probe_is_audited(sa):
    r = sa.post("/integrations/mon_backend/test").json()
    assert r["ok"] is True and r["mode"] == "live"
    assert sa.get("/audit?action=integration.test").json()["items"][0]["entityId"] == "mon_backend"
    assert sa.post("/integrations/nope/test").status_code == 404


def test_charger_health_severity_rules(ops):
    rows = ops.get("/health/chargers?limit=200").json()["items"]
    jaipur = [r for r in rows if r["stationId"] == "st-tata-power-jaipur-hub"]
    assert jaipur and all(r["severity"] == "critical" for r in jaipur)
    assert any("Heartbeat silent" in " ".join(r["reasons"]) for r in jaipur)
    manesar_c2 = next(r for r in rows if r["connectorId"] == "st-chargezone-manesar-c2")
    assert manesar_c2["severity"] in ("warning", "critical") and manesar_c2["faultRatePct"]
    healthy = next(r for r in rows if r["connectorId"] == "st-chargezone-neemrana-c1")
    assert healthy["severity"] == "healthy" and healthy["reasons"] == []
    assert all(r["stationId"] != "st-voltpath-alwar-bypass" for r in rows)  # draft stations have no feed to judge
    assert ops.get("/health/chargers?severity=critical").json()["total"] >= 8


def test_overview_answers_what_needs_attention(sa):
    o = sa.get("/overview").json()
    assert o["kpis"]["liveStations"] == 15 and o["kpis"]["sessions7d"] > 0
    assert o["attention"] and o["attention"][0]["severity"] == "critical" and all(a["href"].startswith("/") for a in o["attention"])
    assert len(o["trend"]) == 7 and o["recentActivity"]


def test_analytics_reports_unavailable_metrics_instead_of_inventing_them(sa):
    a = sa.get("/analytics/summary?range=30d").json()
    ids = {u["id"] for u in a["unavailable"]}
    assert {"search_to_station", "nav_to_session", "avg_wait", "route_repeat"} <= ids
    assert a["kpis"]["gmv"] > 0 and len(a["series"]) == 30 and a["kpis"]["activeUsers"] > 0
    assert sa.get("/analytics/summary?range=1y").status_code == 422


def test_notifications_are_operational_only_and_delivery_is_honest(ops):
    page = ops.get("/notifications").json()
    assert page["marketing"]["enabled"] is False
    r = ops.post("/notifications", {"kind": "charger_outage", "title": "Station offline", "body": "Please use another station.",
                                    "channels": ["in_app", "push"], "stationId": "st-tata-power-jaipur-hub"})
    assert r.status_code == 201 and "not connected" in r.json()["deliveryNote"]
    nid = r.json()["id"]
    assert ops.post(f"/notifications/{nid}/publish").json()["status"] == "published"
    assert code(ops.post(f"/notifications/{nid}/publish")) == "NOT_EDITABLE"
    assert ops.post("/notifications", {"kind": "charger_outage", "title": "No station named", "body": "Body text"}).status_code == 422
    assert ops.post("/notifications", {"kind": "promotion", "title": "Big sale now", "body": "Body text"}).status_code == 422
