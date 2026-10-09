"""Helpers shared by every service."""
from collections.abc import Iterable
from typing import Any

from ..domain import clock
from ..errors import ApiError, conflict, not_found
from ..store.base import Store


def must_get(store: Store, coll: str, doc_id: str, what: str) -> dict:
    doc = store.get(coll, doc_id)
    if doc is None:
        raise not_found(what, doc_id)
    return doc


def check_version(doc: dict, expected: int | None) -> None:
    """Optimistic concurrency: two admins editing the same record cannot silently overwrite."""
    if expected is not None and doc.get("version", 1) != expected:
        raise conflict(
            "STALE_VERSION",
            "Someone else changed this record while you were editing. Reload to see their changes.",
            currentVersion=doc.get("version", 1),
        )


def stamp(patch: dict, doc: dict | None = None, *, actor_uid: str | None = None) -> dict:
    """Add updatedAt/version (and createdAt/By for new documents) to a write."""
    out = dict(patch)
    out["updatedAt"] = clock.now_ms()
    out["version"] = (doc.get("version", 1) + 1) if doc else 1
    if doc is None:
        out.setdefault("createdAt", out["updatedAt"])
        if actor_uid:
            out.setdefault("createdBy", actor_uid)
    if actor_uid:
        out["updatedBy"] = actor_uid
    return out


def diff(before: dict, after: dict, keys: Iterable[str] | None = None) -> tuple[dict, dict]:
    """(before, after) restricted to the keys that actually changed, for readable audit rows."""
    names = list(keys) if keys is not None else sorted(set(before) | set(after))
    b: dict[str, Any] = {}
    a: dict[str, Any] = {}
    for k in names:
        if before.get(k) != after.get(k):
            b[k] = before.get(k)
            a[k] = after.get(k)
    return b, a


def paginate(items: list, limit: int, offset: int) -> dict:
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    return {"items": items[offset: offset + limit], "total": len(items), "limit": limit, "offset": offset}


def need(condition: bool, error: ApiError) -> None:
    if not condition:
        raise error


def contains(haystack: Iterable[str | None], needle: str) -> bool:
    needle = needle.lower()
    return any(needle in (h or "").lower() for h in haystack)
