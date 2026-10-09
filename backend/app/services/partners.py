"""Partner records (internal only in Phase 1: partners have no login)."""
from ..domain import clock
from ..domain.redact import mask_ref
from ..errors import conflict, forbidden, invalid
from ..schemas.partners import PartnerCreate, PartnerTransition, PartnerUpdate
from ..security.principal import Principal
from ..store.base import Store
from . import audit, stations
from .common import check_version, contains, diff, must_get, paginate, stamp

PARTNERS = "partners"

# from -> allowed targets. Anything else is a 409, so the UI can only offer legal moves.
TRANSITIONS: dict[str, set[str]] = {
    "draft": {"pending_review"},
    "pending_review": {"active", "rejected", "draft"},
    "active": {"suspended"},
    "suspended": {"active"},
    "rejected": {"draft"},
}

_ACTION = {
    ("draft", "pending_review"): "partner.submit",
    ("pending_review", "active"): "partner.approve",
    ("pending_review", "rejected"): "partner.reject",
    ("pending_review", "draft"): "partner.reopen",
    ("rejected", "draft"): "partner.reopen",
    ("active", "suspended"): "partner.suspend",
    ("suspended", "active"): "partner.reactivate",
}
_NEEDS_REVIEW_PERM = {"active", "rejected", "suspended"}
_NEEDS_REASON = {"rejected", "suspended"}

EDITABLE = ("legalName", "displayName", "contactName", "phone", "email", "pan", "gstin", "payoutReference",
            "commercialModel", "commissionPercent", "flatFeePerKwh", "commissionPlanId", "integrationMethod",
            "notes")


def may_see_tax_ids(principal: Principal) -> bool:
    """PAN, GSTIN and the payout reference are for the people who maintain partners or pay them.
    Support can still see who the partner is and how to contact them, but not their tax identity."""
    return principal.can("partners:write") or principal.can("settlements:read")


def present(partner: dict, station_rows: list[dict] | None, principal: Principal) -> dict:
    """API view. The payout reference is masked in lists; the detail view shows what is stored,
    which is already only a reference (never an account number). Callers who may not see tax
    identifiers get them masked to the last four characters."""
    out = dict(partner)
    out["name"] = partner.get("displayName") or partner["legalName"]
    rows = station_rows if station_rows is not None else []
    out["stationCount"] = len(rows)
    out["liveStationCount"] = sum(1 for s in rows if s.get("publication") == "live")
    out["payoutReferenceMasked"] = mask_ref(partner.get("payoutReference"))
    out["taxIdsMasked"] = not may_see_tax_ids(principal)
    if out["taxIdsMasked"]:
        out["pan"] = mask_ref(partner.get("pan"))
        out["gstin"] = mask_ref(partner.get("gstin"))
        out["payoutReference"] = None
    return out


def _counts(store: Store) -> dict[str, list[dict]]:
    by_partner: dict[str, list[dict]] = {}
    for s in store.list(stations.STATIONS):
        by_partner.setdefault(s["partnerId"], []).append(s)
    return by_partner


def list_partners(store: Store, principal: Principal, *, q: str | None, status: str | None, integration: str | None,
                  model: str | None, limit: int, offset: int) -> dict:
    by_partner = _counts(store)
    rows = []
    for p in store.list(PARTNERS):
        if status and p["status"] != status:
            continue
        if integration and p.get("integrationMethod") != integration:
            continue
        if model and p.get("commercialModel") != model:
            continue
        if q and not contains([p["legalName"], p.get("displayName"), p.get("contactName"), p.get("email"), p["id"]], q):
            continue
        rows.append(present(p, by_partner.get(p["id"], []), principal))
    rows.sort(key=lambda r: r["name"].lower())
    return paginate(rows, limit, offset)


def get_partner(store: Store, principal: Principal, partner_id: str) -> dict:
    partner = must_get(store, PARTNERS, partner_id, "Partner")
    return present(partner, _counts(store).get(partner_id, []), principal)


def _unique_identity(store: Store, pan: str, gstin: str | None, self_id: str | None = None) -> None:
    for other in store.list(PARTNERS):
        if other["id"] == self_id:
            continue
        if other.get("pan") == pan:
            raise conflict("DUPLICATE_PARTNER", f"A partner with PAN {pan} already exists ({other['legalName']}).",
                           existingId=other["id"])
        if gstin and other.get("gstin") == gstin:
            raise conflict("DUPLICATE_PARTNER", f"A partner with GSTIN {gstin} already exists ({other['legalName']}).",
                           existingId=other["id"])


def create(store: Store, principal: Principal, body: PartnerCreate) -> dict:
    data = body.model_dump()
    _unique_identity(store, data["pan"], data.get("gstin"))
    partner_id = f"ptn-{_slug(data.get('displayName') or data['legalName'])}"
    if store.get(PARTNERS, partner_id):
        partner_id = f"{partner_id}-{clock.new_id('x')[-4:]}"
    doc = stamp({
        **data,
        "status": "draft",
        "verification": {"panVerified": False, "gstinVerified": False, "reviewedBy": None,
                         "reviewedAt": None, "rejectionReason": None},
        "isDemo": False,
    }, None, actor_uid=principal.uid)
    saved = store.create(PARTNERS, partner_id, doc)
    audit.record(principal, "partner.create", "partner", partner_id, label=data["legalName"], after=_audit_view(saved))
    return present(saved, [], principal)


def update(store: Store, principal: Principal, partner_id: str, body: PartnerUpdate) -> dict:
    current = must_get(store, PARTNERS, partner_id, "Partner")
    check_version(current, body.expectedVersion)
    data = body.model_dump(exclude={"expectedVersion"})
    _unique_identity(store, data["pan"], data.get("gstin"), partner_id)
    saved = store.update(PARTNERS, partner_id, stamp(data, current, actor_uid=principal.uid))
    before, after = diff(current, saved, EDITABLE)
    if after:
        audit.record(principal, "partner.update", "partner", partner_id, label=saved["legalName"],
                     before=before, after=after)
    # Stations keep their own integration settings; new commercial terms apply from the next settlement run.
    return get_partner(store, principal, partner_id)


def transition(store: Store, principal: Principal, partner_id: str, body: PartnerTransition) -> dict:
    current = must_get(store, PARTNERS, partner_id, "Partner")
    src, dst = current["status"], body.to
    if dst not in TRANSITIONS.get(src, set()):
        raise conflict("ILLEGAL_TRANSITION", f"A {src.replace('_', ' ')} partner cannot move to {dst.replace('_', ' ')}.",
                       allowed=sorted(TRANSITIONS.get(src, set())))
    if dst in _NEEDS_REVIEW_PERM and not principal.can("partners:review"):
        raise forbidden("Only reviewers can approve, reject or suspend a partner.", missing=["partners:review"])
    if dst in _NEEDS_REASON and not body.reason:
        raise invalid("A reason is required.", "REASON_REQUIRED")

    verification = dict(current.get("verification") or {})
    if body.panVerified is not None:
        verification["panVerified"] = body.panVerified
    if body.gstinVerified is not None:
        verification["gstinVerified"] = body.gstinVerified

    if dst == "active" and src == "pending_review":
        if not verification.get("panVerified"):
            raise invalid("Confirm the PAN has been checked before approving.", "PAN_NOT_VERIFIED")
        if current.get("gstin") and not verification.get("gstinVerified"):
            raise invalid("Confirm the GSTIN has been checked before approving.", "GSTIN_NOT_VERIFIED")
    if dst in ("active", "rejected"):
        verification.update(reviewedBy=principal.uid, reviewedAt=clock.now_ms(),
                            rejectionReason=body.reason if dst == "rejected" else None)

    saved = store.update(PARTNERS, partner_id,
                         stamp({"status": dst, "verification": verification,
                                "statusReason": body.reason}, current, actor_uid=principal.uid))
    audit.record(principal, _ACTION[(src, dst)], "partner", partner_id, label=saved["legalName"],
                 before={"status": src}, after={"status": dst, "verification": verification}, reason=body.reason)
    stations.recompute_visibility(store, partner_id=partner_id)  # suspension hides the partner's stations
    return get_partner(store, principal, partner_id)


def _audit_view(partner: dict) -> dict:
    return {k: partner.get(k) for k in (*EDITABLE, "status")}


def _slug(text: str) -> str:
    return clock.slugify(text)[:40] or "partner"
