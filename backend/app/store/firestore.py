"""Firestore implementation of the Store interface.

NOTE: this adapter is intentionally thin and is exercised against a live project only when
deployed; unit tests run the same services against MemoryStore. See docs/TESTING.md.
"""
from collections.abc import Callable
from typing import Any

from firebase_admin import firestore
from google.api_core import exceptions as gexc
from google.cloud.firestore_v1.base_query import FieldFilter

from .base import AlreadyExists, Doc, Missing

COUNTERS = "counters"
META = "meta"
AUDIT_HEAD = "audit_head"


class FirestoreStore:
    name = "firestore"

    def __init__(self, client) -> None:
        self.db = client

    @staticmethod
    def _out(snap) -> Doc:
        data = snap.to_dict() or {}
        data["id"] = snap.id
        return data

    @staticmethod
    def _in(data: Doc) -> Doc:
        stored = dict(data)
        stored.pop("id", None)
        return stored

    def get(self, coll: str, doc_id: str) -> Doc | None:
        snap = self.db.collection(coll).document(doc_id).get()
        return self._out(snap) if snap.exists else None

    def list(self, coll: str, where: dict[str, Any] | None = None) -> list[Doc]:
        query = self.db.collection(coll)
        for key, value in (where or {}).items():
            query = query.where(filter=FieldFilter(key, "==", value))
        return [self._out(s) for s in query.stream()]

    def create(self, coll: str, doc_id: str, data: Doc) -> Doc:
        try:
            self.db.collection(coll).document(doc_id).create(self._in(data))
        except gexc.AlreadyExists as exc:
            raise AlreadyExists(f"{coll}/{doc_id}") from exc
        return {**self._in(data), "id": doc_id}

    def set(self, coll: str, doc_id: str, data: Doc) -> Doc:
        self.db.collection(coll).document(doc_id).set(self._in(data))
        return {**self._in(data), "id": doc_id}

    def update(self, coll: str, doc_id: str, patch: Doc) -> Doc:
        ref = self.db.collection(coll).document(doc_id)
        try:
            ref.update(self._in(patch))
        except gexc.NotFound as exc:
            raise Missing(f"{coll}/{doc_id}") from exc
        return self._out(ref.get())

    def delete(self, coll: str, doc_id: str) -> None:
        self.db.collection(coll).document(doc_id).delete()

    def next_seq(self, name: str) -> int:
        ref = self.db.collection(COUNTERS).document(name)

        @firestore.transactional
        def bump(txn):
            snap = ref.get(transaction=txn)
            value = (snap.to_dict() or {}).get("value", 0) + 1
            txn.set(ref, {"value": value})
            return value

        return bump(self.db.transaction())

    def append_audit(self, build: Callable[[Doc | None], Doc]) -> Doc:
        head_ref = self.db.collection(META).document(AUDIT_HEAD)

        @firestore.transactional
        def write(txn):
            snap = head_ref.get(transaction=txn)
            head = snap.to_dict() if snap.exists else None
            entry = build(head)
            doc_id = f"{entry['seq']:010d}"
            txn.set(self.db.collection("audit").document(doc_id), self._in(entry))
            txn.set(head_ref, {"seq": entry["seq"], "hash": entry["hash"]})
            return {**self._in(entry), "id": doc_id}

        return write(self.db.transaction())
