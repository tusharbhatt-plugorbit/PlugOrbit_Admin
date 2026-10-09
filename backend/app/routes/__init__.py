from fastapi import APIRouter

from . import (analytics, audit, auth, dataquality, health, integrations, meta, notifications, overview,
               partners, settings, settlements, stations, support, transactions, users)

# Everything lives under /admin/v1 so a reverse proxy / Firebase Hosting rewrite can route one prefix.
api_router = APIRouter(prefix="/admin/v1")
for module in (meta, auth, overview, partners, stations, transactions, settlements, support, users,
               dataquality, health, analytics, notifications, integrations, audit, settings):
    api_router.include_router(module.router)
