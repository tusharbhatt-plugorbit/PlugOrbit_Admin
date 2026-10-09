from pydantic import Field, field_validator, model_validator

from ..domain import validators as v
from .common import Body, Reason


class RefundRequest(Body):
    # None = refund everything still refundable.
    amount: float | None = Field(default=None, gt=0, le=100000)
    reason: Reason


class SettlementRun(Body):
    periodStart: int
    periodEnd: int
    partnerIds: list[str] | None = None

    @model_validator(mode="after")
    def _order(self):
        if self.periodEnd <= self.periodStart:
            raise ValueError("The settlement period must end after it starts.")
        return self


class SettlementAdjustment(Body):
    label: str = Field(min_length=2, max_length=120)
    amount: float = Field(ge=-1_000_000, le=1_000_000)  # negative = deduction
    reason: Reason

    @field_validator("amount")
    @classmethod
    def _nonzero(cls, value: float) -> float:
        if value == 0:
            raise ValueError("An adjustment cannot be zero.")
        return value


class SettlementHold(Body):
    reason: Reason


class SettlementPaid(Body):
    payoutReference: str = Field(min_length=4, max_length=64)

    @field_validator("payoutReference")
    @classmethod
    def _ref(cls, value: str) -> str:
        if v.looks_like_account_number(value):
            raise ValueError("Enter the payout transaction/UTR reference, not a bank account number.")
        return value
