"""Pure rules: no HTTP, no store."""
import pytest

from app.domain import validators as v
from app.domain.money import r2, session_amount
from app.domain.redact import mask_email, mask_phone, mask_ref
from app.domain.status import derive_station, resolve_connector
from app.domain.trust import DEFAULT_LIVE_MAX_AGE_MS, DEFAULT_STALE_AFTER_MS, data_trust, is_stale, to_app_trust

NOW = 1_800_000_000_000
LIVE, STALE = DEFAULT_LIVE_MAX_AGE_MS, DEFAULT_STALE_AFTER_MS


# --- trust: the same rules as the mobile app's domain/trust.ts ------------------------
def test_only_a_fresh_operator_feed_is_live():
    assert data_trust("operator_feed", NOW - 10_000, NOW) == "live"
    assert data_trust("operator_feed", NOW - LIVE - 1, NOW) == "estimated"  # feed went quiet
    assert data_trust("google_places", NOW - 1000, NOW) == "estimated"
    assert data_trust("estimate", NOW - 1000, NOW) == "estimated"
    assert data_trust("user_report", NOW - 1000, NOW) == "user"
    assert data_trust("manual", NOW - 1000, NOW) == "manual"
    assert data_trust("none", NOW, NOW) == "unknown" and data_trust("operator_feed", None, NOW) == "unknown"


def test_the_user_app_can_never_be_told_manual_is_live():
    assert to_app_trust("manual") == "user"
    assert to_app_trust("estimated") == "estimated" and to_app_trust("live") == "live"


def test_staleness_window():
    assert not is_stale(NOW - STALE, NOW) and is_stale(NOW - STALE - 1, NOW) and is_stale(None, NOW)


def _conn(status="available", source="operator_feed", age=5_000, override=None, hb=3_000):
    return {"status": status, "statusSource": source, "statusUpdatedAt": NOW - age, "lastHeartbeatAt": NOW - hb, "override": override}


def test_override_wins_and_is_marked_manual_never_live():
    c = _conn("available", override={"status": "maintenance", "reason": "r", "at": NOW - 1000, "expiresAt": None})
    r = resolve_connector(c, NOW, LIVE, STALE)
    assert r["status"] == "maintenance" and r["confidence"] == "manual" and r["overridden"]


def test_expired_override_falls_back_to_the_feed():
    c = _conn("occupied", override={"status": "offline", "reason": "r", "at": NOW - 5000, "expiresAt": NOW - 1})
    r = resolve_connector(c, NOW, LIVE, STALE)
    assert r["status"] == "occupied" and r["confidence"] == "live" and not r["overridden"]


def test_station_status_and_weakest_link_confidence():
    live = resolve_connector(_conn("occupied"), NOW, LIVE, STALE)
    old = resolve_connector(_conn("available", age=LIVE + 60_000), NOW, LIVE, STALE)
    d = derive_station([live, old])
    assert d["status"] == "available" and d["confidence"] == "estimated"  # one quiet feed downgrades the station
    assert derive_station([])["status"] == "unknown"
    off = resolve_connector(_conn("offline"), NOW, LIVE, STALE)
    assert derive_station([off, off])["status"] == "offline"
    maint = resolve_connector(_conn("maintenance"), NOW, LIVE, STALE)
    assert derive_station([maint, maint])["status"] == "maintenance"


# --- validators -----------------------------------------------------------------------
def test_pan_and_gstin():
    assert v.normalise_pan(" abcde1234f ") == "ABCDE1234F"
    with pytest.raises(ValueError):
        v.normalise_pan("12345ABCDE")
    assert v.normalise_gstin("27AAPFU0939F1ZV") == "27AAPFU0939F1ZV"  # a published valid sample
    with pytest.raises(ValueError, match="check digit"):
        v.normalise_gstin("27AAPFU0939F1ZW")
    with pytest.raises(ValueError, match="PAN"):
        v.normalise_gstin("27AAPFU0939F1ZV", pan="ZZZZZ9999Z")


def test_phone_normalisation_and_account_number_guard():
    assert v.normalise_phone("98765 43210") == "+919876543210"
    assert v.normalise_phone("+44 20 7946 0958") == "+442079460958"
    with pytest.raises(ValueError):
        v.normalise_phone("12345")
    assert v.looks_like_account_number("123456789012") and v.looks_like_account_number("1234 5678 9012")
    assert not v.looks_like_account_number("vendor_chargezone_1001") and not v.looks_like_account_number("UTR2026100001")


def test_masking():
    assert mask_phone("+919876543241") == "98•••41" and mask_phone("9876543241") == "98•••41"
    assert mask_email("asha.k@mail.in") == "a•••@mail.in" and mask_ref("1234567890") == "••••7890"


def test_money_is_exact_and_rounds_half_up():
    tariff = {"pricePerKwh": 18.0, "pricePerMin": 0, "pricePerSession": 0, "idleFeePerMin": 2.0, "gstPercent": 18.0}
    out = session_amount(tariff, energy_kwh=26.2, minutes=41, idle_minutes=5)
    assert out["energy"] == 471.6 and out["idle"] == 10.0 and out["subtotal"] == 481.6 and out["gross"] == 568.29
    assert r2(2.675) == 2.68 and r2(0.1 + 0.2) == 0.3
