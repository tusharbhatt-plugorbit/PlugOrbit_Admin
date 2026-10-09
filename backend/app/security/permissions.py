"""Role-based access control: the single source of truth.

The web app never hard-codes the role matrix. `/auth/me` returns the caller's permission
list and the UI guards on those strings, so changing a role here changes the UI too.
"""
from enum import StrEnum


class Role(StrEnum):
    SUPER_ADMIN = "super_admin"
    OPERATIONS = "operations"
    FINANCE = "finance"
    SUPPORT = "support"


ROLE_LABEL = {
    Role.SUPER_ADMIN: "Super Admin",
    Role.OPERATIONS: "Operations",
    Role.FINANCE: "Finance",
    Role.SUPPORT: "Support",
}

ROLE_SUMMARY = {
    Role.SUPER_ADMIN: "All permissions, including roles and platform settings",
    Role.OPERATIONS: "Partners, stations, connectors, pricing, data quality and charger health",
    Role.FINANCE: "Transactions, refunds, settlements and payouts",
    Role.SUPPORT: "Tickets, user help and account restrictions",
}

# Every permission that exists. Routes reference these constants, never raw strings.
PERMISSIONS: tuple[str, ...] = (
    "overview:read",
    "partners:read", "partners:write", "partners:review",
    "stations:read", "stations:write", "stations:publish", "stations:override",
    "connectors:write",
    "pricing:write",
    "transactions:read", "refunds:issue",
    "settlements:read", "settlements:run", "settlements:approve", "settlements:pay",
    "support:read", "support:write",
    "users:read", "users:restrict", "users:reveal",
    "dataquality:read", "dataquality:resolve",
    "health:read",
    "analytics:read",
    "notifications:read", "notifications:write",
    "integrations:read", "integrations:write",
    "audit:read",
    "settings:read", "settings:write",
    "roles:manage",
)

_OPERATIONS = {
    "overview:read",
    "partners:read", "partners:write", "partners:review",
    "stations:read", "stations:write", "stations:publish", "stations:override",
    "connectors:write", "pricing:write",
    "transactions:read",
    "support:read", "support:write",
    "users:read",
    "dataquality:read", "dataquality:resolve",
    "health:read", "analytics:read",
    "notifications:read", "notifications:write",
    "integrations:read",
    "audit:read", "settings:read",
}

_FINANCE = {
    "overview:read",
    "partners:read", "stations:read",
    "transactions:read", "refunds:issue",
    "settlements:read", "settlements:run", "settlements:approve", "settlements:pay",
    "support:read", "users:read",
    "analytics:read", "integrations:read",
    "audit:read", "settings:read",
}

_SUPPORT = {
    "overview:read",
    "partners:read", "stations:read",
    "transactions:read",
    "support:read", "support:write",
    "users:read", "users:restrict", "users:reveal",
    "notifications:read",
}

ROLE_PERMISSIONS: dict[Role, frozenset[str]] = {
    Role.SUPER_ADMIN: frozenset(PERMISSIONS),
    Role.OPERATIONS: frozenset(_OPERATIONS),
    Role.FINANCE: frozenset(_FINANCE),
    Role.SUPPORT: frozenset(_SUPPORT),
}

# Guards against typos: a role may only hold permissions that exist.
for _role, _perms in ROLE_PERMISSIONS.items():
    _unknown = _perms - set(PERMISSIONS)
    assert not _unknown, f"{_role} references unknown permissions {_unknown}"


def permissions_for(role: str) -> frozenset[str]:
    try:
        return ROLE_PERMISSIONS[Role(role)]
    except ValueError:
        return frozenset()
