import pytest

from app import config as config_module
from app.config import Settings, validate_for_environment
from app.security import tokens
from app.security.permissions import PERMISSIONS, ROLE_PERMISSIONS, Role

from .conftest import Admin, code


def test_anonymous_requests_are_rejected(client):
    r = client.get("/admin/v1/partners")
    assert r.status_code == 401 and code(r) == "MISSING_TOKEN"


def test_garbage_and_expired_tokens_are_rejected(client):
    r = client.get("/admin/v1/partners", headers={"Authorization": "Bearer dev.abc.def"})
    assert r.status_code == 401 and code(r) == "INVALID_TOKEN"
    expired = tokens.issue("dev-super", ttl_seconds=-5)
    r = client.get("/admin/v1/partners", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401


def test_dev_login_is_refused_when_disabled(client, monkeypatch):
    monkeypatch.setenv("ADMIN_DEV_AUTH", "false")
    config_module.get_settings.cache_clear()
    r = client.post("/admin/v1/auth/dev-login", json={"role": "super_admin"})
    assert r.status_code == 403 and code(r) == "DEV_AUTH_DISABLED"
    # and a previously-issued dev token no longer works either
    assert tokens.verify(tokens.issue("dev-super")) is None


def test_me_returns_the_server_side_permission_list(client):
    me = Admin(client, "support").get("/auth/me").json()["principal"]
    assert me["role"] == "support" and "refunds:issue" not in me["permissions"]
    assert "support:write" in me["permissions"]


@pytest.mark.parametrize("who,method,path,body", [
    ("support", "post", "/transactions/PO-6A4K92/refund", {"reason": "test", "amount": 10}),
    ("finance", "post", "/partners", {}),
    ("operations", "post", "/settlements/stl-x/approve", None),
    ("support", "put", "/config", {}),
    ("finance", "post", "/admins", {"email": "a@b.co", "name": "Ab", "role": "support"}),
    ("operations", "post", "/users/usr-1000/restrict", {"reason": "nope nope"}),
])
def test_roles_cannot_do_what_they_do_not_hold(client, who, method, path, body):
    r = getattr(Admin(client, who), method)(path, body) if body is not None or method != "post" else Admin(client, who).post(path)
    assert r.status_code == 403 and code(r) == "FORBIDDEN"


def test_support_can_work_tickets_but_not_see_audit(sup):
    assert sup.get("/tickets").status_code == 200
    assert sup.get("/audit").status_code == 403
    assert sup.get("/overview").json()["recentActivity"] == []  # overview hides activity it may not read


def test_every_role_only_holds_real_permissions():
    for role, perms in ROLE_PERMISSIONS.items():
        assert perms <= set(PERMISSIONS), role
    assert ROLE_PERMISSIONS[Role.SUPER_ADMIN] == set(PERMISSIONS)


def test_disabled_admin_is_locked_out_immediately(sa, client):
    other = Admin(client, "operations")
    assert other.get("/stations").status_code == 200
    r = sa.patch("/admins/dev-ops", {"status": "disabled", "reason": "Left the company"})
    assert r.status_code == 200
    r = other.get("/stations")
    assert r.status_code == 403 and code(r) == "ADMIN_DISABLED"


def test_production_refuses_unsafe_settings():
    unsafe = Settings(environment="production", admin_dev_auth=True, data_backend="memory", cors_origins=["*"])
    problems = validate_for_environment(unsafe, firestore_active=False)
    assert len(problems) == 3
    safe = Settings(environment="production", admin_dev_auth=False, data_backend="firestore", cors_origins=["https://admin.plugorbit.in"])
    assert validate_for_environment(safe, firestore_active=True) == []


def test_error_envelope_matches_the_mobile_backend(client):
    r = client.get("/admin/v1/nope")
    assert r.status_code == 404 and set(r.json()["detail"]) >= {"code", "message"}
    r = Admin(client, "super_admin").post("/partners", {"legalName": "x"})
    assert r.status_code == 422 and code(r) == "VALIDATION_ERROR" and "fields" in r.json()["detail"]


def test_security_headers_and_request_id(client):
    r = client.get("/health")
    assert r.headers["cache-control"] == "no-store" and r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-request-id"]
