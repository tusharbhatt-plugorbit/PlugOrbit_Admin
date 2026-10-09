"""Small reference lists for filter dropdowns and pickers (one call instead of one per screen)."""
from ..store.base import Store
from . import admins
from .colls import PARTNERS, STATIONS


def build(store: Store) -> dict:
    partners = sorted(({"id": p["id"], "name": p.get("displayName") or p["legalName"], "status": p["status"]}
                       for p in store.list(PARTNERS)), key=lambda p: p["name"].lower())
    stations = [s for s in store.list(STATIONS) if not s.get("mergedInto")]
    return {
        "partners": partners,
        "cities": sorted({s["city"] for s in stations}),
        "stations": sorted(({"id": s["id"], "name": s["name"]} for s in stations), key=lambda s: s["name"].lower()),
        "admins": admins.directory(store),
    }
