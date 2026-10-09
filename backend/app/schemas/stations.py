from typing import Literal

from pydantic import Field, field_validator, model_validator

from .common import Amenity, Body, ConnectorStatus, ConnectorType, IntegrationMethod, Reason, SessionMode, Versioned

Verification = Literal["unverified", "pending", "verified"]


class StationFields(Body):
    name: str = Field(min_length=2, max_length=120)
    partnerId: str
    address: str = Field(min_length=5, max_length=300)
    city: str = Field(min_length=2, max_length=80)
    state: str = Field(min_length=2, max_length=80)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    hours: str = Field(default="24x7", min_length=2, max_length=80)
    accessInstructions: str | None = Field(default=None, max_length=1000)
    photos: list[str] = Field(default_factory=list, max_length=8)
    amenities: list[Amenity] = Field(default_factory=list)
    parkingInfo: str | None = Field(default=None, max_length=500)
    sessionMode: SessionMode = "integrated"
    integrationMethod: IntegrationMethod = "manual"
    operatorInstructions: str | None = Field(default=None, max_length=1000)
    verification: Verification = "unverified"

    @field_validator("photos")
    @classmethod
    def _photos(cls, urls: list[str]) -> list[str]:
        for url in urls:
            if not url.startswith("https://"):
                raise ValueError("Photo links must be https:// URLs (from private storage or a CDN).")
        return urls

    @field_validator("amenities")
    @classmethod
    def _unique(cls, items: list[str]) -> list[str]:
        return list(dict.fromkeys(items))

    @model_validator(mode="after")
    def _external_needs_instructions(self):
        if self.sessionMode == "external" and not self.operatorInstructions:
            raise ValueError("External stations need operator instructions (the app shows them to drivers).")
        return self


class StationCreate(StationFields):
    pass


class StationUpdate(StationFields, Versioned):
    pass


class StationStatusOverride(Body):
    status: Literal["maintenance", "offline", "available", "occupied", "unknown"]
    reason: Reason
    expiresInMinutes: int | None = Field(default=None, ge=5, le=60 * 24 * 14)


class StationReason(Body):
    reason: Reason


class ConnectorFields(Body):
    evseId: str = Field(min_length=3, max_length=40)
    label: str = Field(min_length=1, max_length=20)
    chargerId: str = Field(min_length=2, max_length=60)
    type: ConnectorType
    powerKw: float = Field(gt=0, le=1000)
    integrationMode: IntegrationMethod = "manual"


class ConnectorCreate(ConnectorFields):
    pass


class ConnectorUpdate(ConnectorFields, Versioned):
    pass


class ConnectorOverride(Body):
    status: ConnectorStatus
    reason: Reason
    expiresInMinutes: int | None = Field(default=None, ge=5, le=60 * 24 * 14)


class ConnectorClearOverride(Body):
    reason: Reason | None = None


class TariffCreate(Body):
    connectorId: str | None = None  # None = every connector at the station
    pricePerKwh: float = Field(ge=0, le=100)
    pricePerMin: float = Field(default=0, ge=0, le=50)
    pricePerSession: float = Field(default=0, ge=0, le=1000)
    parkingFeePerHour: float = Field(default=0, ge=0, le=1000)
    idleFeePerMin: float = Field(default=0, ge=0, le=50)
    gstPercent: float = Field(default=18, ge=0, le=40)
    effectiveFrom: int | None = None  # epoch ms; None = now
    reason: Reason
    # Fat-finger guard: a >50% move needs an explicit second confirmation.
    confirmLargeChange: bool = False
