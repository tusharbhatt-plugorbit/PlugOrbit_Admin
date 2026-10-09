import logging

from fastapi import APIRouter, Depends
from firebase_admin import auth as fb_auth

from ..config import get_settings
from ..errors import ApiError
from ..firebase import firebase_ready
from ..schemas.ops import DevLogin
from ..security import tokens
from ..security.deps import get_principal
from ..security.permissions import ROLE_LABEL, Role
from ..security.principal import Principal
from ..services import audit
from ..services import config as config_service
from ..state import get_store
from ..store.base import Store

log = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


def _dev_only() -> None:
    if not get_settings().admin_dev_auth:
        raise ApiError(403, "DEV_AUTH_DISABLED", "Demo sign-in is disabled. Use your administrator account.")


@router.get("/dev-roles")
def dev_roles(store: Store = Depends(get_store)):
    """Which demo admins exist (development only): powers the sign-in role picker."""
    _dev_only()
    seen: set[str] = set()
    roles = []
    for a in sorted(store.list("admins"), key=lambda a: a["id"]):  # one entry per role (the seed has two finance admins)
        if a["id"].startswith("dev-") and a["role"] not in seen:
            seen.add(a["role"])
            roles.append({"role": a["role"], "roleLabel": ROLE_LABEL[Role(a["role"])], "name": a["name"]})
    order = [r.value for r in Role]  # privilege order, not alphabetical
    return sorted(roles, key=lambda r: order.index(r["role"]))


@router.post("/dev-login")
def dev_login(body: DevLogin, store: Store = Depends(get_store)):
    _dev_only()
    admin = next((a for a in store.list("admins") if a["id"].startswith("dev-") and a["role"] == body.role), None)
    if admin is None:
        raise ApiError(404, "NOT_FOUND", "No demo admin exists for that role.")
    return {"token": tokens.issue(admin["id"]), "principal": Principal.from_admin(admin).public()}


@router.post("/session")
def start_session(principal: Principal = Depends(get_principal), store: Store = Depends(get_store)):
    """Called once after sign-in: records the login in the audit trail and returns what the web
    app needs to configure itself (permissions, idle timeout, feature flags)."""
    audit.record(principal, "auth.login", "admin", principal.uid, label=principal.name)
    cfg = config_service.get(store)
    return {"principal": principal.public(), "idleTimeoutMinutes": cfg["adminIdleTimeoutMinutes"],
            "featureFlags": cfg["featureFlags"]}


@router.get("/me")
def me(principal: Principal = Depends(get_principal), store: Store = Depends(get_store)):
    cfg = config_service.get(store)
    return {"principal": principal.public(), "idleTimeoutMinutes": cfg["adminIdleTimeoutMinutes"],
            "featureFlags": cfg["featureFlags"]}


@router.post("/logout")
def logout(principal: Principal = Depends(get_principal)):
    """Secure sign-out: record it and, with Firebase, revoke refresh tokens so the session cannot be revived."""
    audit.record(principal, "auth.logout", "admin", principal.uid, label=principal.name)
    if firebase_ready() and not principal.uid.startswith("dev-"):
        try:
            fb_auth.revoke_refresh_tokens(principal.uid)
        except Exception as exc:  # noqa: BLE001 - sign-out must not fail because revocation did
            log.warning("Could not revoke tokens for %s: %s", principal.uid, exc)
    return {"message": "Signed out."}
