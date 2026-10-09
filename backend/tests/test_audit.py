from app.domain.redact import redact


def test_seeded_history_verifies(sa):
    r = sa.get("/audit/verify").json()
    assert r["ok"] is True and r["checked"] > 50 and r["headHash"]


def test_tampering_with_an_entry_is_detected(sa, store):
    entries = store.list("audit")
    victim = sorted(entries, key=lambda e: e["seq"])[10]
    store.update("audit", victim["id"], {"after": {"pricePerKwh": 1}})  # a rogue edit
    r = sa.get("/audit/verify").json()
    assert r["ok"] is False and r["firstBadSeq"] == victim["seq"]


def test_deleting_an_entry_is_detected(sa, store):
    victim = sorted(store.list("audit"), key=lambda e: e["seq"])[20]
    store.delete("audit", victim["id"])
    r = sa.get("/audit/verify").json()
    assert r["ok"] is False and r["firstBadSeq"] == victim["seq"]


def test_there_is_no_way_to_edit_or_delete_audit_through_the_api(sa):
    for method in ("put", "patch", "delete"):
        r = getattr(sa, method)("/audit/1")
        assert r.status_code in (404, 405)


def test_sensitive_changes_write_before_and_after_with_actor(sa):
    sa.put("/config", _config_with(sa, minRouteBatteryReservePct=15, reason="Safer default for highway trips"))
    entry = sa.get("/audit?action=config.update").json()["items"][0]
    assert entry["actor"]["role"] == "super_admin" and entry["reason"] == "Safer default for highway trips"
    assert entry["before"]["minRouteBatteryReservePct"] == 12 and entry["after"]["minRouteBatteryReservePct"] == 15
    assert entry["prevHash"] and entry["hash"] and entry["source"] == "admin-web"


def test_snapshots_never_contain_secrets():
    snap = redact({"name": "x", "apiKey": "abc", "nested": {"password": "p", "ok": 1}, "payoutReference": "UTR1234"})
    assert snap["apiKey"] == "[redacted]" and snap["nested"]["password"] == "[redacted]"
    assert snap["payoutReference"] == "UTR1234" and snap["nested"]["ok"] == 1


def test_filters(sa):
    items = sa.get("/audit?category=pricing&limit=5").json()["items"]
    assert items and all(i["category"] == "pricing" for i in items)
    assert sa.get("/audit?q=refund").json()["total"] > 0


def _config_with(sa, **changes):
    cfg = sa.get("/config").json()
    body = {k: cfg[k] for k in ("liveMaxAgeSec", "staleAfterSec", "minRouteBatteryReservePct", "adminIdleTimeoutMinutes",
                                "platformFeeGstPercent", "settlementMakerChecker", "rankingWeights", "featureFlags",
                                "commissionPlans")}
    body.update(changes, expectedVersion=cfg["version"])
    return body
