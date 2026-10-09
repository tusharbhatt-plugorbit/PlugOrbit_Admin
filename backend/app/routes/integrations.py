from fastapi import APIRouter, Depends

from ..schemas.ops import IntegrationPatch
from ..security.deps import require
from ..security.principal import Principal
from ..services import integrations
from ..state import get_store
from ..store.base import Store

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("")
def list_integrations(_: Principal = Depends(require("integrations:read")), store: Store = Depends(get_store)):
    return integrations.list_integrations(store)


@router.patch("/{key}")
def update(key: str, body: IntegrationPatch, p: Principal = Depends(require("integrations:write")),
           store: Store = Depends(get_store)):
    return integrations.update(store, p, key, body)


@router.post("/{key}/test")
def test(key: str, p: Principal = Depends(require("integrations:write")), store: Store = Depends(get_store)):
    return integrations.test(store, p, key)
