"""Firebase Admin initialisation. Mirrors the mobile Backend's app/firebase.py so the same
service-account key and Firebase project serve both services."""
import logging

import firebase_admin
from firebase_admin import credentials, firestore

from .config import get_settings

log = logging.getLogger(__name__)


def init_firebase() -> bool:
    """Initialise the Admin SDK once per process. Returns True when it is ready."""
    if firebase_admin._apps:
        return True
    settings = get_settings()
    cred_path = settings.credentials_file
    if not cred_path.exists() and settings.data_backend == "firestore":
        # Cloud Run / GCE: no key file, the runtime service account supplies Application Default
        # Credentials. Only attempted when Firestore is demanded explicitly, so a developer who
        # forgot their key still falls back to the demo store rather than hitting a real project.
        try:
            firebase_admin.initialize_app()
            log.info("Firebase Admin initialised with Application Default Credentials")
            return True
        except Exception as exc:  # noqa: BLE001
            log.error("Failed to initialise Firebase Admin with Application Default Credentials: %s", exc)
            return False
    if not cred_path.exists():
        log.warning(
            "Firebase credentials file '%s' was not found. The Admin API will use the "
            "in-memory demo store (development only). Download a service-account key from "
            "Firebase console -> Project settings -> Service accounts to use Firestore.",
            cred_path,
        )
        return False
    try:
        firebase_admin.initialize_app(credentials.Certificate(cred_path))
        log.info("Firebase Admin initialised using %s", cred_path)
        return True
    except Exception as exc:  # noqa: BLE001 - surface any credential problem as a warning
        log.error("Failed to initialise Firebase Admin with %s: %s", cred_path, exc)
        return False


def firebase_ready() -> bool:
    return bool(firebase_admin._apps)


def get_firestore_client():
    if not firebase_ready():
        raise RuntimeError("Firebase Admin SDK is not initialised.")
    return firestore.client()
