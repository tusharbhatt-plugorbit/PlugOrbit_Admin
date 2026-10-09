from fastapi import APIRouter, Depends, Header, Query

from ..schemas.money import RefundRequest
from ..security.deps import require
from ..security.principal import Principal
from ..services import transactions
from ..state import get_store
from ..store.base import Store

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("")
def list_transactions(q: str | None = None, status: str | None = None, mode: str | None = None,
                      stationId: str | None = None, userId: str | None = None, partnerId: str | None = None,
                      since: int | None = None, until: int | None = None,
                      limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                      _: Principal = Depends(require("transactions:read")), store: Store = Depends(get_store)):
    return transactions.list_sessions(store, q=q, status=status, mode=mode, station_id=stationId, user_id=userId,
                                      partner_id=partnerId, since=since, until=until, limit=limit, offset=offset)


@router.get("/{session_id}")
def get_transaction(session_id: str, _: Principal = Depends(require("transactions:read")), store: Store = Depends(get_store)):
    return transactions.get_session(store, session_id)


@router.post("/{session_id}/refund")
def refund(session_id: str, body: RefundRequest, idempotency_key: str | None = Header(default=None),
           p: Principal = Depends(require("refunds:issue")), store: Store = Depends(get_store)):
    return transactions.refund(store, p, session_id, body, idempotency_key)
