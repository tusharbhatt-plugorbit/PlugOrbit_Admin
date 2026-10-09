"""Keep secrets and raw personal data out of audit snapshots and API responses."""
from typing import Any

SECRET_KEYS = ("secret", "password", "token", "apikey", "api_key", "privatekey", "credential", "authorization")


def _is_secret(key: str) -> bool:
    lowered = key.replace("-", "").replace("_", "").lower()
    return any(marker.replace("_", "") in lowered for marker in SECRET_KEYS)


def redact(value: Any) -> Any:
    """Deep copy with secret-looking fields replaced by '[redacted]'."""
    if isinstance(value, dict):
        return {k: ("[redacted]" if _is_secret(k) and v else redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value


def mask_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) < 6:
        return "•••"
    national = digits[-10:]  # drop the country code: it identifies nobody
    return f"{national[:2]}•••{national[-2:]}"


def mask_email(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    local, domain = email.split("@", 1)
    return f"{local[:1]}•••@{domain}"


def mask_ref(ref: str | None, keep: int = 4) -> str | None:
    """Payout/bank references are shown as '••••1234' only."""
    if not ref:
        return None
    return f"••••{ref[-keep:]}" if len(ref) > keep else "••••"
