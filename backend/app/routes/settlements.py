from fastapi import APIRouter, Depends, Query

from ..schemas.money import SettlementAdjustment, SettlementHold, SettlementPaid, SettlementRun
from ..security.deps import require
from ..security.principal import Principal
from ..services import settlements
from ..state import get_store
from ..store.base import Store

router = APIRouter(prefix="/settlements", tags=["settlements"])


@router.get("")
def list_settlements(partnerId: str | None = None, status: str | None = None, limit: int = Query(50, ge=1, le=200),
                     offset: int = Query(0, ge=0), _: Principal = Depends(require("settlements:read")),
                     store: Store = Depends(get_store)):
    return settlements.list_settlements(store, partner_id=partnerId, status=status, limit=limit, offset=offset)


@router.post("/run", status_code=201)
def run_settlement(body: SettlementRun, p: Principal = Depends(require("settlements:run")), store: Store = Depends(get_store)):
    return settlements.run(store, p, body)


@router.get("/{settlement_id}")
def get_settlement(settlement_id: str, _: Principal = Depends(require("settlements:read")), store: Store = Depends(get_store)):
    return settlements.get(store, settlement_id)


@router.post("/{settlement_id}/adjustments")
def adjust(settlement_id: str, body: SettlementAdjustment, p: Principal = Depends(require("settlements:run")),
           store: Store = Depends(get_store)):
    return settlements.adjust(store, p, settlement_id, body)


@router.post("/{settlement_id}/approve")
def approve(settlement_id: str, p: Principal = Depends(require("settlements:approve")), store: Store = Depends(get_store)):
    return settlements.approve(store, p, settlement_id)


@router.post("/{settlement_id}/hold")
def hold(settlement_id: str, body: SettlementHold, p: Principal = Depends(require("settlements:approve")),
         store: Store = Depends(get_store)):
    return settlements.hold(store, p, settlement_id, body)


@router.post("/{settlement_id}/paid")
def paid(settlement_id: str, body: SettlementPaid, p: Principal = Depends(require("settlements:pay")),
         store: Store = Depends(get_store)):
    return settlements.mark_paid(store, p, settlement_id, body)
