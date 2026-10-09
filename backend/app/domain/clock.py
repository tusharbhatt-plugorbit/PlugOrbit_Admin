"""Time and id helpers. Every timestamp in the API and database is epoch **milliseconds**
(the same unit as the mobile app's `FeedInfo.updatedAt`), so no timezone ever crosses the wire."""
import secrets
import string
import time
import uuid

MINUTE = 60_000
HOUR = 60 * MINUTE
DAY = 24 * HOUR

_ALPHABET = string.ascii_uppercase + string.digits


def now_ms() -> int:
    return int(time.time() * 1000)


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def session_code() -> str:
    """Human-friendly session id such as PO-6A4K92."""
    return "PO-" + "".join(secrets.choice(_ALPHABET) for _ in range(6))


def slugify(text: str) -> str:
    keep = [c.lower() if c.isalnum() else "-" for c in text]
    slug = "".join(keep)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")
