from typing import Literal

from pydantic import EmailStr, Field, field_validator, model_validator

from ..domain import validators as v
from .common import Body, IntegrationMethod, Reason, Versioned

CommercialModel = Literal["revenue_share", "flat_fee_per_kwh", "listing_only"]
PartnerStatus = Literal["draft", "pending_review", "active", "rejected", "suspended"]


class PartnerFields(Body):
    legalName: str = Field(min_length=2, max_length=120)
    displayName: str | None = Field(default=None, max_length=60)
    contactName: str = Field(min_length=2, max_length=80)
    phone: str
    email: EmailStr
    pan: str
    gstin: str | None = None
    # A reference only (gateway vendor id / masked account). Never a raw bank account number.
    payoutReference: str | None = Field(default=None, max_length=64)
    commercialModel: CommercialModel = "revenue_share"
    commissionPercent: float | None = Field(default=None, ge=0, le=100)
    flatFeePerKwh: float | None = Field(default=None, ge=0, le=50)
    commissionPlanId: str | None = None
    integrationMethod: IntegrationMethod = "manual"
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        return v.normalise_phone(value)

    @field_validator("pan")
    @classmethod
    def _pan(cls, value: str) -> str:
        return v.normalise_pan(value)

    @field_validator("payoutReference")
    @classmethod
    def _payout(cls, value: str | None) -> str | None:
        if value and v.looks_like_account_number(value):
            raise ValueError(
                "That looks like a bank account number. Store a gateway/vendor reference "
                "instead; raw account numbers are never kept here."
            )
        return value or None

    @model_validator(mode="after")
    def _commercials(self):
        if self.gstin:
            self.gstin = v.normalise_gstin(self.gstin, self.pan)
        else:
            self.gstin = None
        if self.commercialModel == "revenue_share" and self.commissionPercent is None and not self.commissionPlanId:
            raise ValueError("Set a commission % (or choose a commission plan) for a revenue-share partner.")
        if self.commercialModel == "flat_fee_per_kwh" and self.flatFeePerKwh is None:
            raise ValueError("Set the flat fee per kWh for this commercial model.")
        return self


class PartnerCreate(PartnerFields):
    pass


class PartnerUpdate(PartnerFields, Versioned):
    pass


class PartnerTransition(Body):
    to: PartnerStatus
    reason: Reason | None = None
    panVerified: bool | None = None
    gstinVerified: bool | None = None
