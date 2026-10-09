"""Development-only signed tokens (HMAC-SHA256), used when Firebase Auth is not configured.

Production never reaches this module: `admin_dev_auth` must be false there (enforced at
startup by config.validate_for_environment), and verify() refuses to run unless it is on.
"""
import base64
import hashlib
import hmac
import json
import secrets

from ..config import get_settings
from ..domain.clock import now_ms

_PROCESS_SECRET = secrets.token_hex(32)  # fresh per process when ADMIN_DEV_SECRET is unset


def _secret() -> bytes:
    return (get_settings().admin_dev_secret or _PROCESS_SECRET).encode()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue(uid: str, ttl_seconds: int | None = None) -> str:
    ttl = ttl_seconds if ttl_seconds is not None else get_settings().dev_token_ttl_seconds
    payload = _b64(json.dumps({"uid": uid, "exp": now_ms() + ttl * 1000}).encode())
    sig = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    return f"dev.{payload}.{sig}"


def verify(token: str) -> dict | None:
    """Return the payload if the token is a valid, unexpired dev token, else None."""
    settings = get_settings()
    if not settings.admin_dev_auth or not token.startswith("dev."):
        return None
    try:
        _, payload, sig = token.split(".")
        expected = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(_unb64(payload))
    except (ValueError, json.JSONDecodeError):
        return None
    return data if data.get("exp", 0) > now_ms() else None
