"""Data-confidence rules. A Python port of the mobile app's `domain/trust.ts`, plus `manual`.

The product rule both apps share: **LIVE may only be claimed for a fresh operator feed.**
Everything else is Estimated / User-confirmed / Manual / Unknown, so the user app can never
show estimated information as Live. The freshness windows are configurable (Settings), with
the mobile app's constants as defaults.
"""
from typing import Literal

Confidence = Literal["live", "estimated", "user", "manual", "unknown"]
AppTrust = Literal["live", "estimated", "user", "unknown"]

# Mobile: LIVE_MAX_AGE_MS = 5 min, STALE_AFTER_MS = 30 min.
DEFAULT_LIVE_MAX_AGE_MS = 5 * 60 * 1000
DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000

CONFIDENCE_LABEL: dict[str, str] = {
    "live": "Live",
    "estimated": "Estimated",
    "user": "User-confirmed",
    "manual": "Manual",
    "unknown": "Unknown",
}

# For comparing: a station is only as trustworthy as its weakest connector.
CONFIDENCE_RANK: dict[str, int] = {"live": 4, "manual": 3, "user": 2, "estimated": 1, "unknown": 0}


def data_trust(source: str | None, updated_at: int | None, now: int,
               live_max_age_ms: int = DEFAULT_LIVE_MAX_AGE_MS) -> Confidence:
    if updated_at is None or source in (None, "none"):
        return "unknown"
    if source == "manual":
        return "manual"
    if source == "operator_feed" and now - updated_at <= live_max_age_ms:
        return "live"
    if source == "user_report":
        return "user"
    return "estimated"  # third-party/aggregated data, or an operator feed that went quiet


def is_stale(updated_at: int | None, now: int, stale_after_ms: int = DEFAULT_STALE_AFTER_MS) -> bool:
    return updated_at is None or now - updated_at > stale_after_ms


def to_app_trust(confidence: str) -> AppTrust:
    """What the *user app* is allowed to render. An admin-entered status is 'a person
    confirmed it' in the app's vocabulary, never Live."""
    if confidence == "manual":
        return "user"
    return confidence  # type: ignore[return-value]
