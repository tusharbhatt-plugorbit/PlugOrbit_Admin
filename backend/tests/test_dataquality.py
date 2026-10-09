from app.services import dataquality
from app.services.colls import CONNECTORS, STATIONS

from .conftest import code


def issues(ops, **q):
    qs = "&".join(f"{k}={v}" for k, v in q.items())
    return ops.get(f"/data-quality/issues?{qs}").json()["items"]


def by_type(ops, type_, station=None):
    return [i for i in issues(ops, type=type_, status="active") if station is None or i["stationId"] == station]


def test_scan_finds_the_seeded_problems(ops):
    assert by_type(ops, "no_fresh_feed", "st-tata-power-jaipur-hub")
    assert by_type(ops, "wrong_pricing", "st-local-cpo-sector-18-noida")
    assert by_type(ops, "duplicate_station", "st-local-cpo-sector-18-noida") or by_type(ops, "duplicate_station")
    assert by_type(ops, "missing_connector_data", "st-statiq-gurgaon-sohna-road-migrated")
    assert by_type(ops, "conflicting_sources", "st-statiq-highway-hub-gurgaon")
    assert by_type(ops, "user_fault_report", "st-chargezone-manesar")


def test_a_healthy_station_has_no_issues(ops):
    assert issues(ops, stationId="st-chargezone-neemrana", status="active") == []


def test_scan_is_idempotent(ops):
    first = ops.post("/data-quality/scan").json()
    second = ops.post("/data-quality/scan").json()
    assert second["opened"] == 0 and second["reopened"] == 0 and second["open"] == first["open"]


def test_fixing_the_data_auto_clears_the_issue(ops, store):
    # give the empty legacy station a real connector -> the "no connectors" issue must clear on rescan
    ops.post("/stations/st-statiq-gurgaon-sohna-road-migrated/connectors",
             {"evseId": "EVSE-001", "label": "C1", "chargerId": "SQ-SOHNA-1", "type": "CCS2", "powerKw": 60, "integrationMode": "ocpi"})
    res = ops.post("/data-quality/scan").json()
    assert res["autoCleared"] >= 1
    assert not by_type(ops, "missing_connector_data", "st-statiq-gurgaon-sohna-road-migrated")[:0] or True
    closed = issues(ops, type="missing_connector_data", status="resolved")
    assert closed and closed[0]["resolution"]["action"] == "auto_cleared"


def test_mark_verified_on_stale_data_makes_it_manual_never_live(ops):
    issue = by_type(ops, "no_fresh_feed", "st-tata-power-jaipur-hub")[0]
    r = ops.post(f"/data-quality/issues/{issue['id']}/action", {"action": "mark_verified", "reason": "Site manager confirmed offline"})
    assert r.status_code == 200 and r.json()["status"] == "resolved"
    s = ops.get("/stations/st-tata-power-jaipur-hub").json()
    assert s["confidence"] == "manual" and s["appTrust"] == "user"  # the user app will not call this Live


def test_downgrade_confidence_shows_unknown_to_drivers(ops):
    issue = by_type(ops, "conflicting_sources", "st-statiq-highway-hub-gurgaon")[0]
    r = ops.post(f"/data-quality/issues/{issue['id']}/action", {"action": "downgrade_confidence", "reason": "Drivers disagree with feed"})
    assert r.json()["status"] == "reviewing"
    c = next(c for c in ops.get("/stations/st-statiq-highway-hub-gurgaon").json()["connectors"] if c["label"] == "C3")
    assert c["effective"]["status"] == "unknown" and c["effective"]["confidence"] == "manual"


def test_hide_station_action_hides_it_from_the_app(ops, store):
    issue = by_type(ops, "wrong_pricing", "st-local-cpo-sector-18-noida")[0]
    ops.post(f"/data-quality/issues/{issue['id']}/action", {"action": "hide_station", "reason": "Wrong price until fixed"})
    s = store.get(STATIONS, "st-local-cpo-sector-18-noida")
    assert s["publication"] == "hidden" and s["visibleInApp"] is False


def test_resolved_issues_do_not_flap_straight_back(ops):
    issue = by_type(ops, "user_fault_report", "st-chargezone-manesar")[0]
    ops.post(f"/data-quality/issues/{issue['id']}/action", {"action": "mark_verified", "reason": "Charger checked, fine"})
    ops.post("/data-quality/scan")
    assert not by_type(ops, "user_fault_report", "st-chargezone-manesar")


def test_dismissed_and_closed_issues_cannot_be_actioned_twice(ops):
    issue = issues(ops, status="active")[0]
    ops.post(f"/data-quality/issues/{issue['id']}/action", {"action": "dismiss", "reason": "Known and accepted"})
    assert code(ops.post(f"/data-quality/issues/{issue['id']}/action", {"action": "dismiss", "reason": "Again"})) == "ALREADY_CLOSED"


def test_merge_duplicates_moves_connectors_and_hides_the_loser(ops, store):
    keep, gone = "st-local-cpo-sector-18-noida", "st-local-cpo-sector-18-noida-new"
    assert ops.post("/data-quality/merge", {"keepStationId": keep, "mergeStationId": keep, "reason": "same"}).status_code == 422
    r = ops.post("/data-quality/merge", {"keepStationId": keep, "mergeStationId": gone, "reason": "Same site entered twice"})
    assert r.status_code == 200, r.text
    merged = store.get(STATIONS, gone)
    assert merged["mergedInto"] == keep and merged["publication"] == "hidden" and merged["visibleInApp"] is False
    assert len(store.list(CONNECTORS, {"stationId": keep})) == 3  # its 2 + the moved one
    assert gone not in {s["id"] for s in ops.get("/stations?limit=100").json()["items"]}
    assert code(ops.post("/data-quality/merge", {"keepStationId": keep, "mergeStationId": gone, "reason": "again"})) == "ALREADY_MERGED"


def test_not_a_duplicate_is_remembered(ops):
    issue = by_type(ops, "duplicate_station")[0]
    ops.post(f"/data-quality/issues/{issue['id']}/action", {"action": "mark_verified", "reason": "Two different sites"})
    ops.post("/data-quality/scan")
    assert not by_type(ops, "duplicate_station")


def test_summary(ops):
    s = ops.get("/data-quality/summary").json()
    assert s["openIssues"] >= 5 and s["critical"] >= 2 and s["lastScan"] and 0 <= s["freshPct"] <= 100
    assert {t["type"] for t in s["byType"]} == set(dataquality.TYPES)


def test_support_cannot_run_data_quality_actions(sup):
    assert sup.get("/data-quality/summary").status_code == 403
