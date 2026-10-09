"""The only persistence interface services talk to.

Two implementations: `MemoryStore` (demo/dev/tests) and `FirestoreStore` (real). Services
never import firebase_admin, so the whole domain is testable without credentials.

Design notes
* Documents are plain dicts. `id` is the document id and is always present on reads.
* `list` supports **equality filters only**, executed server-side in Firestore (equality-only
  queries need no composite index). Range filters, ordering and paging happen in the service
  layer, which is fine for Phase 1 volumes; see docs/ARCHITECTURE.md ("Scaling path").
"""
from collections.abc import Callable
from typing import Any, Protocol


class AlreadyExists(Exception):
    pass


class Missing(Exception):
    pass


Doc = dict[str, Any]


class Store(Protocol):
    name: str  # "memory" | "firestore", reported by /meta

    def get(self, coll: str, doc_id: str) -> Doc | None: ...

    def list(self, coll: str, where: dict[str, Any] | None = None) -> list[Doc]: ...

    def create(self, coll: str, doc_id: str, data: Doc) -> Doc:
        """Insert; raises AlreadyExists."""

    def set(self, coll: str, doc_id: str, data: Doc) -> Doc:
        """Replace (upsert)."""

    def update(self, coll: str, doc_id: str, patch: Doc) -> Doc:
        """Shallow-merge `patch`; raises Missing."""

    def delete(self, coll: str, doc_id: str) -> None: ...

    def next_seq(self, name: str) -> int:
        """Atomic counter (ticket numbers, etc.)."""

    def append_audit(self, build: Callable[[Doc | None], Doc]) -> Doc:
        """Atomically read the audit chain head, build the next entry from it and write
        both. `build` receives {"seq", "hash"} (or None for the first entry) and returns the
        entry, which must carry `seq` and `hash`. The entry id is the zero-padded seq."""
