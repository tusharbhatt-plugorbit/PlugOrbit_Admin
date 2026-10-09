"""Deterministic DEMO data for the in-memory store.

Everything here is fictional and flagged `isDemo`. It is generated (seeded RNG) so that the
numbers are internally consistent: connector health stats are derived from the generated
sessions, settlements are computed by the real settlement service, data-quality issues come
from the real scanner, and the audit history is back-dated from the records it describes.

Never loaded when Firestore is the active store.
"""
import random

from .domain import clock
from .domain.money import D, r2, session_amount
from .domain.validators import gstin_check_digit
from .security.principal import Principal
from .services import audit, config as config_service, dataquality, settlements, tariffs
from .services.colls import (ADMINS, CONNECTORS, PARTNERS, SESSIONS, STATIONS, TARIFFS, TICKETS,
                              NOTIFICATIONS, USERS)
from .services.stations import recompute_visibility
from .store.memory import MemoryStore

MIN, HOUR, DAY = clock.MINUTE, clock.HOUR, clock.DAY

DEV_ADMINS = [
    ("dev-super", "Aarav Mehta", "aarav@plugorbit.demo", "super_admin"),
    ("dev-ops", "Meera Iyer", "meera@plugorbit.demo", "operations"),
    ("dev-finance", "Rohan Shah", "rohan@plugorbit.demo", "finance"),
    ("dev-finance2", "Kavya Rao", "kavya@plugorbit.demo", "finance"),
    ("dev-support", "Isha Nair", "isha@plugorbit.demo", "support"),
]


def _gstin(state: str, pan: str, entity: str = "1") -> str:
    body = f"{state}{pan}{entity}Z"
    return body + gstin_check_digit(body)


# id, legal, display, contact, phone, email, pan, state, status, model, pct, flat, plan, method, notes
PARTNERS_SEED = [
    ("ptn-chargezone", "ChargeZone Mobility Pvt Ltd", "ChargeZone", "Neha Kapoor", "+919810000101", "ops@chargezone.demo.in", "AACCC1001A", "08", "active", "revenue_share", 12.0, None, "standard", "api"),
    ("ptn-statiq", "Statiq Charging Networks Pvt Ltd", "Statiq", "Vikram Sethi", "+919810000102", "partners@statiq.demo.in", "AACCS2002B", "06", "active", "revenue_share", 10.0, None, "launch", "ocpi"),
    ("ptn-tata-power", "Tata Power Charging Demo Ltd", "Tata Power", "Anjali Desai", "+919810000103", "ev@tatapower.demo.in", "AACCT3003C", "27", "active", "revenue_share", 12.0, None, "standard", "api"),
    ("ptn-local-cpo", "Sector 18 Local Charging LLP", "Local CPO", "Harpreet Singh", "+919810000104", "hello@localcpo.demo.in", "AACCL4004D", "09", "active", "listing_only", None, None, "listing", "manual"),
    ("ptn-voltpath", "VoltPath Networks Pvt Ltd", "VoltPath", "Siddharth Rao", "+919810000105", "ops@voltpath.demo.in", "AACCV5005E", "08", "active", "flat_fee_per_kwh", None, 2.5, None, "ocpp"),
    ("ptn-greengrid", "GreenGrid Mobility Pvt Ltd", "GreenGrid", "Pooja Menon", "+919810000106", "team@greengrid.demo.in", "AACCG6006F", "27", "pending_review", "revenue_share", 12.0, None, "standard", "api"),
    ("ptn-ampere-lane", "Ampere Lane Energy LLP", "Ampere Lane", "Dev Malhotra", "+919810000107", "dev@amperelane.demo.in", "AACCA7007G", "07", "draft", "revenue_share", 10.0, None, "launch", "manual"),
    ("ptn-sparkhub", "SparkHub Energy Pvt Ltd", "SparkHub", "Rina Joshi", "+919810000108", "rina@sparkhub.demo.in", "AACCP8008H", "24", "rejected", "revenue_share", 15.0, None, None, "api"),
    ("ptn-quickjuice", "QuickJuice Chargers Pvt Ltd", "QuickJuice", "Arjun Nair", "+919810000109", "arjun@quickjuice.demo.in", "AACCQ9009J", "29", "suspended", "revenue_share", 12.0, None, "standard", "api"),
]

# connector tuple: label, type, kW, status, source, status_age_s, heartbeat_age_s, mode, uptime
Cn = tuple
STATIONS_SEED = [
    # name, partner, city, state, lat, lng, publication, sessionMode, method, amenities, connectors, extra
    ("ChargeZone Neemrana", "ptn-chargezone", "Neemrana", "Rajasthan", 27.9886, 76.3855, "live", "integrated", "api",
     ["cafe", "restroom", "parking", "open_24x7"],
     [("C1", "CCS2", 60, "available", "operator_feed", 38, 20, "api", 99.4), ("C2", "CCS2", 60, "occupied", "operator_feed", 41, 20, "api", 98.9),
      ("C3", "Type2", 22, "offline", "operator_feed", 95, 25, "api", 96.2), ("C4", "CCS2", 30, "available", "operator_feed", 52, 22, "api", 99.1)], {}),
    ("Statiq Highway Hub Gurgaon", "ptn-statiq", "Gurgaon", "Haryana", 28.4595, 77.0266, "live", "integrated", "ocpi",
     ["food", "restroom", "parking", "shopping"],
     [("C1", "CCS2", 60, "occupied", "operator_feed", 44, 30, "ocpi", 99.0), ("C2", "CCS2", 60, "occupied", "operator_feed", 61, 30, "ocpi", 98.6),
      ("C3", "CCS2", 120, "available", "operator_feed", 33, 30, "ocpi", 97.8), ("C4", "Type2", 22, "available", "operator_feed", 70, 30, "ocpi", 99.2),
      ("C5", "Type2", 22, "occupied", "operator_feed", 80, 30, "ocpi", 98.1), ("C6", "CHAdeMO", 50, "available", "operator_feed", 55, 30, "ocpi", 97.0)],
     {"reports": {"C3": [("status", "offline", 22), ("status", "offline", 15), ("status", "offline", 6)]}}),
    ("Tata Power Jaipur Hub", "ptn-tata-power", "Jaipur", "Rajasthan", 26.9124, 75.7873, "live", "integrated", "api",
     ["food", "restroom", "parking", "shopping", "open_24x7"],
     [(f"C{i}", "CCS2" if i <= 5 else "Type2", 60 if i <= 5 else 22, "offline", "operator_feed", 48 * 60 + i * 20, 46 * 60 + i * 12, "api", 71.0 + i) for i in range(1, 9)], {}),
    ("Local CPO Sector 18 Noida", "ptn-local-cpo", "Noida", "Uttar Pradesh", 28.5708, 77.3261, "live", "external", "manual",
     ["parking"],
     [("C1", "Type2", 22, "available", "manual", 25 * 60, None, "manual", None), ("C2", "CCS2", 30, "occupied", "manual", 25 * 60, None, "manual", None)],
     {"operator": "Pay at the cashier counter or scan the operator's QR. PlugOrbit cannot start this charger.", "price_override": 3.0}),
    ("Local CPO Sector-18 Noida (new)", "ptn-local-cpo", "Noida", "Uttar Pradesh", 28.5712, 77.3264, "hidden", "external", "manual",
     ["parking"], [("C1", "Type2", 22, "unknown", "none", None, None, "manual", None)],
     {"operator": "Pay at the cashier counter.", "unverified": True}),
    ("Statiq Connaught Place Delhi", "ptn-statiq", "New Delhi", "Delhi", 28.6315, 77.2167, "live", "integrated", "ocpi",
     ["cafe", "restroom", "shopping"],
     [("C1", "CCS2", 60, "available", "operator_feed", 30, 18, "ocpi", 99.5), ("C2", "CCS2", 60, "available", "operator_feed", 45, 18, "ocpi", 99.0),
      ("C3", "Type2", 22, "occupied", "operator_feed", 50, 18, "ocpi", 98.7), ("C4", "Type2", 22, "available", "operator_feed", 36, 18, "ocpi", 99.3)], {}),
    ("Tata Power Saket Delhi", "ptn-tata-power", "New Delhi", "Delhi", 28.5245, 77.2066, "live", "integrated", "api",
     ["food", "restroom", "shopping", "parking"],
     [("C1", "CCS2", 60, "available", "operator_feed", 61, 35, "api", 99.2), ("C2", "CCS2", 60, "occupied", "operator_feed", 75, 35, "api", 98.4),
      ("C3", "Type2", 22, "available", "operator_feed", 52, 35, "api", 99.0)], {}),
    ("ChargeZone Manesar", "ptn-chargezone", "Manesar", "Haryana", 28.3540, 76.9366, "live", "integrated", "api",
     ["food", "restroom", "parking"],
     [("C1", "CCS2", 60, "available", "operator_feed", 58, 40, "api", 98.0), ("C2", "CCS2", 60, "occupied", "operator_feed", 49, 40, "api", 88.4),
      ("C3", "Type2", 22, "available", "operator_feed", 66, 40, "api", 98.8), ("C4", "CCS2", 30, "available", "operator_feed", 70, 40, "api", 97.9)],
     {"reports": {"C2": [("fault", None, 600), ("fault", None, 240), ("fault", None, 50)]}, "fail_connector": "C2"}),
    ("VoltPath Behror Highway Plaza", "ptn-voltpath", "Behror", "Rajasthan", 27.8850, 76.2780, "live", "integrated", "ocpp",
     ["food", "restroom", "parking"],
     [("C1", "CCS2", 60, "available", "operator_feed", 40, 25, "ocpp", 98.7), ("C2", "CCS2", 60, "available", "operator_feed", 48, 25, "ocpp", 98.2),
      ("C3", "Type2", 22, "occupied", "operator_feed", 55, 25, "ocpp", 99.0)], {}),
    ("ChargeZone Kotputli", "ptn-chargezone", "Kotputli", "Rajasthan", 27.7050, 76.1980, "live", "integrated", "api",
     ["restroom", "parking"],
     [("C1", "CCS2", 60, "occupied", "operator_feed", 33, 28, "api", 97.4), ("C2", "CCS2", 60, "occupied", "operator_feed", 51, 28, "api", 97.9)], {}),
    ("VoltPath Shahpura Dhaba Stop", "ptn-voltpath", "Shahpura", "Rajasthan", 27.3880, 75.9570, "live", "integrated", "ocpp",
     ["food", "restroom"],
     [("C1", "CCS2", 60, "available", "operator_feed", 44, 33, "ocpp", 98.9), ("C2", "CCS2", 60, "maintenance", "operator_feed", 52, 33, "ocpp", 92.0)],
     {"maintenance": "C2"}),
    ("Tata Power Faridabad Sector 15", "ptn-tata-power", "Faridabad", "Haryana", 28.4089, 77.3178, "live", "integrated", "api",
     ["restroom", "parking", "cafe"],
     [("C1", "CCS2", 60, "available", "operator_feed", 55, 44, "api", 99.0), ("C2", "CCS2", 60, "available", "operator_feed", 63, 44, "api", 98.8),
      ("C3", "Type2", 22, "occupied", "operator_feed", 71, 44, "api", 98.5), ("C4", "Type2", 22, "available", "operator_feed", 30, 44, "api", 99.1)], {}),
    ("Statiq Ghaziabad Raj Nagar", "ptn-statiq", "Ghaziabad", "Uttar Pradesh", 28.6692, 77.4538, "live", "integrated", "ocpi",
     ["parking", "restroom"],
     [("C1", "CCS2", 60, "available", "operator_feed", 52, 38, "ocpi", 99.0), ("C2", "Type2", 22, "available", "operator_feed", 59, 38, "ocpi", 98.5),
      ("C3", "Type2", 22, "occupied", "operator_feed", 66, 38, "ocpi", 98.9)], {}),
    ("ChargeZone Kundli Service Plaza", "ptn-chargezone", "Kundli", "Haryana", 28.8826, 77.0970, "live", "external", "manual",
     ["food", "restroom", "parking", "open_24x7"],
     [("C1", "CCS2", 60, "available", "manual", 9 * 60, None, "manual", None), ("C2", "CCS2", 60, "available", "manual", 9 * 60, None, "manual", None)],
     {"operator": "Start the session in the operator's own app or at the plaza kiosk, and pay there."}),
    ("VoltPath Noida Sector 62", "ptn-voltpath", "Noida", "Uttar Pradesh", 28.6208, 77.3649, "live", "integrated", "ocpp",
     ["cafe", "restroom", "parking"],
     [("C1", "CCS2", 60, "available", "operator_feed", 35, 20, "ocpp", 99.3), ("C2", "CCS2", 60, "occupied", "operator_feed", 43, 20, "ocpp", 98.8),
      ("C3", "Type2", 22, "available", "operator_feed", 57, 20, "ocpp", 99.0), ("C4", "CCS2", 120, "available", "operator_feed", 49, 20, "ocpp", 98.0)],
     {"price_override": 31.0, "price_connector": "C4"}),
    ("VoltPath Alwar Bypass", "ptn-voltpath", "Alwar", "Rajasthan", 27.5660, 76.6100, "draft", "integrated", "ocpp",
     ["food", "restroom", "parking"],
     [("C1", "CCS2", 60, "unknown", "none", None, None, "ocpp", None), ("C2", "Type2", 22, "unknown", "none", None, None, "ocpp", None)],
     {"ready": True}),
    ("GreenGrid Pune Hinjewadi", "ptn-greengrid", "Pune", "Maharashtra", 18.5913, 73.7389, "draft", "integrated", "api",
     ["parking"], [], {"no_pricing": True}),
    ("Statiq Gurgaon Sohna Road (migrated)", "ptn-statiq", "Gurgaon", "Haryana", 28.4090, 77.0420, "live", "integrated", "ocpi",
     ["parking"], [], {"legacy": True}),
]

FIRST = ["Asha", "Rahul", "Priya", "Karan", "Neelam", "Vivek", "Sana", "Imran", "Divya", "Manish", "Tanvi", "Gaurav", "Pallavi", "Nitin",
         "Ritika", "Sameer", "Aditi", "Yash", "Komal", "Harsh", "Swati", "Arnav", "Ishaan", "Meghna", "Tarun", "Bhavna", "Kunal", "Shreya",
         "Pranav", "Nisha", "Lakshya", "Anita", "Rohit", "Simran", "Varun", "Deepa", "Ayaan", "Charu", "Mohit", "Zoya"]
LAST = ["Kulkarni", "Verma", "Sharma", "Khanna", "Joshi", "Bansal", "Qureshi", "Ahmed", "Gupta", "Pillai", "Reddy", "Chopra", "Bhatia",
        "Saxena", "Tiwari", "Kapoor", "Mishra", "Yadav", "Jain", "Agarwal"]
CARS = [("Tata", "Nexon EV", "CCS2"), ("Tata", "Punch EV", "CCS2"), ("MG", "ZS EV", "CCS2"), ("Mahindra", "XUV400", "CCS2"),
        ("Hyundai", "Kona Electric", "CCS2"), ("BYD", "Atto 3", "CCS2"), ("Tata", "Tiago EV", "Type2"), ("MG", "Comet EV", "Type2")]

TICKET_SEED = [
    # category, priority, status, subject, station key, session?, owner role, age_h, note
    ("charger_offline", "urgent", "open", "Tata Power Jaipur Hub: all chargers offline since morning", "Tata Power Jaipur Hub", False, "dev-ops", 5, "Called the site manager, no response yet."),
    ("charging_issue", "high", "in_review", "Charger stopped at 62% and would not restart", "ChargeZone Manesar", True, "dev-support", 20, "Driver says C2 threw a fault twice. Linked to repeated fault reports."),
    ("payment_issue", "high", "open", "Charged but session shows payment pending", "Statiq Highway Hub Gurgaon", True, None, 9, None),
    ("wrong_pricing", "medium", "in_review", "Sector 18 price looks too low (₹3/kWh)", "Local CPO Sector 18 Noida", False, "dev-ops", 30, "Operator confirmed their app shows ₹13. Our price needs fixing."),
    ("refund_dispute", "medium", "waiting_user", "Refund requested for aborted session", "ChargeZone Neemrana", True, "dev-support", 50, "Asked user for the screenshot of the failed receipt."),
    ("broken_connector", "high", "waiting_partner", "CCS2 latch damaged at Shahpura C2", "VoltPath Shahpura Dhaba Stop", False, "dev-ops", 70, "VoltPath to dispatch a technician by Friday."),
    ("location_problem", "low", "open", "Pin is 300 m away from the real entrance", "Tata Power Faridabad Sector 15", False, None, 26, None),
    ("access_blocked", "medium", "resolved", "Boom barrier did not open for EV bay", "Statiq Connaught Place Delhi", False, "dev-support", 120, "Mall security reset the barrier. Resolved."),
    ("other", "low", "closed", "Question about invoice GST details", "ChargeZone Kotputli", False, "dev-support", 200, "Sent GST invoice copy."),
    ("charging_issue", "medium", "open", "Charging slower than advertised", "Statiq Highway Hub Gurgaon", True, None, 14, None),
    ("payment_issue", "urgent", "in_review", "Double charge on one session", "VoltPath Noida Sector 62", True, "dev-finance", 7, "Checking gateway for a duplicate capture."),
    ("wrong_pricing", "low", "resolved", "Idle fee not shown in the app", "Tata Power Saket Delhi", False, "dev-ops", 160, "Updated tariff to include idle fee."),
]


def _rng() -> random.Random:
    return random.Random(2026)


def _price(rng: random.Random, ctype: str) -> float:
    if ctype in ("Type2",):
        return float(rng.choice([11, 12, 13, 14]))
    if ctype == "CHAdeMO":
        return float(rng.choice([19, 20]))
    return float(rng.choice([18, 19, 20, 22, 24]))


def load_demo_data(store: MemoryStore, *, dev_admins: bool = True) -> None:
    now = clock.now_ms()
    rng = _rng()

    # ------------------------------------------------------------------- admins ------
    admins: dict[str, dict] = {}
    if dev_admins:
        for uid, name, email, role in DEV_ADMINS:
            admins[uid] = store.set(ADMINS, uid, {"email": email, "name": name, "role": role, "status": "active",
                                                  "createdAt": now - 90 * DAY, "lastLoginAt": now - 2 * HOUR, "invitedBy": "bootstrap"})
    sup = Principal.from_admin(admins["dev-super"]) if admins else None

    def pr(uid: str) -> Principal | None:
        return Principal.from_admin(admins[uid]) if uid in admins else sup

    config_service.get(store)  # creates the default platform config

    # ----------------------------------------------------------------- partners ------
    audit_queue: list[dict] = []  # (at, kwargs) replayed in time order at the end

    def queue(at: int, actor_uid: str, action: str, etype: str, eid: str, **kw) -> None:
        audit_queue.append({"at": at, "actor": actor_uid, "action": action, "entity_type": etype, "entity_id": eid, **kw})

    for i, (pid, legal, display, contact, phone, email, pan, st, status, model, pct, flat, plan, method) in enumerate(PARTNERS_SEED):
        created = now - (80 - i * 6) * DAY
        gstin = _gstin(st, pan) if status != "draft" else None
        verification = {"panVerified": status in ("active", "suspended"), "gstinVerified": bool(gstin) and status in ("active", "suspended"),
                        "reviewedBy": "dev-ops" if status in ("active", "suspended", "rejected") else None,
                        "reviewedAt": created + 3 * DAY if status in ("active", "suspended", "rejected") else None,
                        "rejectionReason": "PAN did not match the company registration." if status == "rejected" else None}
        store.create(PARTNERS, pid, {
            "legalName": legal, "displayName": display, "contactName": contact, "phone": phone, "email": email, "pan": pan,
            "gstin": gstin, "payoutReference": f"vendor_{display.lower().replace(' ', '')}_{1000 + i}" if status in ("active", "suspended") else None,
            "commercialModel": model, "commissionPercent": pct, "flatFeePerKwh": flat, "commissionPlanId": plan,
            "integrationMethod": method, "notes": "Demo partner" if i else "Demo partner. Launch partner with the first Delhi-Jaipur corridor stations.",
            "status": status, "verification": verification, "statusReason": "Missed two payouts after audit." if status == "suspended" else None,
            "isDemo": True, "createdAt": created, "updatedAt": created + 3 * DAY, "version": 1, "createdBy": "dev-ops",
        })
        queue(created, "dev-ops", "partner.create", "partner", pid, label=legal)
        if status in ("active", "suspended"):
            queue(created + 3 * DAY, "dev-ops", "partner.approve", "partner", pid, label=legal,
                  before={"status": "pending_review"}, after={"status": "active"})
        if status == "rejected":
            queue(created + 3 * DAY, "dev-ops", "partner.reject", "partner", pid, label=legal,
                  before={"status": "pending_review"}, after={"status": "rejected"}, reason="PAN did not match the company registration.")
        if status == "suspended":
            queue(now - 9 * DAY, "dev-super", "partner.suspend", "partner", pid, label=legal,
                  before={"status": "active"}, after={"status": "suspended"}, reason="Missed two payouts after audit.")

    # ----------------------------------------------------- stations / connectors ------
    users: list[str] = []
    station_ids: dict[str, str] = {}
    connectors_by_station: dict[str, list[dict]] = {}
    tariff_log: list[dict] = []

    for idx, (name, pid, city, state, lat, lng, pub, mode, method, amenities, conns, extra) in enumerate(STATIONS_SEED, start=1):
        sid = f"st-{clock.slugify(name)}"
        station_ids[name] = sid
        created = now - rng.randint(40, 75) * DAY
        verified = not extra.get("unverified") and (pub != "draft" or extra.get("ready"))
        store.create(STATIONS, sid, {
            "name": name, "partnerId": pid, "address": f"{rng.randint(1, 120)}, NH-48 Service Road, {city}" if method != "manual" else f"Shop {rng.randint(2, 40)}, Main Market, {city}",
            "city": city, "state": state, "latitude": lat, "longitude": lng, "hours": "24x7" if "open_24x7" in amenities else "06:00-23:00",
            "accessInstructions": "Enter from the service road; EV bays are marked in green." if method != "manual" else None,
            "photos": [], "amenities": amenities, "parkingInfo": "Free parking while charging." if "parking" in amenities else None,
            "sessionMode": mode, "integrationMethod": method, "operatorInstructions": extra.get("operator"),
            "verification": "verified" if verified else "unverified", "publication": pub, "visibleInApp": False,
            "isDemo": True, "createdAt": created, "updatedAt": created, "version": 1, "createdBy": "dev-ops",
        })
        queue(created, "dev-ops", "station.create", "station", sid, label=name)
        if pub == "live":
            queue(created + 2 * DAY, "dev-ops", "station.publish", "station", sid, label=name,
                  before={"publication": "draft"}, after={"publication": "live"})
        rows = []
        reports = extra.get("reports", {})
        for (label, ctype, kw, status, source, age_s, hb_s, cmode, uptime) in conns:
            cid = f"{sid}-{label.lower()}"
            ur = [{"at": now - mins * MIN, "kind": kind, "status": st_, "note": None} for kind, st_, mins in reports.get(label, [])]
            row = {
                "stationId": sid, "evseId": f"EVSE-{label[1:].zfill(3)}", "label": label,
                "chargerId": f"{pid.removeprefix('ptn-')[:3].upper()}-{city[:3].upper()}-{idx:02d}-{label}", "type": ctype, "powerKw": float(kw),
                "integrationMode": cmode, "status": status, "statusSource": source,
                "statusUpdatedAt": None if age_s is None else now - age_s * 1000,
                "lastHeartbeatAt": None if hb_s is None else now - hb_s * 1000,
                "override": None, "sessions30d": 0, "failedSessions30d": 0, "faults30d": 0, "recentFailures7d": 0,
                "uptimePct": uptime, "userReports": ur, "createdAt": created, "updatedAt": created, "version": 1,
            }
            if extra.get("maintenance") == label:
                row["override"] = {"status": "maintenance", "reason": "Latch repair, technician booked", "by": "dev-ops",
                                   "byName": "Meera Iyer", "at": now - 3 * HOUR, "expiresAt": now + 2 * DAY}
                queue(now - 3 * HOUR, "dev-ops", "connector.override", "station", sid, label=f"{name} · {label}",
                      before={"status": "available", "manual": False}, after={"status": "maintenance", "manual": True},
                      reason="Latch repair, technician booked")
            if mode == "external" and extra.get("unverified"):
                row["statusSource"], row["statusUpdatedAt"] = "none", None
            store.create(CONNECTORS, cid, row)
            rows.append({**row, "id": cid})
        connectors_by_station[sid] = rows

        # tariffs: connector-specific, with real history for some
        if not extra.get("no_pricing") and rows:
            for row in rows:
                base = extra.get("price_override") if (extra.get("price_override") and (not extra.get("price_connector") or extra["price_connector"] == row["label"])) else _price(rng, row["type"])
                first_at = created + 2 * DAY
                v1 = {"stationId": sid, "connectorId": row["id"], "pricePerKwh": base, "pricePerMin": 0, "pricePerSession": 0,
                      "parkingFeePerHour": 0, "idleFeePerMin": 2.0 if row["type"] == "CCS2" else 0, "gstPercent": 18.0,
                      "effectiveFrom": first_at, "reason": "Launch pricing", "previous": None,
                      "createdAt": first_at, "createdBy": "dev-ops", "createdByName": "Meera Iyer"}
                changed = rng.random() < 0.35 and not extra.get("price_override")
                t1 = f"tf-{sid[3:]}-{row['label'].lower()}-1"
                store.create(TARIFFS, t1, v1)
                tariff_log.append({"at": first_at, "station": sid, "name": name, "label": row["label"], "before": None, "after": v1})
                if changed:
                    new_price = round(base * rng.choice([0.9, 1.1, 1.15]), 1)
                    at2 = now - rng.randint(8, 25) * DAY
                    v2 = {**v1, "pricePerKwh": new_price, "effectiveFrom": at2, "reason": "Quarterly tariff review",
                          "previous": {k: v1[k] for k in ("pricePerKwh", "pricePerMin", "pricePerSession", "parkingFeePerHour", "idleFeePerMin", "gstPercent")} | {"tariffId": t1, "effectiveFrom": first_at},
                          "createdAt": at2}
                    store.create(TARIFFS, t1[:-1] + "2", v2)
                    tariff_log.append({"at": at2, "station": sid, "name": name, "label": row["label"], "before": v1, "after": v2})

    # a scheduled (future) tariff to demonstrate pending price changes
    neemrana = station_ids["ChargeZone Neemrana"]
    cur = store.get(TARIFFS, f"tf-{neemrana[3:]}-c1-1")
    if cur:
        store.create(TARIFFS, f"tf-{neemrana[3:]}-c1-sched", {
            **{k: v for k, v in cur.items() if k != "id"}, "pricePerKwh": cur["pricePerKwh"] + 2.0, "effectiveFrom": now + 5 * DAY,
            "reason": "Festival-season peak pricing", "createdAt": now - 2 * HOUR, "createdBy": "dev-ops", "createdByName": "Meera Iyer",
            "previous": {k: cur[k] for k in ("pricePerKwh", "pricePerMin", "pricePerSession", "parkingFeePerHour", "idleFeePerMin", "gstPercent")} | {"tariffId": cur["id"], "effectiveFrom": cur["effectiveFrom"]}})

    # the "ready to go live" demo station needs prices + verification (it already has both)
    alwar = station_ids["VoltPath Alwar Bypass"]
    for row in connectors_by_station[alwar]:
        store.create(TARIFFS, f"tf-alwar-{row['label'].lower()}", {
            "stationId": alwar, "connectorId": row["id"], "pricePerKwh": 21.0 if row["type"] == "CCS2" else 12.0, "pricePerMin": 0,
            "pricePerSession": 0, "parkingFeePerHour": 0, "idleFeePerMin": 0, "gstPercent": 18.0, "effectiveFrom": now - 2 * DAY,
            "reason": "Initial pricing", "previous": None, "createdAt": now - 2 * DAY, "createdBy": "dev-ops", "createdByName": "Meera Iyer"})

    # ------------------------------------------------------------------- users -------
    for i in range(40):
        name = f"{FIRST[i]} {LAST[(i * 7) % len(LAST)]}"
        uid = f"usr-{1000 + i}"
        make, model, conn = CARS[(i * 3) % len(CARS)]
        phone = f"+9198765432{(i * 7) % 90 + 10:02d}" if i else "+919876543241"
        store.create(USERS, uid, {
            "name": name, "email": f"{FIRST[i].lower()}.{LAST[(i * 7) % len(LAST)].lower()}@mail.demo.in", "phone": phone,
            "vehicles": [{"id": f"veh-{i}", "make": make, "model": model, "connector": conn}],
            "status": "active", "restriction": None, "restrictionHistory": [], "createdAt": now - rng.randint(20, 200) * DAY, "isDemo": True,
        })
        users.append(uid)

    # ---------------------------------------------------------------- sessions -------
    live_conns = [c for sid, rows in connectors_by_station.items() for c in rows
                  if store.get(STATIONS, sid)["publication"] in ("live", "hidden") and c["integrationMode"] != "none"]
    all_tariffs = {sid: tariffs.station_tariffs(store, sid) for sid in connectors_by_station}
    sessions: list[dict] = []

    def make_session(code: str, conn: dict, user_id: str, started: int, *, force: str | None = None, energy: float | None = None) -> dict:
        st = store.get(STATIONS, conn["stationId"])
        u = store.get(USERS, user_id)
        veh = u["vehicles"][0]
        dc = conn["type"] != "Type2"
        kwh = energy if energy is not None else round(rng.uniform(14, 46) if dc else rng.uniform(5, 18), 1)
        eff_kw = conn["powerKw"] * (0.55 if dc else 0.8)
        minutes = max(8, round(kwh / eff_kw * 60 + rng.uniform(-3, 5)))
        ended = started + minutes * MIN
        external = st["sessionMode"] == "external"
        t = tariffs.active_tariff(all_tariffs[conn["stationId"]], conn["id"], started)
        snap = {k: (t or {}).get(k, 0) for k in ("pricePerKwh", "pricePerMin", "pricePerSession", "parkingFeePerHour", "idleFeePerMin", "gstPercent")}
        idle = round(rng.uniform(0, 12)) if dc and rng.random() < 0.25 else 0
        bd = session_amount(snap, kwh, minutes, idle)
        gross = bd["gross"]
        status = force or ("external" if external else rng.choices(
            ["paid", "pending", "failed", "refunded", "partially_refunded"], [80, 3, 8, 5, 4])[0])
        preauth = 1000.0 if dc else 500.0
        events: list[dict] = []
        gateway = None
        method = "Operator (QR / app)" if external else rng.choice(["UPI", "UPI", "Card", "Wallet"])
        failure = None
        refunded = 0.0
        if not external:
            gateway = {"name": "Simulated gateway (demo)", "reference": f"pay_{rng.randint(10**9, 10**10 - 1)}"}
            events.append({"id": f"ev-{code}-1", "type": "preauth", "amount": preauth, "at": started - 20_000, "ref": gateway["reference"]})
            if status == "failed":
                failure = rng.choice(["Card declined at capture", "Charger stopped: connector fault", "Payment timed out"])
                events.append({"id": f"ev-{code}-f", "type": "failure", "amount": 0.0, "at": ended, "ref": None, "note": failure})
                events.append({"id": f"ev-{code}-r", "type": "release", "amount": preauth, "at": ended + 2 * MIN, "ref": gateway["reference"]})
                gross = 0.0 if "fault" in failure else gross
            elif status == "pending":
                pass
            else:
                events.append({"id": f"ev-{code}-2", "type": "capture", "amount": gross, "at": ended + MIN, "ref": gateway["reference"]})
                events.append({"id": f"ev-{code}-3", "type": "release", "amount": r2(D(preauth) - D(gross)), "at": ended + 2 * MIN, "ref": gateway["reference"]})
                if status in ("refunded", "partially_refunded"):
                    refunded = gross if status == "refunded" else r2(D(gross) * D(rng.choice([0.2, 0.3, 0.5])))
                    events.append({"id": f"ev-{code}-4", "type": "refund", "amount": refunded, "at": ended + rng.randint(2, 20) * HOUR,
                                   "ref": f"sim_rf_{rng.randint(10**8, 10**9)}", "actor": "dev-finance", "actorName": "Rohan Shah",
                                   "reason": rng.choice(["Charger slowed down mid-session", "Goodwill after support ticket", "Overcharged: idle fee waived"]),
                                   "simulated": True})
                    queue(events[-1]["at"], "dev-finance", "refund.issue", "session", code, label=f"{st['name']} · {code}",
                          before={"refundedAmount": 0, "paymentStatus": "paid"}, after={"refundedAmount": refunded, "amount": refunded},
                          reason=events[-1]["reason"])
        doc = {
            "stationId": conn["stationId"], "stationName": st["name"], "partnerId": st["partnerId"], "connectorId": conn["id"],
            "connectorLabel": conn["label"], "connectorType": conn["type"], "powerKw": conn["powerKw"], "userId": user_id,
            "vehicle": {"make": veh["make"], "model": veh["model"]}, "startedAt": started, "endedAt": ended,
            "energyKwh": kwh if status != "failed" or not failure or "fault" not in failure else round(kwh * 0.3, 1),
            "durationMin": minutes, "tariff": {**snap, "tariffId": (t or {}).get("id")}, "breakdown": bd,
            "grossAmount": gross if status != "pending" else gross, "paymentMethod": method, "paymentStatus": status,
            "integrationMode": "external" if external else "integrated", "gateway": gateway, "paymentEvents": events,
            "refundedAmount": refunded, "failureReason": failure, "isDemo": True,
        }
        store.create(SESSIONS, code, doc)
        return {**doc, "id": code}

    # the reference-pack session (PO-6A4K92): 26.2 kWh, 41 min, ₹556.49 captured of a ₹600 hold
    c2 = next(c for c in live_conns if c["id"] == f"{neemrana}-c2")
    ref = make_session("PO-6A4K92", c2, users[0], now - 3 * HOUR, force="paid", energy=26.2)
    store.update(SESSIONS, "PO-6A4K92", {"durationMin": 41, "endedAt": ref["startedAt"] + 41 * MIN, "grossAmount": 556.49,
                                         "paymentEvents": [
                                             {"id": "ev-ref-1", "type": "preauth", "amount": 600.0, "at": ref["startedAt"] - 20_000, "ref": "pay_8D2ZK91"},
                                             {"id": "ev-ref-2", "type": "capture", "amount": 556.49, "at": ref["startedAt"] + 42 * MIN, "ref": "pay_8D2ZK91"},
                                             {"id": "ev-ref-3", "type": "release", "amount": 43.51, "at": ref["startedAt"] + 43 * MIN, "ref": "pay_8D2ZK91"}],
                                         "gateway": {"name": "Simulated gateway (demo)", "reference": "pay_8D2ZK91"}, "paymentMethod": "UPI",
                                         "refundedAmount": 0.0, "failureReason": None, "energyKwh": 26.2})
    sessions.append(store.get(SESSIONS, "PO-6A4K92"))

    weights = [3 if c["status"] != "offline" else 1 for c in live_conns]
    for n in range(230):
        conn = rng.choices(live_conns, weights)[0]
        age_days = min(44.9, rng.expovariate(1 / 16))
        started = now - int(age_days * DAY) - rng.randint(0, 20) * MIN
        if started > now - 30 * MIN:
            started -= HOUR
        code = clock.session_code()
        while store.get(SESSIONS, code):
            code = clock.session_code()
        # the Manesar C2 connector fails more often (feeds Charger Health + a fault-report ticket)
        force = "failed" if (conn["stationId"].endswith("manesar") and conn["label"] == "C2" and rng.random() < 0.4
                             and store.get(STATIONS, conn["stationId"])["sessionMode"] == "integrated") else None
        sessions.append(make_session(code, conn, rng.choice(users), started, force=force))

    # a deterministic fault story: Manesar C2 keeps failing (feeds Charger Health + its fault-report ticket)
    manesar_c2 = next(c for c in live_conns if c["id"] == f"{station_ids['ChargeZone Manesar']}-c2")
    for n in range(9):
        code = clock.session_code()
        while store.get(SESSIONS, code):
            code = clock.session_code()
        sessions.append(make_session(code, manesar_c2, rng.choice(users), now - (n + 1) * 28 * HOUR,
                                     force="failed" if n % 2 == 0 else "paid"))

    # derive connector health stats from the sessions (so Charger Health matches Transactions)
    for cid in {s["connectorId"] for s in sessions}:
        mine = [s for s in sessions if s["connectorId"] == cid]
        failed = [s for s in mine if s["paymentStatus"] == "failed"]
        recent = [s for s in failed if s["startedAt"] > now - 7 * DAY]
        recent_30 = [s for s in mine if s["startedAt"] > now - 30 * DAY]
        failed_30 = [s for s in failed if s["startedAt"] > now - 30 * DAY]
        store.update(CONNECTORS, cid, {"sessions30d": len(recent_30), "failedSessions30d": len(failed_30),
                                       "faults30d": len(failed_30) + (1 if len(failed_30) else 0), "recentFailures7d": len(recent)})

    # ----------------------------------------------------------------- restrictions --
    bad = users[7]
    store.update(USERS, bad, {"status": "restricted",
                              "restriction": {"reason": "Repeated chargebacks on three sessions", "by": "dev-support", "byName": "Isha Nair", "at": now - 12 * DAY},
                              "restrictionHistory": [{"action": "restricted", "reason": "Repeated chargebacks on three sessions", "by": "dev-support", "byName": "Isha Nair", "at": now - 12 * DAY}]})
    queue(now - 12 * DAY, "dev-support", "user.restrict", "user", bad, label="Imran A.", before={"status": "active"},
          after={"status": "restricted"}, reason="Repeated chargebacks on three sessions")

    # ------------------------------------------------------------------- tickets -----
    store.seed_counter("tickets", 1000)
    by_name = {s[0]: station_ids[s[0]] for s in STATIONS_SEED}
    for i, (cat, prio, status, subject, st_name, with_session, owner, age_h, note) in enumerate(TICKET_SEED):
        tid = f"TKT-{store.next_seq('tickets')}"
        sid = by_name[st_name]
        session = next((s for s in sessions if s["stationId"] == sid and s["paymentStatus"] != "external"), None) if with_session else None
        created = now - age_h * HOUR
        owner_admin = admins.get(owner) if owner else None
        notes = ([{"id": f"nt-{tid}", "body": note, "by": owner or "dev-ops", "byName": (owner_admin or {}).get("name", "Meera Iyer"),
                   "at": created + HOUR, "internal": True}] if note else [])
        store.create(TICKETS, tid, {
            "category": cat, "priority": prio, "status": status, "subject": subject, "description": None,
            "sessionId": session["id"] if session else None, "stationId": sid, "stationName": st_name,
            "userId": session["userId"] if session else None, "ownerId": owner, "ownerName": (owner_admin or {}).get("name"),
            "notes": notes, "resolvedAt": created + 20 * HOUR if status in ("resolved", "closed") else None, "source": "app" if with_session else "admin",
            "createdAt": created, "updatedAt": created + 2 * HOUR, "version": 1,
        })

    # ----------------------------------------------------------------- notifications --
    for kind, title, body, status, ago in [
        ("charger_outage", "Tata Power Jaipur Hub is temporarily offline", "Chargers at Tata Power Jaipur Hub are not responding. Please choose another station nearby.", "published", 4 * HOUR),
        ("service_message", "Scheduled maintenance on Sunday 2 AM", "Payments may be briefly unavailable for 20 minutes.", "draft", 2 * HOUR),
        ("faq", "How does the pre-authorisation hold work?", "A temporary hold is placed before charging and the unused amount is released after your session.", "published", 6 * DAY),
    ]:
        nid = clock.new_id("nt")
        store.create(NOTIFICATIONS, nid, {"kind": kind, "title": title, "body": body, "channels": ["in_app"], "audience": "all_users",
                                           "stationId": by_name["Tata Power Jaipur Hub"] if kind == "charger_outage" else None,
                                           "startsAt": None, "endsAt": None, "status": status,
                                           "publishedAt": now - ago if status == "published" else None, "createdAt": now - ago, "updatedAt": now - ago, "version": 1})

    recompute_visibility(store)

    # ------------------------------------------------- audit history (back-dated) -----
    for entry in tariff_log:
        queue(entry["at"], "dev-ops", "tariff.create", "station", entry["station"], label=f"{entry['name']} · {entry['label']}",
              before=None if entry["before"] is None else {"pricePerKwh": entry["before"]["pricePerKwh"]},
              after={"pricePerKwh": entry["after"]["pricePerKwh"], "effectiveFrom": entry["after"]["effectiveFrom"]}, reason=entry["after"]["reason"])
    queue(now - 40 * DAY, "dev-super", "admin.invite", "admin", "dev-finance2", label="Kavya Rao", after={"role": "finance"})
    queue(now - 35 * DAY, "dev-super", "admin.role_change", "admin", "dev-support", label="Isha Nair",
          before={"role": "operations"}, after={"role": "support"}, reason="Moved to the support desk")
    audit_queue.sort(key=lambda e: e["at"])
    for e in audit_queue:
        actor = pr(e.pop("actor")) or sup
        if actor is None:
            continue
        at = e.pop("at")
        audit.record(actor, e.pop("action"), e.pop("entity_type"), e.pop("entity_id"), at=at, **e)

    # -------------------------------------------- settlements via the real service ----
    if admins:
        finance, checker = pr("dev-finance"), pr("dev-finance2")
        from .schemas.money import SettlementPaid, SettlementRun

        older = settlements.run(store, finance, SettlementRun(periodStart=now - 45 * DAY, periodEnd=now - 15 * DAY))
        for i, doc in enumerate(older["created"]):
            if i % 3 == 0:
                continue  # leave some in review
            settlements.approve(store, checker, doc["id"])
            if i % 3 == 1:
                settlements.mark_paid(store, finance, doc["id"], SettlementPaid(payoutReference=f"UTR{2026100000 + i * 137}"))
        settlements.run(store, finance, SettlementRun(periodStart=now - 15 * DAY, periodEnd=now - 1 * DAY))

    # ---------------------------------------------------------- data-quality scan ----
    dataquality.scan(store)
    # a couple of historical, already-handled issues, so the screen shows both open and closed
    store.create("dq_issues", "dq-stale_status-history-1", {
        "type": "stale_status", "severity": "warning", "stationId": station_ids["Statiq Ghaziabad Raj Nagar"],
        "stationName": "Statiq Ghaziabad Raj Nagar", "title": "Stale charger status", "detail": "Status older than 30 min on: C2.",
        "status": "resolved", "detectedAt": now - 3 * DAY, "lastSeenAt": now - 3 * DAY + HOUR, "resolvedAt": now - 3 * DAY + 2 * HOUR,
        "resolution": {"action": "auto_cleared", "by": "system", "at": now - 3 * DAY + 2 * HOUR, "reason": "No longer detected."}})
