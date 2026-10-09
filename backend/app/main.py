import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings, validate_for_environment
from .errors import register_error_handlers
from .firebase import get_firestore_client, init_firebase
from .routes import api_router
from .services import gateway as gateway_service
from .state import RequestContext, request_context, set_store
from .store.base import Store
from .store.firestore import FirestoreStore
from .store.memory import MemoryStore

log = logging.getLogger("plugorbit.admin")


def build_store(settings: Settings, firebase_ok: bool) -> Store:
    mode = settings.data_backend
    if mode == "firestore" and not firebase_ok:
        raise RuntimeError("DATA_BACKEND=firestore but Firebase Admin could not be initialised "
                           "(is serviceAccountKey.json present?).")
    if mode == "firestore" or (mode == "auto" and firebase_ok):
        return FirestoreStore(get_firestore_client())
    return MemoryStore()


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    firebase_ok = init_firebase()
    store = build_store(settings, firebase_ok)
    problems = validate_for_environment(settings, firestore_active=store.name == "firestore")
    if problems:
        raise RuntimeError("Unsafe configuration for ENVIRONMENT=%s:\n - %s" % (settings.environment, "\n - ".join(problems)))
    set_store(store)
    if store.name == "memory":
        from .seed import load_demo_data

        log.warning("Using the IN-MEMORY DEMO store. Data resets on restart and is clearly marked as demo.")
        if settings.seed_demo_data:
            load_demo_data(store, dev_admins=settings.admin_dev_auth)
        gateway_service.set_gateway(gateway_service.SimulatedGateway())
    if settings.admin_dev_auth:
        log.warning("ADMIN_DEV_AUTH is ON: demo sign-in is available. Never enable this in production.")
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="PlugOrbit Admin API", version="1.0.0", lifespan=lifespan,
                  docs_url="/docs" if not settings.is_production_like else None,
                  redoc_url=None, openapi_url="/openapi.json" if not settings.is_production_like else None)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID", "X-PlugOrbit-Source"],
        expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def request_scope(request: Request, call_next):
        rid = (request.headers.get("x-request-id") or uuid.uuid4().hex[:12])[:40]
        source = (request.headers.get("x-plugorbit-source") or "admin-web")[:30]
        token = request_context.set(RequestContext(request_id=rid, source=source))
        try:
            response = await call_next(request)
        finally:
            request_context.reset(token)
        response.headers["X-Request-ID"] = rid
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"  # admin data must never sit in a shared cache
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    register_error_handlers(app)
    app.include_router(api_router)

    @app.get("/health", tags=["health"])
    def health():
        return {"status": "ok"}

    return app


app = create_app()
