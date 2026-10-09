from fastapi import APIRouter, Depends, Query, Response

from ..schemas.stations import (ConnectorClearOverride, ConnectorCreate, ConnectorOverride, ConnectorUpdate,
                                StationCreate, StationReason, StationStatusOverride, StationUpdate, TariffCreate)
from ..security.deps import require
from ..security.principal import Principal
from ..services import stations, tariffs
from ..state import get_store
from ..store.base import Store

router = APIRouter(tags=["stations"])


# ------------------------------------------------------------------------ stations --
@router.get("/stations")
def list_stations(q: str | None = None, partnerId: str | None = None, status: str = "all",
                  publication: str | None = None, city: str | None = None, source: str | None = None,
                  sort: str = "name", limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                  _: Principal = Depends(require("stations:read")), store: Store = Depends(get_store)):
    return stations.list_stations(store, q=q, partner_id=partnerId, status=status, publication=publication,
                                  city=city, source=source, limit=limit, offset=offset, sort=sort)


@router.post("/stations", status_code=201)
def create_station(body: StationCreate, p: Principal = Depends(require("stations:write")), store: Store = Depends(get_store)):
    return stations.create(store, p, body)


@router.get("/stations/{station_id}")
def get_station(station_id: str, _: Principal = Depends(require("stations:read")), store: Store = Depends(get_store)):
    return stations.get_station(store, station_id)


@router.put("/stations/{station_id}")
def update_station(station_id: str, body: StationUpdate, p: Principal = Depends(require("stations:write")),
                   store: Store = Depends(get_store)):
    return stations.update(store, p, station_id, body)


@router.post("/stations/{station_id}/publish")
def publish_station(station_id: str, p: Principal = Depends(require("stations:publish")), store: Store = Depends(get_store)):
    return stations.publish(store, p, station_id)


@router.post("/stations/{station_id}/hide")
def hide_station(station_id: str, body: StationReason, p: Principal = Depends(require("stations:publish")),
                 store: Store = Depends(get_store)):
    return stations.hide(store, p, station_id, body.reason)


@router.post("/stations/{station_id}/status")
def override_station(station_id: str, body: StationStatusOverride, p: Principal = Depends(require("stations:override")),
                     store: Store = Depends(get_store)):
    return stations.override_station(store, p, station_id, body)


@router.delete("/stations/{station_id}/status")
def clear_station_override(station_id: str, p: Principal = Depends(require("stations:override")),
                           store: Store = Depends(get_store)):
    return stations.clear_station_override(store, p, station_id, None)


# ---------------------------------------------------------------------- connectors --
@router.get("/stations/{station_id}/connectors")
def list_connectors(station_id: str, _: Principal = Depends(require("stations:read")), store: Store = Depends(get_store)):
    return {"items": stations.list_connectors(store, station_id)}


@router.post("/stations/{station_id}/connectors", status_code=201)
def create_connector(station_id: str, body: ConnectorCreate, p: Principal = Depends(require("connectors:write")),
                     store: Store = Depends(get_store)):
    return stations.create_connector(store, p, station_id, body)


@router.put("/connectors/{connector_id}")
def update_connector(connector_id: str, body: ConnectorUpdate, p: Principal = Depends(require("connectors:write")),
                     store: Store = Depends(get_store)):
    return stations.update_connector(store, p, connector_id, body)


@router.delete("/connectors/{connector_id}", status_code=204)
def delete_connector(connector_id: str, p: Principal = Depends(require("connectors:write")), store: Store = Depends(get_store)):
    stations.delete_connector(store, p, connector_id)
    return Response(status_code=204)


@router.post("/connectors/{connector_id}/override")
def override_connector(connector_id: str, body: ConnectorOverride, p: Principal = Depends(require("stations:override")),
                       store: Store = Depends(get_store)):
    return stations.set_override(store, p, connector_id, body)


@router.delete("/connectors/{connector_id}/override")
def clear_connector_override(connector_id: str, p: Principal = Depends(require("stations:override")),
                             store: Store = Depends(get_store)):
    return stations.clear_override(store, p, connector_id, ConnectorClearOverride())


# ------------------------------------------------------------------------- pricing --
@router.get("/stations/{station_id}/tariffs")
def tariff_history(station_id: str, _: Principal = Depends(require("stations:read")), store: Store = Depends(get_store)):
    return tariffs.history(store, station_id)


@router.post("/stations/{station_id}/tariffs", status_code=201)
def create_tariff(station_id: str, body: TariffCreate, p: Principal = Depends(require("pricing:write")),
                  store: Store = Depends(get_store)):
    return tariffs.create(store, p, station_id, body)


@router.post("/tariffs/{tariff_id}/cancel")
def cancel_tariff(tariff_id: str, body: StationReason, p: Principal = Depends(require("pricing:write")),
                  store: Store = Depends(get_store)):
    return tariffs.cancel_scheduled(store, p, tariff_id, body.reason)


# ----------------------------------------------------------------------------- map --
@router.get("/map/stations")
def map_stations(partnerId: str | None = None, city: str | None = None, connectorType: str | None = None,
                 minPowerKw: float | None = None, status: str = "all", source: str | None = None, q: str | None = None,
                 _: Principal = Depends(require("stations:read")), store: Store = Depends(get_store)):
    return stations.map_rows(store, partner_id=partnerId, city=city, connector_type=connectorType,
                             min_power=minPowerKw, status=status, source=source, q=q)
