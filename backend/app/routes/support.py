from fastapi import APIRouter, Depends, Query

from ..schemas.ops import TicketCreate, TicketNote, TicketUpdate
from ..security.deps import require
from ..security.principal import Principal
from ..services import support
from ..state import get_store
from ..store.base import Store

router = APIRouter(prefix="/tickets", tags=["support"])


@router.get("")
def list_tickets(q: str | None = None, status: str | None = None, category: str | None = None,
                 priority: str | None = None, ownerId: str | None = None, stationId: str | None = None,
                 userId: str | None = None, sessionId: str | None = None,
                 limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                 _: Principal = Depends(require("support:read")), store: Store = Depends(get_store)):
    return support.list_tickets(store, q=q, status=status, category=category, priority=priority, owner_id=ownerId,
                                station_id=stationId, user_id=userId, session_id=sessionId, limit=limit, offset=offset)


@router.post("", status_code=201)
def create_ticket(body: TicketCreate, p: Principal = Depends(require("support:write")), store: Store = Depends(get_store)):
    return support.create(store, p, body)


@router.get("/{ticket_id}")
def get_ticket(ticket_id: str, _: Principal = Depends(require("support:read")), store: Store = Depends(get_store)):
    return support.get_ticket(store, ticket_id)


@router.patch("/{ticket_id}")
def update_ticket(ticket_id: str, body: TicketUpdate, p: Principal = Depends(require("support:write")),
                  store: Store = Depends(get_store)):
    return support.update(store, p, ticket_id, body)


@router.post("/{ticket_id}/notes", status_code=201)
def add_note(ticket_id: str, body: TicketNote, p: Principal = Depends(require("support:write")),
             store: Store = Depends(get_store)):
    return support.add_note(store, p, ticket_id, body)
