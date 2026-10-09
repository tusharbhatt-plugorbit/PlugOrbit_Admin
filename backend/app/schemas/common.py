from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

IntegrationMethod = Literal["api", "ocpp", "ocpi", "manual"]
SessionMode = Literal["integrated", "external"]
ConnectorType = Literal["CCS2", "Type2", "CHAdeMO", "GBT", "LECCS"]
ConnectorStatus = Literal["available", "occupied", "offline", "maintenance", "unknown"]
# Same ids as the mobile app's `Amenity`, plus open_24x7 (the mobile app keeps hours as text).
Amenity = Literal["restroom", "cafe", "food", "shopping", "parking", "wifi", "lounge", "shade", "open_24x7"]

Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class Body(BaseModel):
    """Base for every request body: unknown fields are rejected, not silently dropped."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Versioned(Body):
    """Optimistic concurrency: send the `version` you loaded; a mismatch answers 409."""

    expectedVersion: int | None = Field(default=None, ge=1)
