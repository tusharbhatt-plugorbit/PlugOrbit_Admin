from fastapi import APIRouter, Depends, Query

from ..security.deps import require
from ..security.principal import Principal
from ..services import analytics
from ..state import get_store
from ..store.base import Store

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
def summary(range: str = Query("30d", pattern="^(7d|30d|90d)$"), _: Principal = Depends(require("analytics:read")),
            store: Store = Depends(get_store)):
    return analytics.summary(store, range)
