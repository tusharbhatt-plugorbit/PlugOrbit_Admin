from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..errors import ApiError
from ..state import get_store
from .auth import authenticate
from .principal import Principal

_bearer = HTTPBearer(auto_error=False)


def get_principal(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> Principal:
    if creds is None or not creds.credentials:
        raise ApiError(401, "MISSING_TOKEN", "Not signed in.")
    return authenticate(creds.credentials, get_store())


def require(*permissions: str):
    """Route dependency: the caller must hold **all** of `permissions` (least privilege)."""

    def checker(principal: Principal = Depends(get_principal)) -> Principal:
        missing = [p for p in permissions if not principal.can(p)]
        if missing:
            raise ApiError(
                403, "FORBIDDEN",
                "Your role does not allow this action.",
                missing=missing, role=principal.role,
            )
        return principal

    return checker
