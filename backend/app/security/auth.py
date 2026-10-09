"""Turn a bearer token into a Principal.

Production path: a Firebase ID token (verified with the Admin SDK, revocation checked) whose
uid maps to an active record in the `admins` collection. Roles live in Firestore, not in the
token, so a role change or a disable takes effect on the next request.

Development path: an HMAC dev token, only when ADMIN_DEV_AUTH=true (never in production).
"""
import logging

from firebase_admin import auth as fb_auth

from ..config import get_settings
from ..domain.clock import now_ms
from ..errors import ApiError
from ..firebase import firebase_ready
from ..store.base import Store
from . import tokens
from .permissions import Role
from .principal import Principal

log = logging.getLogger(__name__)

ADMINS = "admins"
LOGIN_TOUCH_MS = 5 * 60_000  # don't write lastLoginAt on every request


def _unauthorized(code: str, message: str) -> ApiError:
    return ApiError(401, code, message)


def _load_active_admin(store: Store, uid: str) -> dict:
    admin = store.get(ADMINS, uid)
    if admin is None:
        raise ApiError(403, "NOT_AN_ADMIN", "This account is not a PlugOrbit administrator.")
    if admin.get("status") == "disabled":
        raise ApiError(403, "ADMIN_DISABLED", "This administrator account has been disabled.")
    return admin


def _touch(store: Store, admin: dict) -> dict:
    last = admin.get("lastLoginAt") or 0
    if now_ms() - last > LOGIN_TOUCH_MS:
        admin = store.update(ADMINS, admin["id"], {"lastLoginAt": now_ms(), "status": "active"})
    return admin


def _claim_invite_or_bootstrap(store: Store, uid: str, email: str | None, email_verified: bool, name: str) -> dict:
    """First Firebase sign-in: adopt a pending invite by email, or bootstrap a Super Admin."""
    email_l = (email or "").lower()
    if email_l and email_verified:
        for invite in store.list(ADMINS, {"email": email_l}):
            if invite["id"] != uid:  # an invite keyed by a placeholder id -> re-key to the real uid
                data = {k: v for k, v in invite.items() if k != "id"}
                store.delete(ADMINS, invite["id"])
                data.update(status="active", lastLoginAt=now_ms())
                return store.set(ADMINS, uid, data)
        if email_l in {e.lower() for e in get_settings().bootstrap_super_admin_emails}:
            log.warning("Bootstrapping Super Admin %s", email_l)
            return store.set(ADMINS, uid, {
                "email": email_l, "name": name or email_l, "role": Role.SUPER_ADMIN.value,
                "status": "active", "createdAt": now_ms(), "lastLoginAt": now_ms(), "invitedBy": "bootstrap",
            })
    raise ApiError(403, "NOT_AN_ADMIN", "This account is not a PlugOrbit administrator.")


def authenticate(token: str, store: Store) -> Principal:
    if token.startswith("dev."):
        data = tokens.verify(token)
        if data is None:
            raise _unauthorized("INVALID_TOKEN", "Invalid or expired session. Please sign in again.")
        return Principal.from_admin(_touch(store, _load_active_admin(store, data["uid"])))

    if not firebase_ready():
        raise ApiError(503, "AUTH_NOT_CONFIGURED",
                       "Firebase Auth is not configured on the Admin API (missing serviceAccountKey.json).")
    try:
        decoded = fb_auth.verify_id_token(token, check_revoked=True)
    except fb_auth.ExpiredIdTokenError:
        raise _unauthorized("TOKEN_EXPIRED", "Session expired. Please sign in again.") from None
    except fb_auth.RevokedIdTokenError:
        raise _unauthorized("TOKEN_REVOKED", "You were signed out. Please sign in again.") from None
    except fb_auth.UserDisabledError:
        raise ApiError(403, "USER_DISABLED", "This account has been disabled.") from None
    except (fb_auth.InvalidIdTokenError, ValueError):
        raise _unauthorized("INVALID_TOKEN", "Invalid session. Please sign in again.") from None

    uid = decoded["uid"]
    admin = store.get(ADMINS, uid)
    if admin is None:
        admin = _claim_invite_or_bootstrap(
            store, uid, decoded.get("email"), bool(decoded.get("email_verified")), decoded.get("name", "")
        )
    if admin.get("status") == "disabled":
        raise ApiError(403, "ADMIN_DISABLED", "This administrator account has been disabled.")
    return Principal.from_admin(_touch(store, admin))
