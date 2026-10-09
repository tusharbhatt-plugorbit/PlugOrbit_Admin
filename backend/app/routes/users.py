from fastapi import APIRouter, Depends, Query

from ..schemas.ops import UserRestrict
from ..security.deps import require
from ..security.principal import Principal
from ..services import transactions, users
from ..state import get_store
from ..store.base import Store

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
def list_users(q: str | None = None, status: str | None = None, unpaid: bool = False,
               limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
               _: Principal = Depends(require("users:read")), store: Store = Depends(get_store)):
    return users.list_users(store, q=q, status=status, unpaid=unpaid, limit=limit, offset=offset)


@router.get("/{user_id}")
def get_user(user_id: str, _: Principal = Depends(require("users:read")), store: Store = Depends(get_store)):
    return users.get_user(store, user_id)


@router.get("/{user_id}/sessions")
def user_sessions(user_id: str, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                  _: Principal = Depends(require("users:read", "transactions:read")), store: Store = Depends(get_store)):
    return transactions.list_sessions(store, q=None, status=None, mode=None, station_id=None, user_id=user_id,
                                      partner_id=None, since=None, until=None, limit=limit, offset=offset)


@router.post("/{user_id}/restrict")
def restrict(user_id: str, body: UserRestrict, p: Principal = Depends(require("users:restrict")), store: Store = Depends(get_store)):
    return users.restrict(store, p, user_id, body.reason)


@router.post("/{user_id}/unrestrict")
def unrestrict(user_id: str, body: UserRestrict, p: Principal = Depends(require("users:restrict")), store: Store = Depends(get_store)):
    return users.unrestrict(store, p, user_id, body.reason)


@router.post("/{user_id}/reveal")
def reveal(user_id: str, body: UserRestrict, p: Principal = Depends(require("users:reveal")), store: Store = Depends(get_store)):
    return users.reveal(store, p, user_id, body.reason)
