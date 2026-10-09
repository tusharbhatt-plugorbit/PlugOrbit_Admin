from fastapi import APIRouter, Depends, Query

from ..security.deps import require
from ..security.principal import Principal
from ..services import audit

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("")
def list_audit(actor: str | None = None, action: str | None = None, category: str | None = None,
               entityType: str | None = None, entityId: str | None = None, q: str | None = None,
               since: int | None = None, until: int | None = None, beforeSeq: int | None = None,
               limit: int = Query(50, ge=1, le=200), _: Principal = Depends(require("audit:read"))):
    return audit.list_entries(actor=actor, action=action, category=category, entity_type=entityType,
                              entity_id=entityId, q=q, since=since, until=until, before_seq=beforeSeq, limit=limit)


@router.get("/verify")
def verify(_: Principal = Depends(require("audit:read"))):
    """Recompute the hash chain. ok=false means a historical entry was altered or removed."""
    return audit.verify()


@router.get("/catalog")
def catalog(_: Principal = Depends(require("audit:read"))):
    return audit.catalog()
