"""Money maths. Amounts are INR with two decimals; computations use Decimal and round half-up
once at the end, so settlements never accumulate float error."""
from decimal import ROUND_HALF_UP, Decimal


def D(value) -> Decimal:
    return Decimal(str(value))


def r2(value) -> float:
    return float(D(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def session_amount(tariff: dict, energy_kwh: float, minutes: float, idle_minutes: float = 0.0,
                   parking_hours: float = 0.0) -> dict:
    """Price of a session under a tariff snapshot. Returns the components and the GST-inclusive
    gross (what the driver pays)."""
    energy = D(tariff.get("pricePerKwh", 0)) * D(energy_kwh)
    time = D(tariff.get("pricePerMin", 0)) * D(minutes)
    base = D(tariff.get("pricePerSession", 0))
    idle = D(tariff.get("idleFeePerMin", 0)) * D(idle_minutes)
    parking = D(tariff.get("parkingFeePerHour", 0)) * D(parking_hours)
    subtotal = energy + time + base + idle + parking
    tax = subtotal * D(tariff.get("gstPercent", 0)) / D(100)
    return {
        "energy": r2(energy), "time": r2(time), "session": r2(base), "idle": r2(idle),
        "parking": r2(parking), "subtotal": r2(subtotal), "tax": r2(tax), "gross": r2(subtotal + tax),
    }
