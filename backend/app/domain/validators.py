"""Indian business-identifier validation (PAN, GSTIN) and phone normalisation."""
import re

PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
_B36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def normalise_pan(value: str) -> str:
    pan = value.strip().upper()
    if not PAN_RE.match(pan):
        raise ValueError("PAN must look like ABCDE1234F.")
    return pan


def gstin_check_digit(first14: str) -> str:
    total = 0
    for i, ch in enumerate(first14):
        product = _B36.index(ch) * (1 if i % 2 == 0 else 2)
        total += product // 36 + product % 36
    return _B36[(36 - total % 36) % 36]


def normalise_gstin(value: str, pan: str | None = None) -> str:
    gstin = value.strip().upper()
    if not GSTIN_RE.match(gstin):
        raise ValueError("GSTIN must be 15 characters, like 27AAPFU0939F1ZV.")
    if gstin[14] != gstin_check_digit(gstin[:14]):
        raise ValueError("GSTIN check digit is wrong. Please re-check it.")
    if pan and gstin[2:12] != pan:
        raise ValueError("GSTIN does not contain this partner's PAN.")
    return gstin


def normalise_phone(value: str, default_country_code: str = "+91") -> str:
    raw = value.strip()
    digits = re.sub(r"\D", "", raw)
    if raw.startswith("+"):
        if not 8 <= len(digits) <= 15:
            raise ValueError("Phone number looks too short or too long.")
        return "+" + digits
    if len(digits) == 10 and digits[0] in "6789":
        return f"{default_country_code}{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return "+" + digits
    raise ValueError("Enter a 10-digit mobile number or a number with country code (+91…).")


def looks_like_account_number(value: str) -> bool:
    """A payout *reference* (gateway/vendor id) is fine; a bare 9-18 digit string is almost
    certainly a bank account number, which must never be stored in the admin database."""
    compact = re.sub(r"[\s-]", "", value)
    return compact.isdigit() and 9 <= len(compact) <= 18
