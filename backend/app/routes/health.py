from fastapi import APIRouter, Depends, Query

from ..security.deps import require
from ..security.principal import Principal
from ..services import health
from ..state import get_store
from ..store.base import Store

router = APIRouter(prefix="/health", tags=["charger-health"])


@router.get("/summary")
def summary(_: Principal = Depends(require("health:read")), store: Store = Depends(get_store)):
    return health.summary(store)


@router.get("/chargers")
def chargers(severity: str | None = None, partnerId: str | None = None, stationId: str | None = None,
             status: str | None = None, q: str | None = None, limit: int = Query(100, ge=1, le=200),
             offset: int = Query(0, ge=0), _: Principal = Depends(require("health:read")),
             store: Store = Depends(get_store)):
    return health.list_rows(store, severity=severity, partner_id=partnerId, station_id=stationId, status=status,
                            q=q, limit=limit, offset=offset)
