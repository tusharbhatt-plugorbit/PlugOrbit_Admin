from dataclasses import dataclass, field

from .permissions import ROLE_LABEL, Role, permissions_for


@dataclass(frozen=True)
class Principal:
    uid: str
    email: str | None
    name: str
    role: str
    permissions: frozenset[str] = field(default_factory=frozenset)

    def can(self, permission: str) -> bool:
        return permission in self.permissions

    def actor(self) -> dict:
        """The actor snapshot stored on every audit entry."""
        return {"uid": self.uid, "email": self.email, "name": self.name, "role": self.role}

    def public(self) -> dict:
        try:
            label = ROLE_LABEL[Role(self.role)]
        except ValueError:
            label = self.role
        return {
            "uid": self.uid,
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "roleLabel": label,
            "permissions": sorted(self.permissions),
        }

    @classmethod
    def from_admin(cls, admin: dict) -> "Principal":
        return cls(
            uid=admin["id"],
            email=admin.get("email"),
            name=admin.get("name") or admin.get("email") or admin["id"],
            role=admin["role"],
            permissions=permissions_for(admin["role"]),
        )


SYSTEM = Principal(uid="system", email=None, name="PlugOrbit system", role="system")
