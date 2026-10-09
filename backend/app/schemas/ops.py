from typing import Literal

from pydantic import EmailStr, Field, field_validator, model_validator

from ..domain.redact import _is_secret
from .common import Body, Reason, ShortText, Versioned

# ----------------------------------------------------------------------- support --
TicketCategory = Literal[
    "charging_issue", "payment_issue", "charger_offline", "broken_connector", "wrong_pricing",
    "access_blocked", "location_problem", "refund_dispute", "other",
]
TicketPriority = Literal["low", "medium", "high", "urgent"]
TicketStatus = Literal["open", "in_review", "waiting_user", "waiting_partner", "resolved", "closed"]


class TicketCreate(Body):
    category: TicketCategory
    priority: TicketPriority = "medium"
    subject: str = Field(min_length=3, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    sessionId: str | None = None
    stationId: str | None = None
    userId: str | None = None


class TicketUpdate(Versioned):
    category: TicketCategory | None = None
    priority: TicketPriority | None = None
    status: TicketStatus | None = None
    ownerId: str | None = None
    unassign: bool = False
    sessionId: str | None = None
    stationId: str | None = None


class TicketNote(Body):
    body: str = Field(min_length=1, max_length=4000)


# ------------------------------------------------------------------------- users --
class UserRestrict(Body):
    reason: Reason


# ------------------------------------------------------------------ data quality --
class DqAction(Body):
    action: Literal["mark_verified", "downgrade_confidence", "hide_station", "dismiss", "mark_reviewed"]
    reason: Reason


class DqMerge(Body):
    keepStationId: str
    mergeStationId: str
    reason: Reason

    @model_validator(mode="after")
    def _different(self):
        if self.keepStationId == self.mergeStationId:
            raise ValueError("Pick two different stations to merge.")
        return self


# ------------------------------------------------------------------ integrations --
class IntegrationPatch(Body):
    enabled: bool | None = None
    notes: str | None = Field(default=None, max_length=500)
    # Non-secret settings only (region, project id, sender id…). Secrets live in Secret Manager.
    settings: dict[str, str] | None = None

    @field_validator("settings")
    @classmethod
    def _no_secrets(cls, value: dict[str, str] | None):
        for key in value or {}:
            if _is_secret(key):
                raise ValueError(
                    f"'{key}' looks like a secret. Keep keys/tokens in Secret Manager and "
                    "reference them by name; they are never stored or shown here."
                )
        return value


# ----------------------------------------------------------------- notifications --
NotificationKind = Literal[
    "service_message", "charger_outage", "payment", "support", "route_alert", "faq", "banner",
]
NotificationChannel = Literal["in_app", "push", "email", "sms"]


class NotificationFields(Body):
    kind: NotificationKind
    title: str = Field(min_length=3, max_length=100)
    body: str = Field(min_length=3, max_length=1000)
    channels: list[NotificationChannel] = Field(default_factory=lambda: ["in_app"], min_length=1)
    audience: Literal["all_users", "station_followers", "affected_users"] = "all_users"
    stationId: str | None = None
    startsAt: int | None = None
    endsAt: int | None = None


class NotificationCreate(NotificationFields):
    pass


class NotificationUpdate(NotificationFields, Versioned):
    pass


# ---------------------------------------------------------------------- settings --
INTENTS = ("plan_trip", "charge_nearby", "battery_critical")
# Mirrors the mobile app's FactorId. There is deliberately no sponsorship factor.
FACTORS = ("availability", "freshness", "reliability", "distance", "detour", "speed", "wait",
           "price", "faults", "amenities", "hours", "reach")

# Defaults copied from the mobile app's WEIGHTS (domain/recommendation.ts).
DEFAULT_RANKING_WEIGHTS: dict[str, dict[str, float]] = {
    "plan_trip": {"reliability": 22, "detour": 18, "availability": 16, "speed": 12, "freshness": 8,
                  "wait": 8, "price": 6, "faults": 5, "amenities": 3, "hours": 2},
    "charge_nearby": {"availability": 20, "reliability": 18, "distance": 14, "speed": 14, "freshness": 8,
                      "detour": 8, "wait": 8, "price": 6, "faults": 4},
    "battery_critical": {"reach": 30, "reliability": 22, "availability": 18, "distance": 14, "speed": 8,
                         "freshness": 6, "faults": 2},
}

# Phase flags. Only analytics/notifications ship in this build; the rest are reserved names so a
# later module can be switched on without a schema change.
FEATURE_FLAGS: dict[str, dict] = {
    "analytics": {"label": "Analytics", "phase": 2, "built": True},
    "notifications": {"label": "Notifications & content", "phase": 2, "built": True},
    "partner_self_service": {"label": "Partner self-service", "phase": 3, "built": False},
    "partner_staff_accounts": {"label": "Partner staff accounts", "phase": 3, "built": False},
    "automated_payouts": {"label": "Automated payouts", "phase": 2, "built": False},
    "fraud_risk": {"label": "Fraud / risk detection", "phase": 3, "built": False},
    "subscriptions": {"label": "Subscription plans", "phase": 3, "built": False},
    "sponsored_stations": {"label": "Sponsored station controls", "phase": 3, "built": False},
    "promotions": {"label": "Promotions", "phase": 3, "built": False},
    "fleet_accounts": {"label": "Fleet accounts", "phase": 3, "built": False},
    "roadside_ops": {"label": "Roadside assistance operations", "phase": 3, "built": False},
    "mobile_charging_vans": {"label": "Mobile charging vans", "phase": 3, "built": False},
    "auto_soc": {"label": "Automatic SoC integrations", "phase": 3, "built": False},
    "ai_occupancy": {"label": "AI occupancy forecast controls", "phase": 3, "built": False},
    "ai_ranking_monitor": {"label": "AI ranking monitoring", "phase": 3, "built": False},
}


class CommissionPlan(Body):
    id: str = Field(min_length=2, max_length=40, pattern=r"^[a-z0-9_-]+$")
    name: ShortText
    model: Literal["revenue_share", "flat_fee_per_kwh", "listing_only"] = "revenue_share"
    commissionPercent: float | None = Field(default=None, ge=0, le=100)
    flatFeePerKwh: float | None = Field(default=None, ge=0, le=50)
    note: str | None = Field(default=None, max_length=300)


class ConfigUpdate(Versioned):
    liveMaxAgeSec: int = Field(ge=10, le=3600)
    staleAfterSec: int = Field(ge=60, le=86400)
    minRouteBatteryReservePct: int = Field(ge=0, le=50)
    adminIdleTimeoutMinutes: int = Field(ge=5, le=480)
    platformFeeGstPercent: float = Field(ge=0, le=40)
    settlementMakerChecker: bool = True
    rankingWeights: dict[str, dict[str, float]]
    featureFlags: dict[str, bool]
    commissionPlans: list[CommissionPlan] = Field(max_length=50)
    reason: Reason | None = None

    @model_validator(mode="after")
    def _rules(self):
        if self.staleAfterSec <= self.liveMaxAgeSec:
            raise ValueError("'Stale after' must be longer than the 'Live' window.")
        for intent, weights in self.rankingWeights.items():
            if intent not in INTENTS:
                raise ValueError(f"Unknown ranking intent '{intent}'.")
            for factor, value in weights.items():
                if factor not in FACTORS:
                    raise ValueError(f"Unknown ranking factor '{factor}'. Sponsorship can never be a ranking input.")
                if not 0 <= value <= 100:
                    raise ValueError(f"Weight for '{factor}' must be between 0 and 100.")
            if sum(weights.values()) <= 0:
                raise ValueError(f"The '{intent}' weights cannot all be zero.")
        if self.rankingWeights.get("battery_critical", {}).get("price", 0) > 0:
            raise ValueError("Price must stay out of 'battery critical' ranking: reaching a working charger comes first.")
        for flag in self.featureFlags:
            if flag not in FEATURE_FLAGS:
                raise ValueError(f"Unknown feature flag '{flag}'.")
        ids = [p.id for p in self.commissionPlans]
        if len(ids) != len(set(ids)):
            raise ValueError("Commission plan ids must be unique.")
        return self


# -------------------------------------------------------------------------- admins --
AdminRole = Literal["super_admin", "operations", "finance", "support"]


class AdminInvite(Body):
    email: EmailStr
    name: str = Field(min_length=2, max_length=80)
    role: AdminRole


class AdminPatch(Body):
    role: AdminRole | None = None
    status: Literal["active", "disabled"] | None = None
    reason: Reason | None = None


# --------------------------------------------------------------------------- auth --
class DevLogin(Body):
    role: AdminRole
