from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# backend/ folder, so .env and the key file resolve no matter where uvicorn is started from.
BASE_DIR = Path(__file__).resolve().parent.parent


def _split(value):
    """Accept JSON lists (like the mobile Backend's CORS_ORIGINS) and plain comma lists."""
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("["):
            import json

            return json.loads(text)
        return [part.strip() for part in text.split(",") if part.strip()]
    return value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    environment: Literal["development", "test", "staging", "production"] = "development"

    # --- Firebase -------------------------------------------------------------------
    # Same variable the mobile Backend uses, so one service-account key serves both.
    firebase_credentials_path: str = "serviceAccountKey.json"

    # --- Data layer -----------------------------------------------------------------
    # auto      -> Firestore when the service-account key exists, otherwise the in-memory
    #              demo store (development/test only; production refuses to start).
    # memory    -> always the in-memory demo store, seeded with clearly-marked demo data.
    # firestore -> always Firestore; fails fast if the Admin SDK is not initialised.
    data_backend: Literal["auto", "memory", "firestore"] = "auto"
    seed_demo_data: bool = True

    # --- Admin auth -----------------------------------------------------------------
    # Emails allowed to bootstrap themselves as Super Admin on first sign-in. After that,
    # roles live in the `admins` collection and are managed from Settings -> Admin roles.
    bootstrap_super_admin_emails: Annotated[list[str], NoDecode] = []
    # DEVELOPMENT ONLY: lets the web app sign in with a role picker when Firebase Auth is
    # not configured. Refused outside development/test (see validate_for_environment).
    admin_dev_auth: bool = False
    admin_dev_secret: str = ""
    # Short-lived by design; Firebase ID tokens are the production path.
    dev_token_ttl_seconds: int = 8 * 3600

    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    # Where the Maps browser key is *restricted to*, not the key itself. The key lives in
    # the web build's environment (VITE_GOOGLE_MAPS_API_KEY) and is never served by this API.
    public_web_origin: str = "http://localhost:5173"

    @field_validator("cors_origins", "bootstrap_super_admin_emails", mode="before")
    @classmethod
    def _lists(cls, value):
        return _split(value)

    @property
    def credentials_file(self) -> Path:
        path = Path(self.firebase_credentials_path)
        return path if path.is_absolute() else BASE_DIR / path

    @property
    def is_production_like(self) -> bool:
        return self.environment in ("staging", "production")


def validate_for_environment(settings: Settings, *, firestore_active: bool) -> list[str]:
    """Return the list of unsafe settings. Production-like environments must fail closed."""
    problems: list[str] = []
    if settings.is_production_like:
        if settings.admin_dev_auth:
            problems.append("ADMIN_DEV_AUTH must be false outside development.")
        if not firestore_active:
            problems.append("Firestore must be active (service-account key + DATA_BACKEND=firestore).")
        if "*" in settings.cors_origins:
            problems.append("CORS_ORIGINS must list the admin web origin explicitly, not '*'.")
        if not settings.bootstrap_super_admin_emails:
            # Not fatal once an admin exists, but a fresh project would be locked out.
            pass
    elif settings.admin_dev_auth and settings.environment not in ("development", "test"):
        problems.append("ADMIN_DEV_AUTH is only allowed in development/test.")
    return problems


@lru_cache
def get_settings() -> Settings:
    return Settings()
