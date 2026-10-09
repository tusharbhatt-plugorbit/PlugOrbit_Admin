"""Pricing. A price change is a new, immutable version; nothing is ever overwritten, so
"what did this station charge on 3 March?" always has an answer, and every change records
who made it and the previous values."""
from ..domain import clock
from ..errors import conflict, invalid
from ..schemas.stations import TariffCreate
from ..security.principal import Principal
from ..store.base import Store
from . import audit
from .colls import CONNECTORS, STATIONS, TARIFFS
from .common import must_get

PRICE_FIELDS = ("pricePerKwh", "pricePerMin", "pricePerSession", "parkingFeePerHour", "idleFeePerMin", "gstPercent")
PAST_SKEW_MS = 60_000
LARGE_CHANGE = 0.5


def station_tariffs(store: Store, station_id: str) -> list[dict]:
    rows = store.list(TARIFFS, {"stationId": station_id})
    rows.sort(key=lambda t: (t["effectiveFrom"], t["createdAt"]), reverse=True)
    return rows


def active_tariff(tariffs: list[dict], connector_id: str | None, at: int) -> dict | None:
    """The version in force at `at` for a connector (or for the station-wide scope when None).
    Latest effectiveFrom wins; on a tie a connector-specific price beats a station-wide one."""
    best: dict | None = None
    for t in tariffs:
        if t.get("status") == "cancelled" or t["effectiveFrom"] > at:
            continue
        if connector_id is None:
            if t.get("connectorId") is not None:
                continue
        elif t.get("connectorId") not in (None, connector_id):
            continue
        key = (t["effectiveFrom"], t.get("connectorId") is not None)
        if best is None or key > (best["effectiveFrom"], best.get("connectorId") is not None):
            best = t
    return best


def snapshot(tariff: dict | None) -> dict | None:
    if tariff is None:
        return None
    return {**{k: tariff.get(k) for k in PRICE_FIELDS}, "tariffId": tariff["id"], "effectiveFrom": tariff["effectiveFrom"]}


def history(store: Store, station_id: str) -> dict:
    must_get(store, STATIONS, station_id, "Station")
    now = clock.now_ms()
    tariffs = station_tariffs(store, station_id)
    connectors = store.list(CONNECTORS, {"stationId": station_id})
    active_ids = {t["id"] for t in (
        [active_tariff(tariffs, None, now)] + [active_tariff(tariffs, c["id"], now) for c in connectors]
    ) if t}
    items = []
    for t in tariffs:
        if t.get("status") == "cancelled":
            state = "cancelled"
        elif t["effectiveFrom"] > now:
            state = "scheduled"
        elif t["id"] in active_ids:
            state = "active"
        else:
            state = "superseded"
        items.append({**t, "state": state})
    current = {c["id"]: snapshot(active_tariff(tariffs, c["id"], now)) for c in connectors}
    return {"items": items, "current": current, "stationWide": snapshot(active_tariff(tariffs, None, now))}


def create(store: Store, principal: Principal, station_id: str, body: TariffCreate) -> dict:
    station = must_get(store, STATIONS, station_id, "Station")
    now = clock.now_ms()
    connector = None
    if body.connectorId:
        connector = must_get(store, CONNECTORS, body.connectorId, "Connector")
        if connector["stationId"] != station_id:
            raise invalid("That connector belongs to a different station.", "CONNECTOR_MISMATCH")
    effective = body.effectiveFrom if body.effectiveFrom is not None else now
    if effective < now - PAST_SKEW_MS:
        raise invalid("A new price cannot start in the past: sessions already billed would not match. "
                      "Choose now or a future time.", "PRICE_IN_PAST")

    tariffs = station_tariffs(store, station_id)
    previous = snapshot(active_tariff(tariffs, body.connectorId, max(effective, now)))
    if previous and previous["pricePerKwh"]:
        change = abs(body.pricePerKwh - previous["pricePerKwh"]) / previous["pricePerKwh"]
        if change > LARGE_CHANGE and not body.confirmLargeChange:
            raise conflict(
                "LARGE_PRICE_CHANGE",
                f"This moves the energy price by {round(change * 100)}% "
                f"(₹{previous['pricePerKwh']} → ₹{body.pricePerKwh} per kWh). Confirm to continue.",
                previous=previous["pricePerKwh"], proposed=body.pricePerKwh,
            )

    new_values = {k: getattr(body, k) for k in PRICE_FIELDS}
    tariff_id = clock.new_id("tf")
    doc = store.create(TARIFFS, tariff_id, {
        "stationId": station_id, "connectorId": body.connectorId, **new_values,
        "effectiveFrom": effective, "reason": body.reason, "previous": previous,
        "createdAt": now, "createdBy": principal.uid, "createdByName": principal.name,
    })  # `status` is only ever written as "cancelled"; scheduled/active/superseded are derived on read
    scope = f"connector {connector['label']}" if connector else "all connectors"
    audit.record(
        principal, "tariff.create", "station", station_id, label=f"{station['name']} · {scope}",
        before=None if previous is None else {k: previous[k] for k in PRICE_FIELDS},
        after={**new_values, "effectiveFrom": effective}, reason=body.reason,
    )
    return doc


def cancel_scheduled(store: Store, principal: Principal, tariff_id: str, reason: str) -> dict:
    tariff = must_get(store, TARIFFS, tariff_id, "Price")
    now = clock.now_ms()
    if tariff.get("status") == "cancelled" or tariff["effectiveFrom"] <= now:
        raise conflict("NOT_SCHEDULED", "Only a price that has not started yet can be cancelled.")
    saved = store.update(TARIFFS, tariff_id, {"status": "cancelled", "cancelledBy": principal.uid, "cancelledAt": now})
    station = store.get(STATIONS, tariff["stationId"]) or {"name": tariff["stationId"]}
    audit.record(principal, "tariff.cancel", "station", tariff["stationId"], label=station["name"],
                 before={"effectiveFrom": tariff["effectiveFrom"], "pricePerKwh": tariff["pricePerKwh"]},
                 after={"status": "cancelled"}, reason=reason)
    return saved
