"""Admin accounts and roles. Roles live in the `admins` collection (not in the Firebase token),
so a role change or a disable takes effect on the very next request."""
import logging

from firebase_admin import auth as fb_auth

from ..domain import clock
from ..errors import ApiError, conflict, invalid
from ..firebase import firebase_ready
from ..schemas.ops import AdminInvite, AdminPatch
from ..security.permissions import ROLE_LABEL, ROLE_PERMISSIONS, ROLE_SUMMARY, Role
from ..security.principal import Principal
from ..store.base import Store
from . import audit
from .colls import ADMINS
from .common import must_get

log = logging.getLogger(__name__)


def role_catalog() -> list[dict]:
    return [{"role": r.value, "label": ROLE_LABEL[r], "summary": ROLE_SUMMARY[r],
             "permissions": sorted(ROLE_PERMISSIONS[r])} for r in Role]


def _view(a: dict) -> dict:
    return {"id": a["id"], "email": a.get("email"), "name": a.get("name"), "role": a["role"],
            "roleLabel": ROLE_LABEL.get(Role(a["role"]), a["role"]), "status": a.get("status", "active"),
            "lastLoginAt": a.get("lastLoginAt"), "createdAt": a.get("createdAt"), "invitedBy": a.get("invitedBy")}


def list_admins(store: Store) -> list[dict]:
    return sorted((_view(a) for a in store.list(ADMINS)), key=lambda a: (a["status"] == "disabled", (a["name"] or "").lower()))


def directory(store: Store) -> list[dict]:
    """Minimal list (id, name, role) for assignee pickers; no emails, no permission needed beyond sign-in."""
    return [{"id": a["id"], "name": a.get("name") or a.get("email"), "role": a["role"]}
            for a in store.list(ADMINS) if a.get("status") != "disabled"]


def _active_supers(store: Store, excluding: str | None = None) -> int:
    return sum(1 for a in store.list(ADMINS) if a["role"] == Role.SUPER_ADMIN.value
               and a.get("status") != "disabled" and a["id"] != excluding)


def invite(store: Store, principal: Principal, body: AdminInvite) -> dict:
    email = body.email.lower()
    if store.list(ADMINS, {"email": email}):
        raise conflict("ALREADY_ADMIN", f"{email} is already an administrator.")
    uid = f"invite-{clock.new_id('a')[-8:]}"
    if firebase_ready():  # adopt the real uid if that person already has a Firebase account
        try:
            uid = fb_auth.get_user_by_email(email).uid
        except Exception:  # noqa: BLE001 - not found / transient: they will claim the invite on first sign-in
            pass
    doc = store.set(ADMINS, uid, {"email": email, "name": body.name, "role": body.role, "status": "invited",
                                  "createdAt": clock.now_ms(), "invitedBy": principal.uid, "lastLoginAt": None})
    audit.record(principal, "admin.invite", "admin", uid, label=body.name, after={"email": email, "role": body.role})
    return _view(doc)


def patch(store: Store, principal: Principal, admin_id: str, body: AdminPatch) -> dict:
    admin = must_get(store, ADMINS, admin_id, "Administrator")
    changes: dict = {}
    if body.role and body.role != admin["role"]:
        changes["role"] = body.role
    if body.status and body.status != admin.get("status"):
        changes["status"] = body.status
    if not changes:
        return _view(admin)
    if not body.reason:
        raise invalid("Give a reason for changing an administrator.", "REASON_REQUIRED")
    losing_super = admin["role"] == Role.SUPER_ADMIN.value and (
        changes.get("role") not in (None, Role.SUPER_ADMIN.value) or changes.get("status") == "disabled")
    if losing_super and _active_supers(store, excluding=admin_id) == 0:
        raise conflict("LAST_SUPER_ADMIN", "There must always be at least one active Super Admin.")
    if admin_id == principal.uid and (changes.get("status") == "disabled" or "role" in changes):
        raise ApiError(409, "SELF_CHANGE", "You cannot change your own role or disable yourself. Ask another Super Admin.")
    saved = store.update(ADMINS, admin_id, changes)
    if changes.get("status") == "disabled" and firebase_ready():
        try:
            fb_auth.revoke_refresh_tokens(admin_id)  # end their sessions now, not at token expiry
        except Exception as exc:  # noqa: BLE001
            log.warning("Could not revoke tokens for %s: %s", admin_id, exc)
    action = ("admin.disable" if changes.get("status") == "disabled" else
              "admin.enable" if changes.get("status") == "active" and "role" not in changes else "admin.role_change")
    audit.record(principal, action, "admin", admin_id, label=admin.get("name") or admin.get("email"),
                 before={k: admin.get(k) for k in changes}, after=changes, reason=body.reason)
    return _view(saved)
