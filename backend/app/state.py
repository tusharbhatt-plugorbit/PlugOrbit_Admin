"""Process-wide handles (the store) and the per-request context used by the audit trail."""
from contextvars import ContextVar
from dataclasses import dataclass

from .store.base import Store

_store: Store | None = None


def set_store(store: Store | None) -> None:
    global _store
    _store = store


def get_store() -> Store:
    if _store is None:
        raise RuntimeError("Store is not initialised (app lifespan has not run).")
    return _store


@dataclass
class RequestContext:
    request_id: str = "-"
    source: str = "api"


request_context: ContextVar[RequestContext] = ContextVar("request_context", default=RequestContext())
