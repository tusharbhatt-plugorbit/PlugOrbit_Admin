"""Effective connector state and the derived station status.

A connector's *reported* status comes from a feed. An admin may override it (with a reason and
an optional expiry); while an override is active it wins and the confidence becomes `manual`.
The station status is derived from its connectors, mirroring the mobile app's `stationHealth`.
"""
from typing import Any

from .trust import CONFIDENCE_RANK, data_trust, is_stale, to_app_trust

CONNECTOR_STATUSES = ("available", "occupied", "offline", "maintenance", "unknown")


def override_active(connector: dict, now: int) -> bool:
    ov = connector.get("override")
    if not ov:
        return False
    expires = ov.get("expiresAt")
    return expires is None or expires > now


def resolve_connector(connector: dict, now: int, live_max_age_ms: int, stale_after_ms: int) -> dict[str, Any]:
    """The state an operator (and the user app) should believe right now."""
    if override_active(connector, now):
        ov = connector["override"]
        status, source, updated = ov["status"], "manual", ov["at"]
    else:
        status = connector.get("status") or "unknown"
        source = connector.get("statusSource") or "none"
        updated = connector.get("statusUpdatedAt")
    confidence = data_trust(source, updated, now, live_max_age_ms)
    stale = confidence != "manual" and is_stale(updated, now, stale_after_ms)
    heartbeat = connector.get("lastHeartbeatAt")
    return {
        "status": status,
        "source": source,
        "updatedAt": updated,
        "confidence": confidence,
        "appTrust": to_app_trust(confidence),
        "stale": stale,
        "overridden": override_active(connector, now),
        "heartbeatAgeMs": None if heartbeat is None else max(0, now - heartbeat),
    }


def derive_station(resolved: list[dict[str, Any]]) -> dict[str, Any]:
    """Station-level status, confidence and counts from its connectors' resolved states."""
    counts = {s: 0 for s in CONNECTOR_STATUSES}
    for r in resolved:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    total = len(resolved)
    counts["total"] = total

    if total == 0:
        status = "unknown"
    elif counts["maintenance"] == total:
        status = "maintenance"
    elif counts["available"] > 0:
        status = "available"
    elif counts["occupied"] > 0:
        status = "occupied"
    elif counts["offline"] + counts["maintenance"] == total:
        status = "offline"
    else:
        status = "unknown"

    if total == 0:
        confidence = "unknown"
    else:
        confidence = min((r["confidence"] for r in resolved), key=lambda c: CONFIDENCE_RANK[c])

    updated = [r["updatedAt"] for r in resolved if r["updatedAt"] is not None]
    return {
        "status": status,
        "confidence": confidence,
        "appTrust": to_app_trust(confidence),
        "stale": any(r["stale"] for r in resolved) if total else True,
        "counts": counts,
        "lastUpdatedAt": max(updated) if updated else None,
    }
