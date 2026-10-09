from fastapi import APIRouter, Depends, Query

from ..schemas.partners import PartnerCreate, PartnerTransition, PartnerUpdate
from ..security.deps import require
from ..security.principal import Principal
from ..services import partners
from ..state import get_store
from ..store.base import Store

router = APIRouter(prefix="/partners", tags=["partners"])


@router.get("")
def list_partners(q: str | None = None, status: str | None = None, integration: str | None = None,
                  model: str | None = None, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                  p: Principal = Depends(require("partners:read")), store: Store = Depends(get_store)):
    return partners.list_partners(store, p, q=q, status=status, integration=integration, model=model, limit=limit, offset=offset)


@router.post("", status_code=201)
def create_partner(body: PartnerCreate, p: Principal = Depends(require("partners:write")), store: Store = Depends(get_store)):
    return partners.create(store, p, body)


@router.get("/{partner_id}")
def get_partner(partner_id: str, p: Principal = Depends(require("partners:read")), store: Store = Depends(get_store)):
    return partners.get_partner(store, p, partner_id)


@router.put("/{partner_id}")
def update_partner(partner_id: str, body: PartnerUpdate, p: Principal = Depends(require("partners:write")),
                   store: Store = Depends(get_store)):
    return partners.update(store, p, partner_id, body)


@router.post("/{partner_id}/transition")
def transition_partner(partner_id: str, body: PartnerTransition, p: Principal = Depends(require("partners:write")),
                       store: Store = Depends(get_store)):
    return partners.transition(store, p, partner_id, body)
