from fastapi import APIRouter, Depends, Query

from ..schemas.ops import DqAction, DqMerge
from ..security.deps import require
from ..security.principal import Principal
from ..services import dataquality
from ..state import get_store
from ..store.base import Store

router = APIRouter(prefix="/data-quality", tags=["data-quality"])


@router.get("/summary")
def summary(_: Principal = Depends(require("dataquality:read")), store: Store = Depends(get_store)):
    return dataquality.summary(store)


@router.get("/issues")
def issues(type: str | None = None, status: str | None = "active", severity: str | None = None,
           stationId: str | None = None, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
           _: Principal = Depends(require("dataquality:read")), store: Store = Depends(get_store)):
    return dataquality.list_issues(store, type_=type, status=status, severity=severity, station_id=stationId,
                                   limit=limit, offset=offset)


@router.post("/scan")
def scan(p: Principal = Depends(require("dataquality:resolve")), store: Store = Depends(get_store)):
    return dataquality.scan(store, p)


@router.post("/issues/{issue_id}/action")
def act(issue_id: str, body: DqAction, p: Principal = Depends(require("dataquality:resolve")),
        store: Store = Depends(get_store)):
    return dataquality.act(store, p, issue_id, body)


@router.post("/merge")
def merge(body: DqMerge, p: Principal = Depends(require("dataquality:resolve", "stations:write")),
          store: Store = Depends(get_store)):
    return dataquality.merge(store, p, body)
