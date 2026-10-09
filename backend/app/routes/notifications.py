from fastapi import APIRouter, Depends, Query

from ..schemas.ops import NotificationCreate, NotificationUpdate
from ..security.deps import require
from ..security.principal import Principal
from ..services import notifications
from ..state import get_store
from ..store.base import Store

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(kind: str | None = None, status: str | None = None, limit: int = Query(50, ge=1, le=200),
                       offset: int = Query(0, ge=0), _: Principal = Depends(require("notifications:read")),
                       store: Store = Depends(get_store)):
    return notifications.list_notifications(store, kind=kind, status=status, limit=limit, offset=offset)


@router.post("", status_code=201)
def create(body: NotificationCreate, p: Principal = Depends(require("notifications:write")), store: Store = Depends(get_store)):
    return notifications.create(store, p, body)


@router.put("/{nid}")
def update(nid: str, body: NotificationUpdate, p: Principal = Depends(require("notifications:write")),
           store: Store = Depends(get_store)):
    return notifications.update(store, p, nid, body)


@router.post("/{nid}/publish")
def publish(nid: str, p: Principal = Depends(require("notifications:write")), store: Store = Depends(get_store)):
    return notifications.publish(store, p, nid)
