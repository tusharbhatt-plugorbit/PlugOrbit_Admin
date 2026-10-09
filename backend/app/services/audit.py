"""Tamper-evident audit trail.

Every sensitive change goes through `record()`. Entries are append-only (there is no update or
delete anywhere in the API, and Firestore rules deny all client writes) and **hash-chained**:

    hash = sha256( prevHash | canonical_json(entry without hash) )

so editing or removing any historical entry breaks every hash after it, which `verify()`
detects. This turns "audit entries should not be editable" from a convention into something
an auditor can check (GET /admin/v1/audit/verify).
"""
import hashlib
import json
from typing import Any

from ..domain.clock import now_ms
from ..domain.redact import redact
from ..security.principal import Principal
from ..state import get_store, request_context

AUDIT = "audit"
GENESIS = "0" * 64

# action -> (human label, category). The category powers the Audit Log filter.
ACTIONS: dict[str, tuple[str, str]] = {
    "auth.login": ("Signed in", "access"),
    "auth.logout": ("Signed out", "access"),
    "partner.create": ("Partner created", "partner"),
    "partner.update": ("Partner edited", "partner"),
    "partner.submit": ("Partner submitted for review", "partner"),
    "partner.approve": ("Partner approved", "partner"),
    "partner.reject": ("Partner rejected", "partner"),
    "partner.suspend": ("Partner suspended", "partner"),
    "partner.reactivate": ("Partner reactivated", "partner"),
    "partner.reopen": ("Partner reopened as draft", "partner"),
    "station.create": ("Station created", "station"),
    "station.update": ("Station edited", "station"),
    "station.publish": ("Station set live in app", "station"),
    "station.hide": ("Station hidden", "station"),
    "station.unhide": ("Station unhidden", "station"),
    "station.status_override": ("Station status overridden", "station"),
    "station.merge": ("Duplicate stations merged", "station"),
    "connector.create": ("Connector added", "station"),
    "connector.update": ("Connector edited", "station"),
    "connector.delete": ("Connector removed", "station"),
    "connector.override": ("Connector status overridden", "station"),
    "connector.override_clear": ("Connector override cleared", "station"),
    "tariff.create": ("Price changed", "pricing"),
    "tariff.cancel": ("Scheduled price cancelled", "pricing"),
    "refund.issue": ("Refund issued", "money"),
    "settlement.run": ("Settlement run created", "money"),
    "settlement.adjust": ("Settlement adjusted", "money"),
    "settlement.approve": ("Settlement approved", "money"),
    "settlement.hold": ("Settlement put on hold", "money"),
    "settlement.paid": ("Settlement marked paid", "money"),
    "ticket.create": ("Ticket created", "support"),
    "ticket.update": ("Ticket updated", "support"),
    "ticket.note": ("Internal note added", "support"),
    "user.restrict": ("User restricted", "user"),
    "user.unrestrict": ("User restriction removed", "user"),
    "user.reveal": ("User contact details revealed", "user"),
    "dq.scan": ("Data-quality scan run", "data"),
    "dq.action": ("Data-quality issue actioned", "data"),
    "integration.update": ("Integration changed", "platform"),
    "integration.test": ("Integration tested", "platform"),
    "config.update": ("Platform setting changed", "platform"),
    "admin.invite": ("Admin invited", "platform"),
    "admin.role_change": ("Admin role changed", "platform"),
    "admin.disable": ("Admin disabled", "platform"),
    "admin.enable": ("Admin re-enabled", "platform"),
    "notification.create": ("Notification created", "content"),
    "notification.update": ("Notification edited", "content"),
    "notification.publish": ("Notification published", "content"),
}


def _canonical(entry: dict[str, Any]) -> str:
    return json.dumps(entry, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str)


def _digest(prev_hash: str, entry: dict[str, Any]) -> str:
    body = {k: v for k, v in entry.items() if k not in ("hash", "id")}
    return hashlib.sha256(f"{prev_hash}|{_canonical(body)}".encode()).hexdigest()


def record(
    actor: Principal,
    action: str,
    entity_type: str,
    entity_id: str,
    *,
    label: str | None = None,
    before: Any = None,
    after: Any = None,
    reason: str | None = None,
    at: int | None = None,
) -> dict:
    """Append one audit entry. Snapshots are redacted before they are stored. `at` is only for
    the demo seed (back-dated history); normal callers always get the current time."""
    ctx = request_context.get()
    label_text, category = ACTIONS.get(action, (action, "other"))

    def build(head: dict | None) -> dict:
        prev_hash = head["hash"] if head else GENESIS
        entry = {
            "seq": (head["seq"] if head else 0) + 1,
            "at": at if at is not None else now_ms(),
            "actor": actor.actor(),
            "action": action,
            "actionLabel": label_text,
            "category": category,
            "entityType": entity_type,
            "entityId": entity_id,
            "entityLabel": label,
            "before": redact(before),
            "after": redact(after),
            "reason": reason,
            "source": ctx.source,
            "requestId": ctx.request_id,
            "prevHash": prev_hash,
        }
        entry["hash"] = _digest(prev_hash, entry)
        return entry

    return get_store().append_audit(build)


def verify() -> dict:
    """Recompute the whole chain. `ok` is False at the first entry that was altered/removed."""
    entries = sorted(get_store().list(AUDIT), key=lambda e: e["seq"])
    prev_hash = GENESIS
    expected_seq = 1
    for entry in entries:
        if entry["seq"] != expected_seq:
            return {"ok": False, "checked": expected_seq - 1, "firstBadSeq": expected_seq,
                    "reason": "Missing entry (sequence gap)."}
        if entry["prevHash"] != prev_hash or _digest(prev_hash, entry) != entry["hash"]:
            return {"ok": False, "checked": expected_seq - 1, "firstBadSeq": entry["seq"],
                    "reason": "Entry content or link does not match its hash."}
        prev_hash = entry["hash"]
        expected_seq += 1
    return {"ok": True, "checked": len(entries), "headHash": prev_hash if entries else None}


def list_entries(
    *,
    actor: str | None = None,
    action: str | None = None,
    category: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    q: str | None = None,
    since: int | None = None,
    until: int | None = None,
    before_seq: int | None = None,
    limit: int = 50,
) -> dict:
    rows = get_store().list(AUDIT)
    rows.sort(key=lambda e: e["seq"], reverse=True)

    def keep(e: dict) -> bool:
        if actor and actor.lower() not in f"{e['actor'].get('email') or ''} {e['actor'].get('name') or ''} {e['actor'].get('uid')}".lower():
            return False
        if action and e["action"] != action:
            return False
        if category and e["category"] != category:
            return False
        if entity_type and e["entityType"] != entity_type:
            return False
        if entity_id and e["entityId"] != entity_id:
            return False
        if since and e["at"] < since:
            return False
        if until and e["at"] > until:
            return False
        if before_seq and e["seq"] >= before_seq:
            return False
        if q:
            hay = f"{e['actionLabel']} {e['entityId']} {e.get('entityLabel') or ''} {e.get('reason') or ''}".lower()
            if q.lower() not in hay:
                return False
        return True

    matched = [e for e in rows if keep(e)]
    page = matched[:limit]
    return {
        "items": page,
        "nextBeforeSeq": page[-1]["seq"] if len(matched) > limit else None,
        "total": len(matched),
    }


def catalog() -> list[dict]:
    return [{"action": a, "label": v[0], "category": v[1]} for a, v in ACTIONS.items()]
