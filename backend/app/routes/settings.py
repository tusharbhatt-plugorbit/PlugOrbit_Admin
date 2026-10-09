from fastapi import APIRouter, Depends

from ..schemas.ops import AdminInvite, AdminPatch, ConfigUpdate
from ..security.deps import get_principal, require
from ..security.principal import Principal
from ..services import admins
from ..services import config as config_service
from ..state import get_store
from ..store.base import Store

router = APIRouter(tags=["settings"])


@router.get("/config")
def get_config(_: Principal = Depends(require("settings:read")), store: Store = Depends(get_store)):
    return config_service.public(config_service.get(store))


@router.put("/config")
def put_config(body: ConfigUpdate, p: Principal = Depends(require("settings:write")), store: Store = Depends(get_store)):
    return config_service.update(store, p, body)


@router.get("/roles")
def roles(_: Principal = Depends(get_principal)):
    """The role matrix (read-only: it is defined in code, so it is reviewed and versioned)."""
    return admins.role_catalog()


@router.get("/admins")
def list_admins(_: Principal = Depends(require("roles:manage")), store: Store = Depends(get_store)):
    return {"items": admins.list_admins(store)}


@router.post("/admins", status_code=201)
def invite_admin(body: AdminInvite, p: Principal = Depends(require("roles:manage")), store: Store = Depends(get_store)):
    return admins.invite(store, p, body)


@router.patch("/admins/{admin_id}")
def patch_admin(admin_id: str, body: AdminPatch, p: Principal = Depends(require("roles:manage")),
                store: Store = Depends(get_store)):
    return admins.patch(store, p, admin_id, body)
