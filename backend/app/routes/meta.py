from fastapi import APIRouter, Depends

from ..config import get_settings
from ..firebase import firebase_ready
from ..security.deps import get_principal
from ..security.principal import Principal
from ..services import lookups
from ..services import gateway as gateway_service
from ..state import get_store
from ..store.base import Store

router = APIRouter(tags=["meta"])

VERSION = "1.0.0"


@router.get("/meta")
def meta(store: Store = Depends(get_store)):
    """Public and secret-free: lets the sign-in screen pick Firebase vs demo sign-in, and lets
    every page show an honest 'demo data' banner."""
    s = get_settings()
    return {
        "name": "PlugOrbit Admin API", "version": VERSION, "environment": s.environment,
        "dataMode": "demo" if store.name == "memory" else "live",
        "store": store.name,
        "auth": {"firebase": firebase_ready(), "devAuth": bool(s.admin_dev_auth)},
        "paymentGateway": {"name": gateway_service.get_gateway().name, "simulated": gateway_service.get_gateway().simulated},
    }


@router.get("/lookups")
def lookups_route(_: Principal = Depends(get_principal), store: Store = Depends(get_store)):
    return lookups.build(store)
