from fastapi import APIRouter, Depends

from ..security.deps import require
from ..security.principal import Principal
from ..services import overview
from ..state import get_store
from ..store.base import Store

router = APIRouter(prefix="/overview", tags=["overview"])


@router.get("")
def get_overview(p: Principal = Depends(require("overview:read")), store: Store = Depends(get_store)):
    return overview.build(store, p)
