"""Payment-gateway adapter.

No real gateway is wired in Phase 1 (the choice of provider is a pending product decision), so
this module is deliberately honest:

  * SimulatedGateway   - used only in development with the demo store; every response and the UI
                         say "simulated".
  * NotConfiguredGateway - the default everywhere else. A refund attempt answers
                         501 INTEGRATION_UNAVAILABLE instead of pretending money moved.

A real adapter (Razorpay/Cashfree/...) only has to implement `refund()` and report `name`.
"""
import secrets
from typing import Protocol

from ..errors import ApiError


class PaymentGateway(Protocol):
    name: str
    simulated: bool
    supports_refunds: bool

    def refund(self, payment_ref: str, amount: float, idempotency_key: str) -> dict: ...


class NotConfiguredGateway:
    name = "Not configured"
    simulated = False
    supports_refunds = False

    def refund(self, payment_ref: str, amount: float, idempotency_key: str) -> dict:
        raise ApiError(501, "INTEGRATION_UNAVAILABLE",
                       "No payment gateway is connected, so refunds cannot be sent. Connect one in Integrations.")


class SimulatedGateway:
    name = "Simulated gateway (demo)"
    simulated = True
    supports_refunds = True

    def refund(self, payment_ref: str, amount: float, idempotency_key: str) -> dict:
        return {"ref": "sim_rf_" + secrets.token_hex(5), "status": "succeeded"}


_gateway: PaymentGateway = NotConfiguredGateway()


def set_gateway(gateway: PaymentGateway) -> None:
    global _gateway
    _gateway = gateway


def get_gateway() -> PaymentGateway:
    return _gateway
