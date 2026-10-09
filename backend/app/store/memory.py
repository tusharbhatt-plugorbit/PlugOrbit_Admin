import copy
import threading
from collections.abc import Callable
from typing import Any

from .base import AlreadyExists, Doc, Missing


class MemoryStore:
    name = "memory"

    def __init__(self) -> None:
        self._data: dict[str, dict[str, Doc]] = {}
        self._counters: dict[str, int] = {}
        self._head: Doc | None = None
        self._lock = threading.RLock()

    # -- helpers ---------------------------------------------------------------------
    @staticmethod
    def _out(doc_id: str, data: Doc) -> Doc:
        out = copy.deepcopy(data)
        out["id"] = doc_id
        return out

    @staticmethod
    def _in(data: Doc) -> Doc:
        stored = copy.deepcopy(data)
        stored.pop("id", None)
        return stored

    # -- Store -----------------------------------------------------------------------
    def get(self, coll: str, doc_id: str) -> Doc | None:
        with self._lock:
            data = self._data.get(coll, {}).get(doc_id)
            return None if data is None else self._out(doc_id, data)

    def list(self, coll: str, where: dict[str, Any] | None = None) -> list[Doc]:
        with self._lock:
            rows = self._data.get(coll, {})
            return [
                self._out(i, d)
                for i, d in rows.items()
                if all(d.get(k) == v for k, v in (where or {}).items())
            ]

    def create(self, coll: str, doc_id: str, data: Doc) -> Doc:
        with self._lock:
            rows = self._data.setdefault(coll, {})
            if doc_id in rows:
                raise AlreadyExists(f"{coll}/{doc_id}")
            rows[doc_id] = self._in(data)
            return self._out(doc_id, rows[doc_id])

    def set(self, coll: str, doc_id: str, data: Doc) -> Doc:
        with self._lock:
            self._data.setdefault(coll, {})[doc_id] = self._in(data)
            return self._out(doc_id, self._data[coll][doc_id])

    def update(self, coll: str, doc_id: str, patch: Doc) -> Doc:
        with self._lock:
            rows = self._data.get(coll, {})
            if doc_id not in rows:
                raise Missing(f"{coll}/{doc_id}")
            rows[doc_id].update(self._in(patch))
            return self._out(doc_id, rows[doc_id])

    def delete(self, coll: str, doc_id: str) -> None:
        with self._lock:
            self._data.get(coll, {}).pop(doc_id, None)

    def next_seq(self, name: str) -> int:
        with self._lock:
            self._counters[name] = self._counters.get(name, 0) + 1
            return self._counters[name]

    def seed_counter(self, name: str, value: int) -> None:
        with self._lock:
            self._counters[name] = max(self._counters.get(name, 0), value)

    def append_audit(self, build: Callable[[Doc | None], Doc]) -> Doc:
        with self._lock:
            entry = build(copy.deepcopy(self._head))
            self._data.setdefault("audit", {})[f"{entry['seq']:010d}"] = self._in(entry)
            self._head = {"seq": entry["seq"], "hash": entry["hash"]}
            return self._out(f"{entry['seq']:010d}", entry)
