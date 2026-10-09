"""Shared fixtures. Every test gets a fresh seeded in-memory store and a simulated gateway, so
no test needs Firebase credentials or the network."""
import pytest
from fastapi.testclient import TestClient

from app import config as config_module
from app.main import app
from app.seed import load_demo_data
from app.services import gateway as gateway_service
from app.state import set_store
from app.store.memory import MemoryStore


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    monkeypatch.setenv("ADMIN_DEV_AUTH", "true")
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("DATA_BACKEND", "memory")
    config_module.get_settings.cache_clear()
    yield
    config_module.get_settings.cache_clear()


@pytest.fixture
def store():
    s = MemoryStore()
    set_store(s)
    load_demo_data(s)
    gateway_service.set_gateway(gateway_service.SimulatedGateway())
    yield s
    set_store(None)
    gateway_service.set_gateway(gateway_service.NotConfiguredGateway())


@pytest.fixture
def client(store):
    return TestClient(app, raise_server_exceptions=False)


class Admin:
    """A signed-in role with ergonomic verbs that return the raw response."""

    def __init__(self, client: TestClient, role: str):
        r = client.post("/admin/v1/auth/dev-login", json={"role": role})
        assert r.status_code == 200, r.text
        self.client, self.role = client, role
        self.headers = {"Authorization": f"Bearer {r.json()['token']}"}

    def _call(self, method, path, **kw):
        return getattr(self.client, method)("/admin/v1" + path, headers={**self.headers, **kw.pop("headers", {})}, **kw)

    def get(self, path, **kw):
        return self._call("get", path, **kw)

    def post(self, path, json=None, **kw):
        return self._call("post", path, json=json, **kw)

    def put(self, path, json=None, **kw):
        return self._call("put", path, json=json, **kw)

    def patch(self, path, json=None, **kw):
        return self._call("patch", path, json=json, **kw)

    def delete(self, path, **kw):
        return self._call("delete", path, **kw)


@pytest.fixture
def sa(client):
    return Admin(client, "super_admin")


@pytest.fixture
def ops(client):
    return Admin(client, "operations")


@pytest.fixture
def fin(client):
    return Admin(client, "finance")


@pytest.fixture
def sup(client):
    return Admin(client, "support")


def code(resp) -> str:
    """The machine-readable error code from the shared error envelope."""
    return resp.json()["detail"]["code"]
